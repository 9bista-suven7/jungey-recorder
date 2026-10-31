// The see-through layer over a shared screen. Pen, highlighter, arrows, boxes, circles, emojis,
// numbered badges and a laser, drawn straight on top of whatever app you are showing.
// It lives in its own window, so it draws with that window's frames, not the (minimised) app's.
import { useEffect, useRef } from 'react';
import { constrainShape, drawItem } from '../engine/items';
import { glowDot } from '../engine/sprites';
import { clamp, uid } from '../lib/util';
import { BADGE, deskActions, useDesk, type DeskMark, type Stamp } from './state';
import { deskKey } from './DeskTools';
import { bridge } from '../platform';

const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const PEN = 6;
const HIGHLIGHTER = 28;
const SHAPE = 5;
const LASER_LIFE = 650;
const POP_MS = 420;

const outBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

/** Stamps pop in. Expects a CSS-pixel transform. */
function drawStamp(ctx: CanvasRenderingContext2D, s: Stamp, now: number) {
  const q = clamp((now - s.born) / POP_MS, 0, 1);
  const k = 0.35 + 0.65 * outBack(q);
  ctx.save();
  ctx.globalAlpha *= clamp(q * 3, 0, 1);
  ctx.translate(s.x, s.y);
  ctx.scale(k, k);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (s.badge) {
    const r = s.size / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = s.badge;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = Math.max(2.5, r * 0.12);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    const light = s.badge === '#ffffff' || s.badge === '#ffcc00';
    ctx.fillStyle = light ? '#111' : '#fff';
    ctx.font = `800 ${Math.round(r * (s.text.length > 1 ? 0.95 : 1.1))}px Inter, system-ui, sans-serif`;
    ctx.fillText(s.text, 0, r * 0.06);
  } else {
    ctx.font = `${Math.round(s.size)}px ${EMOJI_FONT}`;
    ctx.fillText(s.text, 0, s.size * 0.05);
  }
  ctx.restore();
}

/** Strokes and shapes, with a faint shadow so they read on any background. */
function drawMark(ctx: CanvasRenderingContext2D, m: DeskMark, dpr: number, live = false, off = { x: 0, y: 0 }) {
  if (m.kind === 'stamp') return;
  ctx.save();
  if (!(m.kind === 'stroke' && m.pen === 'highlighter')) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4 * dpr;
    ctx.shadowOffsetY = dpr;
  }
  drawItem(ctx, m, { scale: dpr, ox: off.x * dpr, oy: off.y * dpr }, false, undefined, live);
  ctx.restore();
}

