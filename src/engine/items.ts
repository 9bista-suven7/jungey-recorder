// Drawing, measuring and hit-testing board items. Items are immutable, so derived data is cached per object.
import { getStroke } from 'perfect-freehand';
import type { Item, ShapeItem, StrokeItem, TextItem } from '../types';
import type { Rect, Xform } from './layout';
import { adaptColor } from '../lib/boards';

export const TEXT_FONT = (size: number) => `600 ${size}px Caveat, "Comic Sans MS", cursive`;
export const TEXT_LINE = 1.12;

const pathCache = new WeakMap<StrokeItem, Path2D>();
const measureCtx = document.createElement('canvas').getContext('2d')!;

function strokeOutline(item: StrokeItem, finished: boolean) {
  const pts: number[][] = [];
  for (let i = 0; i < item.points.length; i += 3) pts.push([item.points[i], item.points[i + 1], item.points[i + 2]]);
  const hl = item.pen === 'highlighter';
  return getStroke(pts, {
    size: item.size,
    thinning: hl ? 0 : item.pressure ? 0.6 : 0.45,
    smoothing: 0.55,
    streamline: hl ? 0.6 : 0.42,
    simulatePressure: !hl && !item.pressure,
    last: finished,
  });
}

function outlineToPath(outline: number[][]) {
  const p = new Path2D();
  if (outline.length < 2) return p;
  p.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    p.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  p.closePath();
  return p;
}

/** `live` strokes are still growing, so they are not cached. */
export function strokePath(item: StrokeItem, live = false): Path2D {
  if (live) return outlineToPath(strokeOutline(item, false));
  let p = pathCache.get(item);
  if (!p) {
    p = outlineToPath(strokeOutline(item, true));
    pathCache.set(item, p);
  }
  return p;
}

function drawShape(ctx: CanvasRenderingContext2D, s: ShapeItem) {
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const { x1, y1, x2, y2 } = s;
  switch (s.shape) {
    case 'line':
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      break;
    case 'arrow': {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const head = Math.min(Math.max(s.size * 3.4, 22), len * 0.45);
      const a = Math.atan2(y2 - y1, x2 - x1);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.moveTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
      break;
    }
    case 'rect': {
      const x = Math.min(x1, x2), y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      ctx.roundRect(x, y, w, h, Math.min(s.size * 1.2, w / 2, h / 2));
      break;
    }
    case 'ellipse':
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      break;
  }
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, t: TextItem) {
  ctx.font = TEXT_FONT(t.size);
  ctx.textBaseline = 'top';
  t.text.split('\n').forEach((line, i) => ctx.fillText(line, t.x, t.y + i * t.size * TEXT_LINE));
}

/**
 * Draw an item with the page→frame transform. `dark` = light ink on a dark background.
 * With a palette, palette colours are swapped for the same slot in that palette.
 */
export function drawItem(ctx: CanvasRenderingContext2D, item: Item, t: Xform, dark: boolean, palette?: string[], live = false) {
  ctx.save();
  ctx.setTransform(t.scale, 0, 0, t.scale, t.ox, t.oy);
  const color = palette ? adaptColor(item.color, palette) : item.color;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (item.kind === 'stroke') {
    if (item.pen === 'highlighter') ctx.globalAlpha = dark ? 0.42 : 0.34;
    ctx.fill(strokePath(item, live));
  } else if (item.kind === 'shape') {
    drawShape(ctx, item);
  } else {
    drawText(ctx, item);
  }
  ctx.restore();
}

export function textBox(t: TextItem): Rect {
  measureCtx.font = TEXT_FONT(t.size);
  const lines = t.text.split('\n');
  const w = Math.max(...lines.map((l) => measureCtx.measureText(l).width), t.size * 0.5);
  return { x: t.x, y: t.y, w, h: lines.length * t.size * TEXT_LINE };
}

export function itemBBox(item: Item): Rect {
  if (item.kind === 'text') return textBox(item);
  if (item.kind === 'shape') {
    const pad = item.size * 4;
    const x = Math.min(item.x1, item.x2) - pad, y = Math.min(item.y1, item.y2) - pad;
    return { x, y, w: Math.abs(item.x2 - item.x1) + pad * 2, h: Math.abs(item.y2 - item.y1) + pad * 2 };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < item.points.length; i += 3) {
    x0 = Math.min(x0, item.points[i]);
    y0 = Math.min(y0, item.points[i + 1]);
    x1 = Math.max(x1, item.points[i]);
    y1 = Math.max(y1, item.points[i + 1]);
  }
  const pad = item.size;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function polyHit(pts: number[], stride: number, x: number, y: number, r: number) {
  if (pts.length <= stride) return Math.hypot(x - pts[0], y - pts[1]) <= r;
  for (let i = stride; i < pts.length; i += stride) {
    if (segDist(x, y, pts[i - stride], pts[i - stride + 1], pts[i], pts[i + 1]) <= r) return true;
  }
  return false;
}

/** Does a circle of radius r at (x, y) touch the item? */
export function hitItem(item: Item, x: number, y: number, r: number): boolean {
  const b = itemBBox(item);
  if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) return false;
  if (item.kind === 'text') return true;
  const pad = r + item.size / 2;
  if (item.kind === 'stroke') return polyHit(item.points, 3, x, y, pad);
  const { x1, y1, x2, y2 } = item;
  switch (item.shape) {
    case 'line':
    case 'arrow':
      return segDist(x, y, x1, y1, x2, y2) <= pad;
    case 'rect':
      return polyHit([x1, y1, x2, y1, x2, y2, x1, y2, x1, y1], 2, x, y, pad);
    case 'ellipse': {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      const pts: number[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
      }
      return polyHit(pts, 2, x, y, pad);
    }
  }
}

/** Constrain a shape drag: 45° steps for lines, squares/circles for boxes. */
export function constrainShape(s: ShapeItem, x: number, y: number) {
  const dx = x - s.x1, dy = y - s.y1;
  if (s.shape === 'line' || s.shape === 'arrow') {
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: s.x1 + Math.cos(a) * len, y: s.y1 + Math.sin(a) * len };
  }
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: s.x1 + Math.sign(dx || 1) * d, y: s.y1 + Math.sign(dy || 1) * d };
}
