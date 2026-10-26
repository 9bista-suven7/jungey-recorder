// The see-through layer over a shared screen. Pen, highlighter, arrows, boxes, circles, emojis,
// numbered badges and a laser, drawn straight on top of whatever app you are showing.
// It lives in its own window, so it draws with that window's frames, not the (minimised) app's.
import { useEffect, useRef } from 'react';
import { constrainShape, drawItem } from '../engine/items';
import { glowDot } from '../engine/sprites';
import { clamp, uid } from '../lib/util';
import { BADGE, deskActions, useDesk, type DeskMark, type Stamp } from './state';
import { deskKey } from './DeskTools';

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
function drawMark(ctx: CanvasRenderingContext2D, m: DeskMark, dpr: number, live = false) {
  if (m.kind === 'stamp') return;
  ctx.save();
  if (!(m.kind === 'stroke' && m.pen === 'highlighter')) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4 * dpr;
    ctx.shadowOffsetY = dpr;
  }
  drawItem(ctx, m, { scale: dpr, ox: 0, oy: 0 }, false, undefined, live);
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
    // Finished strokes and shapes, redrawn only when they change.
    const cache = c.ownerDocument.createElement('canvas');
    const cctx = cache.getContext('2d')!;
    let dpr = 1;
    let cached: DeskMark[] | null = null;
    let live: DeskMark | null = null;
    let start: { x: number; y: number } | null = null;
    const laser: { x: number; y: number; t: number }[] = [];
    let raf = 0;

    const kick = () => {
      if (!raf) raf = view.requestAnimationFrame(frame);
    };

    function frame() {
      raf = 0;
      const now = performance.now();
      const s = useDesk.getState();
      if (s.marks !== cached) {
        cctx.setTransform(1, 0, 0, 1, 0, 0);
        cctx.clearRect(0, 0, cache.width, cache.height);
        for (const m of s.marks) drawMark(cctx, m, dpr);
        cached = s.marks;
      }
      let animating = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalAlpha = s.clearing ? clamp(1 - (now - s.clearing) / 250, 0, 1) : 1;
      if (s.clearing) animating = true;
      ctx.drawImage(cache, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const m of s.marks) {
        if (m.kind !== 'stamp') continue;
        drawStamp(ctx, m, now);
        if (now - m.born < POP_MS) animating = true;
      }
      ctx.globalAlpha = 1;
      if (live?.kind === 'stamp') {
        drawStamp(ctx, live, now);
        if (now - live.born < POP_MS) animating = true;
      } else if (live) {
        drawMark(ctx, live, dpr, true);
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
      c.width = cache.width = Math.round(view.innerWidth * dpr);
      c.height = cache.height = Math.round(view.innerHeight * dpr);
      cached = null;
      kick();
    };

    const cursor = () => {
      const t = useDesk.getState().tool;
      c.style.cursor = t === 'laser' ? 'none' : t === 'mouse' ? 'default' : 'crosshair';
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const s = useDesk.getState();
      const x = e.clientX, y = e.clientY;
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
        for (const ev of e.getCoalescedEvents?.() ?? [e]) live.points.push(ev.clientX, ev.clientY, ev.pointerType === 'pen' ? ev.pressure : 0.5);
      } else if (live.kind === 'shape') {
        const p = e.shiftKey ? constrainShape(live, e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
        live = { ...live, x2: p.x, y2: p.y };
      } else if (start) {
        // Drag while stamping to make it bigger.
        const d = Math.hypot(e.clientX - start.x, e.clientY - start.y);
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
    view.addEventListener('keydown', deskKey);
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    const unsub = useDesk.subscribe(() => {
      cursor();
      kick();
    });
    return () => {
      unsub();
      view.removeEventListener('resize', resize);
      view.removeEventListener('keydown', deskKey);
      if (raf) view.cancelAnimationFrame(raf);
    };
  }, []);
  return <canvas ref={ref} className="ink-layer" />;
}

export const INK_CSS = `
html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; }
.ink-layer { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; touch-action: none; }
`;
