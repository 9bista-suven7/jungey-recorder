// Paints the final frame (board, screen or camera + ink + laser + camera bubble) onto one canvas.
// That canvas is both what the user sees and what gets recorded: no tool UI ever lands in the video.
import { useStore, currentPage } from '../store';
import { media } from './media';
import { getBoardStyle, paletteFor, STAGE_SIZE, type BoardStyle } from '../lib/boards';
import { computeLayout, fitView, viewXform, type CamPlacement, type Rect, type SceneLayout, type Xform } from './layout';
import { drawItem, itemBBox } from './items';
import { makeBoardTexture, makeGrain } from './textures';
import { blurSprite, glowDot } from './sprites';
import { drawDiagram, drawDiagramStatic } from '../diagram/render';
import { liveNodes, useDiagramUI } from '../diagram/ui';
import { boundsOf } from '../diagram/geometry';
import { presented } from '../diagram/steps';
import type { DiagramNode, EnterKind, FxKind, Item, Page, Pattern, View } from '../types';

const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const lerpView = (a: View, b: View, k: number): View => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, zoom: a.zoom + (b.zoom - a.zoom) * k });

/** Boxes involved in a step (plus the ends of its arrows), to zoom the camera onto. */
function stepFocus(page: Page, step: number): DiagramNode[] {
  const nodes = page.nodes ?? [];
  if (step <= 0) return nodes;
  const at = (x: { step?: number; fx?: { step: number }[] }) => x.step === step || !!x.fx?.some((f) => f.step === step);
  const ids = new Set(nodes.filter(at).map((n) => n.id));
  for (const e of page.edges ?? []) {
    if (at(e) || ids.has(e.to)) {
      ids.add(e.from);
      ids.add(e.to);
    }
  }
  return nodes.filter((n) => ids.has(n.id));
}

const images = new Map<string, HTMLImageElement>();

export function getImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    images.set(src, img);
  }
  if (img.complete && img.naturalWidth) return img;
  if (onLoad) img.addEventListener('load', onLoad, { once: true });
  return null;
}

