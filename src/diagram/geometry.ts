// Shapes, arrow routing and path maths for diagrams. All coordinates are page units.
import type { DiagramEdge, DiagramNode, NodeShape } from '../types';

export interface Pt {
  x: number;
  y: number;
}
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** An arrow as a polyline with cumulative lengths, ready for drawing and animation. */
export interface EdgePath {
  pts: Pt[];
  lens: number[];
  total: number;
  /** Elbow arrows get rounded corners when drawn. */
  corners: boolean;
}

export const center = (n: DiagramNode): Pt => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

/** Sizes for new nodes, by shape. */
export const DEFAULT_SIZE: Record<NodeShape, [number, number]> = {
  rect: [210, 92], rounded: [210, 92], pill: [210, 80], ellipse: [180, 110], diamond: [190, 130], cylinder: [150, 130],
  hexagon: [200, 100], parallelogram: [210, 92], document: [190, 115], cloud: [230, 145], note: [210, 170],
  frame: [600, 380], text: [260, 60], icon: [118, 118], dot: [34, 34], chart: [780, 460],
};

/** Shapes that are context (sections, notes, captions) rather than steps of a flow. */
export const isContext = (n: DiagramNode) => n.shape === 'frame' || n.shape === 'text' || n.shape === 'note';

const NORMAL: Record<Side, Pt> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

/** Height of the name drawn under icon and dot nodes (arrows leaving downwards start below it). */
const labelBelow = (n: DiagramNode) => (n.text && (n.shape === 'icon' || n.shape === 'dot') ? (n.shape === 'icon' ? 44 : 34) : 0);

export function sideMid(n: DiagramNode, side: Side): Pt {
  switch (side) {
    case 'left': return { x: n.x, y: n.y + n.h / 2 };
    case 'right': return { x: n.x + n.w, y: n.y + n.h / 2 };
    case 'top': return { x: n.x + n.w / 2, y: n.y };
    case 'bottom': return { x: n.x + n.w / 2, y: n.y + n.h + labelBelow(n) };
  }
}

/** Which sides an arrow from a to b should leave and enter by. */
export function pickSides(a: DiagramNode, b: DiagramNode): [Side, Side] {
  const ca = center(a), cb = center(b);
  const hGap = Math.abs(cb.x - ca.x) - (a.w + b.w) / 2;
  const vGap = Math.abs(cb.y - ca.y) - (a.h + b.h) / 2;
  if (hGap >= vGap) return cb.x >= ca.x ? ['right', 'left'] : ['left', 'right'];
  return cb.y >= ca.y ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Where a ray from the node's centre towards `to` leaves its outline. */
function boundaryToward(n: DiagramNode, to: Pt): Pt {
  const c = center(n);
  const dx = to.x - c.x, dy = to.y - c.y;
  if (!dx && !dy) return c;
  const rx = n.w / 2, ry = n.h / 2;
  let k: number;
  if (n.shape === 'ellipse' || n.shape === 'dot') k = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
  else if (n.shape === 'diamond') k = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  else k = Math.min(dx ? rx / Math.abs(dx) : Infinity, dy ? ry / Math.abs(dy) : Infinity);
  return { x: c.x + dx * k, y: c.y + dy * k };
}

function finish(raw: Pt[], corners: boolean): EdgePath {
  const pts: Pt[] = [];
  for (const p of raw) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.5) pts.push(p);
  }
  if (pts.length === 1) pts.push({ ...pts[0] });
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, lens, total: lens[lens.length - 1], corners };
}

export function edgePath(e: Pick<DiagramEdge, 'route'>, a: DiagramNode, b: DiagramNode): EdgePath {
  if (e.route === 'straight') {
    return finish([boundaryToward(a, center(b)), boundaryToward(b, center(a))], false);
  }
  const [sa, sb] = pickSides(a, b);
  const s = sideMid(a, sa), t = sideMid(b, sb);
  if (e.route === 'curve') {
    const d = Math.max(50, Math.hypot(t.x - s.x, t.y - s.y) * 0.42);
    const c1 = { x: s.x + NORMAL[sa].x * d, y: s.y + NORMAL[sa].y * d };
    const c2 = { x: t.x + NORMAL[sb].x * d, y: t.y + NORMAL[sb].y * d };
    const pts: Pt[] = [];
    for (let i = 0; i <= 32; i++) {
      const u = i / 32, v = 1 - u;
      pts.push({
        x: v * v * v * s.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * t.x,
        y: v * v * v * s.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * t.y,
      });
    }
    return finish(pts, false);
  }
  // Elbow: leave and enter straight, with one bend in the middle.
  if (sa === 'left' || sa === 'right') {
    const mx = (s.x + t.x) / 2;
    return finish([s, { x: mx, y: s.y }, { x: mx, y: t.y }, t], true);
  }
  const my = (s.y + t.y) / 2;
  return finish([s, { x: s.x, y: my }, { x: t.x, y: my }, t], true);
}