/** Same look as the board's laser. Expects a CSS-pixel transform. */
function drawLaser(ctx: CanvasRenderingContext2D, pts: { x: number; y: number; t: number }[], now: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (let i = 1; i < pts.length; i++) {
      const a = 1 - (now - pts[i].t) / LASER_LIFE;
      ctx.strokeStyle = pass ? `rgba(255,${60 + 120 * a},${80 + 40 * a},${a})` : `rgba(255,30,60,${0.3 * a})`;
      ctx.lineWidth = (3 + 7 * a) * (pass ? 1 : 2.6);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }
  const head = pts[pts.length - 1];
  const a = Math.max(0, 1 - (now - head.t) / LASER_LIFE);
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

export function InkLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const view = c.ownerDocument.defaultView!;
    const ctx = c.getContext('2d')!;
    // Finished strokes and shapes, redrawn only when they change: marks in the scrolling panel
    // (hidden past its edges) and the rest.
    const cache = c.ownerDocument.createElement('canvas');
    const cctx = cache.getContext('2d')!;
    const other = c.ownerDocument.createElement('canvas');
    const octx = other.getContext('2d')!;
    let dpr = 1;
    let cached: DeskMark[] | null = null;
    let cachedArea: unknown = null;
    let cachedOffset = { x: 0, y: 0 };
    /** Where the marks are shown: glides toward the tracked offset, so they move smoothly. */
    let shown = { x: 0, y: 0 };
    let lastFrame = performance.now();
    let live: DeskMark | null = null;
    let start: { x: number; y: number } | null = null;
    const laser: { x: number; y: number; t: number }[] = [];
    let raf = 0;

    const kick = () => {
      if (!raf) raf = view.requestAnimationFrame(frame);
    };

    /** Is this mark in the panel that scrolls (judged by where its middle is now)? */
    const inArea = (m: DeskMark, area: { x: number; y: number; w: number; h: number } | null, off: { x: number }) => {
      if (!area) return false;
      const cx = m.kind === 'stroke' ? (Math.min(...m.points.filter((_, i) => i % 3 === 0)) + Math.max(...m.points.filter((_, i) => i % 3 === 0))) / 2
        : m.kind === 'shape' ? (m.x1 + m.x2) / 2 : m.x;
      return cx + off.x >= area.x && cx + off.x <= area.x + area.w;
    };

    function frame() {
      raf = 0;
      const now = performance.now();
      const s = useDesk.getState();
      const H = c.height / dpr;
      let animating = false;

      // Glide toward where the page is (a jump of most of a screen snaps).
      const target = s.offset;
      const gx = target.x - shown.x, gy = target.y - shown.y;
      if (Math.abs(gy) > H * 0.6 || Math.abs(gx) > 400 || (Math.abs(gx) < 0.3 && Math.abs(gy) < 0.3)) shown = { ...target };
      else {
        const k = 1 - Math.exp(-Math.min(64, now - lastFrame) / 55);
        shown = { x: shown.x + gx * k, y: shown.y + gy * k };
        animating = true;
      }
      lastFrame = now;
      const off = shown;

      // The caches are three screens tall (one above, one below), drawn at `cachedOffset`; while
      // the page scrolls they just slide, and are drawn again only when the marks change, the
      // page moves sideways, or they have slid most of a screen.
      const slide = { x: off.x - cachedOffset.x, y: off.y - cachedOffset.y };
      if (s.marks !== cached || s.area !== cachedArea || Math.abs(slide.x) > 0.5 || Math.abs(slide.y) > H * 0.8) {
        for (const g of [cctx, octx]) {
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.clearRect(0, 0, cache.width, cache.height);
        }
        const at = { x: Math.round(off.x), y: Math.round(off.y) + H };
        for (const m of s.marks) drawMark(inArea(m, s.area, off) ? cctx : octx, m, dpr, false, at);
        cached = s.marks;
        cachedArea = s.area;
        cachedOffset = { x: Math.round(off.x), y: Math.round(off.y) };
        slide.x = off.x - cachedOffset.x;
        slide.y = off.y - cachedOffset.y;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalAlpha = s.clearing ? clamp(1 - (now - s.clearing) / 250, 0, 1) : 1;
      if (s.clearing) animating = true;
      const dy = Math.round((slide.y - H) * dpr);
      ctx.drawImage(other, 0, dy);
      // Marks in the scrolling panel go out of sight at its edges, like the page does.
      const a = s.area;
      const clipTo = () => {
        ctx.beginPath();
        ctx.rect(a!.x * dpr, a!.y * dpr, a!.w * dpr, a!.h * dpr);
        ctx.clip();
      };
      ctx.save();
      if (a) clipTo();
      ctx.drawImage(cache, 0, dy);
      ctx.restore();
      for (const clipped of [false, true]) {
        ctx.save();
        if (clipped && a) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          clipTo();
        }
        ctx.setTransform(dpr, 0, 0, dpr, off.x * dpr, off.y * dpr);
        for (const m of s.marks) {
          if (m.kind !== 'stamp' || inArea(m, a, off) !== clipped) continue;
          drawStamp(ctx, m, now);
          if (now - m.born < POP_MS) animating = true;
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr, 0, 0, dpr, off.x * dpr, off.y * dpr);
      if (live?.kind === 'stamp') {
        drawStamp(ctx, live, now);
        if (now - live.born < POP_MS) animating = true;
      } else if (live) {
        drawMark(ctx, live, dpr, true, off);
      }
      while (laser.length && now - laser[0].t > LASER_LIFE) laser.shift();
      if (laser.length) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawLaser(ctx, laser, now);
        animating = true;
      }
      if (animating) kick();
    }

    const resize = () => {
      dpr = view.devicePixelRatio || 1;
      c.width = cache.width = other.width = Math.round(view.innerWidth * dpr);
      c.height = Math.round(view.innerHeight * dpr);
      cache.height = other.height = c.height * 3;
      cached = null;
      kick();
    };

    const cursor = () => {
      const t = useDesk.getState().tool;
      c.style.cursor = t === 'laser' ? 'none' : t === 'mouse' ? 'default' : 'crosshair';
    };

    // Where a screen point is on the page (marks are kept in page space).
    const page = (cx: number, cy: number) => {
      const o = useDesk.getState().offset;
      return [cx - o.x, cy - o.y];
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const s = useDesk.getState();
      const [x, y] = page(e.clientX, e.clientY);
      c.setPointerCapture(e.pointerId);
      switch (s.tool) {
        case 'pen':
        case 'highlighter':
          live = {
            id: uid(), kind: 'stroke', pen: s.tool, color: s.color, size: s.tool === 'pen' ? PEN : HIGHLIGHTER,
            points: [x, y, e.pointerType === 'pen' ? e.pressure : 0.5], pressure: e.pointerType === 'pen',
          };
          break;
        case 'arrow':
        case 'rect':
        case 'ellipse':
          live = { id: uid(), kind: 'shape', shape: s.tool, color: s.color, size: SHAPE, x1: x, y1: y, x2: x, y2: y };
          break;
        case 'stamp': {
          const badge = s.stamp === BADGE;
          live = {
            id: uid(), kind: 'stamp', x, y, size: badge ? 56 : 76, text: badge ? String(s.nextBadge) : s.stamp,
            badge: badge ? s.color : null, born: performance.now(),
          };
          start = { x, y };
          break;
        }
        case 'laser':
          laser.push({ x, y, t: performance.now() });
          break;
      }
      kick();
    };

    const move = (e: PointerEvent) => {
      const s = useDesk.getState();
      if (s.tool === 'laser') {
        laser.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (laser.length > 400) laser.splice(0, laser.length - 400);
        return kick();
      }
      if (!live) return;
      if (live.kind === 'stroke') {
        for (const ev of e.getCoalescedEvents?.() ?? [e]) {
          const [px, py] = page(ev.clientX, ev.clientY);
          live.points.push(px, py, ev.pointerType === 'pen' ? ev.pressure : 0.5);
        }
      } else if (live.kind === 'shape') {
        const [px, py] = page(e.clientX, e.clientY);
        const p = e.shiftKey ? constrainShape(live, px, py) : { x: px, y: py };
        live = { ...live, x2: p.x, y2: p.y };
      } else if (start) {
        // Drag while stamping to make it bigger.
        const [px, py] = page(e.clientX, e.clientY);
        const d = Math.hypot(px - start.x, py - start.y);
        if (d > 12) live = { ...live, size: clamp(d * 2, 32, 520) };
      }
      kick();
    };

    const up = () => {
      const m = live;
      live = null;
      start = null;
      if (!m) return;
      const stray = m.kind === 'shape' && Math.hypot(m.x2 - m.x1, m.y2 - m.y1) < 6;
      if (!stray) deskActions.add(m);
      kick();
    };

    resize();
    cursor();
    view.addEventListener('resize', resize);
    // Clicking to draw gives this window the keyboard: Esc, Ctrl+Z and tool keys work here too.
    // In pointer mode the keyboard belongs to your apps, so nothing is acted on here.
    const key = (e: KeyboardEvent) => useDesk.getState().tool !== 'mouse' && deskKey(e);
    view.addEventListener('keydown', key);
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    // Scrolling while drawing: the app gets these notches back (see the main process).
    const wheel = (e: WheelEvent) => bridge.desk?.wheel({ x: e.deltaX, y: e.deltaY });
    c.addEventListener('wheel', wheel, { passive: true });
    const unsub = useDesk.subscribe(() => {
      cursor();
      kick();
    });
    return () => {
      unsub();
      view.removeEventListener('resize', resize);
      view.removeEventListener('keydown', key);
      if (raf) view.cancelAnimationFrame(raf);
    };
  }, []);
  return <canvas ref={ref} className="ink-layer" />;
}

export const INK_CSS = `
html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; }
.ink-layer { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; touch-action: none; }
`;