function canvas2d(w = 1, h = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function drawCover(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, r: Rect, mirror: boolean) {
  const sw = v.videoWidth, sh = v.videoHeight;
  const scale = Math.max(r.w / sw, r.h / sh);
  const cw = r.w / scale, ch = r.h / scale;
  const cx = (sw - cw) / 2;
  const cy = (sh - ch) * 0.4; // faces sit a bit above centre
  ctx.save();
  if (mirror) {
    ctx.translate(r.x * 2 + r.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(v, cx, cy, cw, ch, r.x, r.y, r.w, r.h);
  ctx.restore();
}

function drawContain(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, r: Rect) {
  const s = Math.min(r.w / v.videoWidth, r.h / v.videoHeight);
  const w = v.videoWidth * s, h = v.videoHeight * s;
  ctx.drawImage(v, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
}

function camPath(c: CamPlacement) {
  const p = new Path2D();
  const r = c.rect;
  if (c.circle) p.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2);
  else p.roundRect(r.x, r.y, r.w, r.h, c.radius);
  return p;
}

class Compositor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ink: HTMLCanvasElement;
  private inkCtx: CanvasRenderingContext2D;
  private scratch: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D;
  private bgKey = '';
  /** Pointer is down: render every display frame for the smoothest drawing. */
  fast = false;
  private grain: CanvasPattern | null = null;
  private textures = new Map<string, HTMLCanvasElement>();
  private inkKey = '';
  private inkItems: Item[] | null = null;

  W = 0;
  H = 0;
  layout: SceneLayout | null = null;
  xform: Xform = { scale: 1, ox: 0, oy: 0 };
  /** The stroke or shape being drawn right now. */
  live: Item | null = null;
  /** Items the eraser has touched during the current drag (hidden until committed). */
  erasing = new Set<string>();
  erasingVersion = 0;
  fontsVersion = 0;
  /** A one-off animation preview while editing (picked from the Animate menu). */
  preview: { ids: string[]; kind: EnterKind | FxKind; start: number } | null = null;
  private follow: { key: string; from: View; to: View; start: number } | null = null;
  private shownView: View | null = null;
  private laser: { x: number; y: number; t: number }[] = [];

  constructor() {
    [this.canvas, this.ctx] = canvas2d() as [HTMLCanvasElement, CanvasRenderingContext2D];
    this.canvas.className = 'stage-canvas';
    [this.ink, this.inkCtx] = canvas2d();
    [this.scratch, this.sctx] = canvas2d();
    [this.bg, this.bgCtx] = canvas2d();
  }

  addLaser(x: number, y: number) {
    this.laser.push({ x, y, t: performance.now() });
    if (this.laser.length > 400) this.laser.splice(0, this.laser.length - 400);
  }

  private ensureSize(W: number, H: number) {
    if (this.W === W && this.H === H) return;
    this.W = W;
    this.H = H;
    for (const c of [this.canvas, this.ink, this.scratch, this.bg]) {
      c.width = W;
      c.height = H;
    }
    this.inkKey = '';
    this.bgKey = '';
  }

  private texture(style: BoardStyle) {
    const key = `${style.id}:${this.W}x${this.H}`;
    let t = this.textures.get(key);
    if (!t) {
      t = makeBoardTexture(style, this.W, this.H);
      this.textures.set(key, t);
    }
    return t;
  }

  private applyGrain(ctx: CanvasRenderingContext2D, r: Rect) {
    this.grain ??= this.ctx.createPattern(makeGrain(), 'repeat');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = this.grain!;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  private screenBox(item: Item, t: Xform): Rect | null {
    const b = itemBBox(item);
    const x = Math.max(0, Math.floor(b.x * t.scale + t.ox) - 4);
    const y = Math.max(0, Math.floor(b.y * t.scale + t.oy) - 4);
    const x2 = Math.min(this.W, Math.ceil((b.x + b.w) * t.scale + t.ox) + 4);
    const y2 = Math.min(this.H, Math.ceil((b.y + b.h) * t.scale + t.oy) + 4);
    return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
  }

  /** Chalk items go through the scratch canvas so only their own pixels get grain. */
  private drawGrained(target: CanvasRenderingContext2D, item: Item, t: Xform, dark: boolean, palette: string[], live: boolean) {
    const box = this.screenBox(item, t);
    if (!box) return;
    this.sctx.clearRect(box.x, box.y, box.w, box.h);
    drawItem(this.sctx, item, t, dark, palette, live);
    this.applyGrain(this.sctx, box);
    target.drawImage(this.scratch, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
  }

  private updateInk(page: Page, t: Xform, R: Rect, chalk: boolean, dark: boolean, palette: string[], hiddenId: string) {
    const items = page.items;
    const key = [page.id, t.scale, t.ox, t.oy, R.x, R.y, R.w, R.h, chalk, dark, palette[0], this.W, this.H, this.erasingVersion, this.fontsVersion, hiddenId].join('|');
    if (key === this.inkKey && items === this.inkItems) return;

    const prev = this.inkItems;
    const appended =
      key === this.inkKey && prev && items.length === prev.length + 1 && (prev.length === 0 || items[items.length - 2] === prev[prev.length - 1]);

    if (appended) {
      const it = items[items.length - 1];
      if (chalk) this.drawGrained(this.inkCtx, it, t, dark, palette, false);
      else drawItem(this.inkCtx, it, t, dark, palette);
    } else {
      this.inkCtx.clearRect(0, 0, this.W, this.H);
      for (const it of items) {
        if (it.id !== hiddenId && !this.erasing.has(it.id)) drawItem(this.inkCtx, it, t, dark, palette);
      }
      if (chalk) this.applyGrain(this.inkCtx, { x: 0, y: 0, w: this.W, h: this.H });
    }
    this.inkKey = key;
    this.inkItems = items;
  }

  private drawPattern(ctx: CanvasRenderingContext2D, R: Rect, t: Xform, style: BoardStyle, pattern: Pattern) {
    if (pattern === 'none') return;
    const gap = pattern === 'lines' ? 72 : 60;
    if (gap * t.scale < 8) return;
    const x0 = (R.x - t.ox) / t.scale, x1 = (R.x + R.w - t.ox) / t.scale;
    const y0 = (R.y - t.oy) / t.scale, y1 = (R.y + R.h - t.oy) / t.scale;
    const sx = (x: number) => Math.round(x * t.scale + t.ox) + 0.5;
    const sy = (y: number) => Math.round(y * t.scale + t.oy) + 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
    ctx.strokeStyle = ctx.fillStyle = style.line;
    ctx.lineWidth = Math.max(1, 1.5 * t.scale);
    ctx.beginPath();
    if (pattern === 'grid') {
      for (let x = Math.ceil(x0 / gap) * gap; x <= x1; x += gap) {
        ctx.moveTo(sx(x), R.y);
        ctx.lineTo(sx(x), R.y + R.h);
      }
      for (let y = Math.ceil(y0 / gap) * gap; y <= y1; y += gap) {
        ctx.moveTo(R.x, sy(y));
        ctx.lineTo(R.x + R.w, sy(y));
      }
      ctx.stroke();
    } else if (pattern === 'lines') {
      for (let y = Math.ceil(y0 / gap) * gap; y <= y1; y += gap) {
        ctx.moveTo(R.x, sy(y));
        ctx.lineTo(R.x + R.w, sy(y));
      }
      ctx.stroke();
      ctx.strokeStyle = style.dark ? 'rgba(255,140,140,0.22)' : 'rgba(220,70,70,0.3)';
      ctx.beginPath();
      ctx.moveTo(sx(150), R.y);
      ctx.lineTo(sx(150), R.y + R.h);
      ctx.stroke();
    } else {
      const r = Math.max(1.4, 2.6 * t.scale);
      for (let x = Math.ceil(x0 / gap) * gap; x <= x1; x += gap) {
        for (let y = Math.ceil(y0 / gap) * gap; y <= y1; y += gap) {
          ctx.moveTo(x * t.scale + t.ox + r, y * t.scale + t.oy);
          ctx.arc(x * t.scale + t.ox, y * t.scale + t.oy, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
    ctx.restore();
  }

  /** Redraws the cached background only when the board, paper, slide or view changes. */
  private updateBackground(style: BoardStyle, pattern: Pattern, page: Page, t: Xform, R: Rect) {
    const img = page.bg ? getImage(page.bg.src) : null;
    const key = [style.id, pattern, page.id, page.bg?.src.slice(-40), !!img, t.scale, t.ox, t.oy, R.x, R.y, R.w, R.h, this.W, this.H].join('|');
    if (key === this.bgKey) return;
    this.bgKey = key;
    this.bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.bgCtx.drawImage(this.texture(style), 0, 0);
    this.drawPattern(this.bgCtx, R, t, style, pattern);
    this.drawPageImage(this.bgCtx, page, t, R);
  }

  private drawPageImage(ctx: CanvasRenderingContext2D, page: Page, t: Xform, R: Rect) {
    if (!page.bg) return;
    const img = getImage(page.bg.src);
    if (!img) return;
    const s = Math.min(this.W / page.bg.w, this.H / page.bg.h) * 0.96;
    const w = page.bg.w * s, h = page.bg.h * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
    ctx.setTransform(t.scale, 0, 0, t.scale, t.ox, t.oy);
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 18;
    ctx.drawImage(img, (this.W - w) / 2, (this.H - h) / 2, w, h);
    ctx.restore();
  }

  private drawLaser(ctx: CanvasRenderingContext2D, now: number) {
    const life = 650;
    while (this.laser.length && now - this.laser[0].t > life) this.laser.shift();
    const pts = this.laser;
    if (!pts.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Soft outer line, then the bright core (cheaper than a blurred shadow per segment).
    for (const pass of [0, 1]) {
      for (let i = 1; i < pts.length; i++) {
        const a = 1 - (now - pts[i].t) / life;
        ctx.strokeStyle = pass ? `rgba(255,${60 + 120 * a},${80 + 40 * a},${a})` : `rgba(255,30,60,${0.3 * a})`;
        ctx.lineWidth = (3 + 9 * a) * (pass ? 1 : 2.6);
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
    const head = pts[pts.length - 1];
    const a = 1 - (now - head.t) / life;
    const halo = glowDot('rgb(255,40,70)', 9);
    ctx.globalAlpha = a;
    ctx.drawImage(halo, head.x - halo.width / 2, head.y - halo.height / 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255,70,90,${a})`;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawCam(ctx: CanvasRenderingContext2D, c: CamPlacement, mirror: boolean) {
    const path = camPath(c);
    const r = c.rect;
    const shadow = blurSprite(c.circle ? 'cam-circle' : `cam-${Math.round(c.radius)}`, r.w, r.h, 28, 'rgba(0,0,0,0.4)', (g) =>
      c.circle ? g.arc(r.w / 2, r.h / 2, r.w / 2, 0, Math.PI * 2) : g.roundRect(0, 0, r.w, r.h, c.radius),
    );
    ctx.drawImage(shadow.img, r.x - shadow.pad, r.y - shadow.pad + 8);
    ctx.fillStyle = '#111318';
    ctx.fill(path);
    if (media.camReady) {
      ctx.save();
      ctx.clip(path);
      drawCover(ctx, media.camVideo, c.rect, mirror);
      ctx.restore();
    }
    if (c.movable) {
      ctx.save();
      ctx.lineWidth = Math.max(4, c.rect.h * 0.022);
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.stroke(path);
      ctx.restore();
    }
  }

  render(now: number) {
    const s = useStore.getState();
    const p = s.project;
    if (!p) return;
    if (this.preview && (s.presenting || now - this.preview.start > 1800)) this.preview = null;
    const page = currentPage(s) ?? p.pages[0];
    const [W, H] = STAGE_SIZE[p.settings.aspect];
    this.ensureSize(W, H);
    const style = getBoardStyle(p.settings.boardStyle);
    const L = computeLayout(p.settings.layout, W, H, p.settings.bubble);
    const view = this.cameraView(page, L.region, W, H, now);
    const t = viewXform(L.region, W, H, view);
    this.layout = L;
    this.xform = t;

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 1. Background (board texture, paper pattern and slide image are cached together)
    if (L.bg === 'board') {
      this.updateBackground(style, p.settings.pattern, page, t, L.region);
      ctx.drawImage(this.bg, 0, 0);
    } else if (L.bg === 'screen') {
      ctx.fillStyle = '#0c0d11';
      ctx.fillRect(0, 0, W, H);
      if (media.screenReady) drawContain(ctx, media.screenVideo, L.region);
    } else {
      ctx.fillStyle = '#0b0c0f';
      ctx.fillRect(0, 0, W, H);
      if (media.camReady) drawCover(ctx, media.camVideo, L.region, s.mirror);
    }

    // 2. Diagram (under the ink, so you can circle things while explaining)
    const dark = L.bg !== 'board' || style.dark;
    if (page.nodes?.length) {
      const d = s.presenting ? presented(page, p.settings.reveal ?? true) : { nodes: page.nodes, edges: page.edges ?? [] };
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.region.x, L.region.y, L.region.w, L.region.h);
      ctx.clip();
      drawDiagram(ctx, t, {
        nodes: liveNodes(d.nodes),
        edges: d.edges,
        dark,
        spotlight: p.settings.spotlight ?? true,
        now,
        presenting: s.presenting,
        step: s.stepAt,
        since: s.stepChangedAt ? now - s.stepChangedAt : Infinity,
        preview: this.preview,
        editing: useDiagramUI.getState().editing,
      });
      ctx.restore();
    }

    // 3. Ink
    const chalk = L.bg === 'board' && style.chalk;
    const palette = paletteFor(p.settings);
    this.updateInk(page, t, L.region, chalk, dark, palette, s.textDraft?.replaceId ?? '');
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.region.x, L.region.y, L.region.w, L.region.h);
    ctx.clip();
    if (page.items.length) ctx.drawImage(this.ink, 0, 0);
    if (this.live) {
      if (chalk) this.drawGrained(ctx, this.live, t, dark, palette, true);
      else drawItem(ctx, this.live, t, dark, palette, true);
    }
    ctx.restore();

    // 4. Laser pointer
    this.drawLaser(ctx, now);

    // 5. Camera
    if (L.cam && (media.camReady || !L.cam.movable)) this.drawCam(ctx, L.cam, s.mirror);
  }

  /** The page view, or a smooth zoom onto the current step when "Zoom to each step" is on. */
  private cameraView(page: Page, R: Rect, W: number, H: number, now: number): View {
    const s = useStore.getState();
    if (!s.presenting || !s.project?.settings.followSteps || !page.nodes?.length) {
      this.follow = null;
      this.shownView = page.view;
      return page.view;
    }
    const key = `${page.id}:${s.stepAt}`;
    if (this.follow?.key !== key) {
      const d = presented(page, s.project.settings.reveal ?? true);
      const b = boundsOf(stepFocus({ ...page, ...d }, s.stepAt));
      const to = b ? fitView(b, R, W, H, s.stepAt ? 160 : 90, 1.8) : page.view;
      this.follow = { key, from: this.shownView ?? page.view, to, start: now };
    }
    const k = ease(Math.min(1, (now - this.follow.start) / 750));
    this.shownView = lerpView(this.follow.from, this.follow.to, k);
    return this.shownView;
  }
}

export const compositor = new Compositor();

/**
 * Drives `fn` every frame. requestAnimationFrame gives smooth drawing while the window is on
 * screen; a worker timer takes over whenever frames stop coming (window hidden, covered or
 * minimised), so a recording never freezes.
 */
export function startLoop(fn: (now: number) => void, minGap: () => number = () => 0) {
  let raf = 0;
  let stopped = false;
  let last = 0;
  let reported = false;
  const frame = (now: number) => {
    last = performance.now();
    try {
      fn(now);
    } catch (err) {
      if (!reported) console.error('render failed', err);
      reported = true;
    }
  };
  const tick = (now: number) => {
    if (stopped) return;
    // A little slack so a 30 fps cap lands on every other 60 Hz frame.
    if (performance.now() - last >= minGap() - 4) frame(now);
    raf = requestAnimationFrame(tick);
  };
  const worker = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'], { type: 'text/javascript' })));
  worker.onmessage = () => {
    if (!stopped && performance.now() - last > 60) frame(performance.now());
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    worker.terminate();
  };
}

/** Small preview of a page for the page strip and the home screen. */
export function renderThumb(canvas: HTMLCanvasElement, page: Page, styleId: Parameters<typeof getBoardStyle>[0], W: number, H: number, redraw: () => void) {
  const ctx = canvas.getContext('2d')!;
  const style = getBoardStyle(styleId);
  const s = canvas.width / W;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (page.bg) {
    const img = getImage(page.bg.src, redraw);
    if (img) {
      const k = Math.min(W / page.bg.w, H / page.bg.h) * 0.96 * s;
      ctx.drawImage(img, (canvas.width - page.bg.w * k) / 2, (canvas.height - page.bg.h * k) / 2, page.bg.w * k, page.bg.h * k);
    }
  }
  drawDiagramStatic(ctx, { scale: s, ox: 0, oy: 0 }, page.nodes ?? [], page.edges ?? [], style.dark, redraw);
  for (const it of page.items) drawItem(ctx, it, { scale: s, ox: 0, oy: 0 }, style.dark, style.palette);
}