/** Point and direction at distance d along the path. */
export function pointAt(p: EdgePath, d: number): Pt & { angle: number } {
  const dd = Math.max(0, Math.min(p.total, d));
  let i = 1;
  while (i < p.lens.length - 1 && p.lens[i] < dd) i++;
  const a = p.pts[i - 1], b = p.pts[i];
  const seg = p.lens[i] - p.lens[i - 1] || 1;
  const u = (dd - p.lens[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** The first `d` units of the path. */
export function slicePath(p: EdgePath, d: number): Pt[] {
  if (d >= p.total) return p.pts;
  const out: Pt[] = [p.pts[0]];
  for (let i = 1; i < p.pts.length; i++) {
    if (p.lens[i] >= d) {
      out.push(pointAt(p, d));
      break;
    }
    out.push(p.pts[i]);
  }
  return out;
}

export function distToPath(p: EdgePath, q: Pt) {
  let best = Infinity;
  for (let i = 1; i < p.pts.length; i++) {
    const a = p.pts[i - 1], b = p.pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)));
  }
  return best;
}

/** Icon and dot nodes have their label underneath, which counts as part of the node. */
export function nodeBounds(n: DiagramNode) {
  const below = n.shape === 'icon' || n.shape === 'dot';
  return below && n.text ? { x: n.x - 30, y: n.y, w: n.w + 60, h: n.h + 64 } : { x: n.x, y: n.y, w: n.w, h: n.h };
}

export function hitNode(n: DiagramNode, q: Pt, pad = 0) {
  if (n.shape === 'frame') {
    // Frames are picked by their border and title bar, so you can still click things inside them.
    const inside = q.x > n.x + pad + 12 && q.x < n.x + n.w - pad - 12 && q.y > n.y + 56 && q.y < n.y + n.h - pad - 12;
    const near = q.x >= n.x - pad && q.x <= n.x + n.w + pad && q.y >= n.y - pad && q.y <= n.y + n.h + pad;
    return near && !inside;
  }
  const b = nodeBounds(n);
  return q.x >= b.x - pad && q.x <= b.x + b.w + pad && q.y >= b.y - pad && q.y <= b.y + b.h + pad;
}

export function inside(n: DiagramNode, f: DiagramNode) {
  return n.id !== f.id && n.x >= f.x && n.y >= f.y && n.x + n.w <= f.x + f.w && n.y + n.h <= f.y + f.h;
}

export function boundsOf(nodes: DiagramNode[]) {
  if (!nodes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    const b = nodeBounds(n);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Builds the outline of a node shape as a path on ctx (no fill or stroke). */
export function shapePath(ctx: CanvasRenderingContext2D | Path2D, n: DiagramNode) {
  const { x, y, w, h } = n;
  const cx = x + w / 2, cy = y + h / 2;
  switch (n.shape) {
    case 'rect':
      ctx.rect(x, y, w, h);
      break;
    case 'pill':
      ctx.roundRect(x, y, w, h, h / 2);
      break;
    case 'ellipse':
    case 'dot':
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'diamond':
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      break;
    case 'hexagon': {
      const k = Math.min(w * 0.2, h * 0.5);
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + w - k, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(x + w - k, y + h);
      ctx.lineTo(x + k, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      break;
    }
    case 'parallelogram': {
      const k = Math.min(w * 0.16, 34);
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - k, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case 'document': {
      const wave = Math.min(h * 0.14, 16);
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h - wave);
      ctx.bezierCurveTo(x + w * 0.75, y + h - wave * 2.6, x + w * 0.5, y + h + wave * 0.8, x + w * 0.25, y + h - wave * 0.4);
      ctx.quadraticCurveTo(x + w * 0.1, y + h - wave * 1.4, x, y + h - wave);
      ctx.closePath();
      break;
    }
    case 'cylinder': {
      const ry = Math.min(h * 0.14, 20);
      ctx.moveTo(x, y + ry);
      ctx.lineTo(x, y + h - ry);
      ctx.ellipse(cx, y + h - ry, w / 2, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x + w, y + ry);
      ctx.ellipse(cx, y + ry, w / 2, ry, 0, 0, Math.PI, true);
      ctx.closePath();
      break;
    }
    case 'cloud': {
      // Drawn in a 100×64 box, scaled to the node.
      const sx = w / 100, sy = h / 64;
      const P = (px: number, py: number) => [x + px * sx, y + py * sy] as const;
      ctx.moveTo(...P(26, 60));
      ctx.bezierCurveTo(...P(10, 60), ...P(2, 48), ...P(6, 38));
      ctx.bezierCurveTo(...P(9, 28), ...P(17, 25), ...P(24, 26));
      ctx.bezierCurveTo(...P(26, 12), ...P(39, 4), ...P(53, 8));
      ctx.bezierCurveTo(...P(63, 11), ...P(70, 18), ...P(72, 26));
      ctx.bezierCurveTo(...P(84, 24), ...P(96, 32), ...P(96, 44));
      ctx.bezierCurveTo(...P(96, 54), ...P(88, 60), ...P(78, 60));
      ctx.closePath();
      break;
    }
    default:
      ctx.roundRect(x, y, w, h, Math.min(18, h / 4, w / 4));
  }
}
