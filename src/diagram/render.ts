// Draws a diagram (boxes, icons, arrows) into the frame, with step reveals and animations.
import type { DiagramEdge, DiagramNode, EnterKind, FxKind } from '../types';
import type { Xform } from '../engine/layout';
import { edgePath, isContext, pointAt, shapePath, slicePath, type EdgePath, type Pt } from './geometry';
import { lookAt, previewLook, type Look, type Timing } from './anim';
import { diagramTheme, themed, type DiagramTheme } from './theme';
import { drawIcon } from './icons';
import { blurSprite, glowDot } from '../engine/sprites';

/** Soft shadow or glow of a node's outline, from the sprite cache (no per-frame blur). */
function halo(ctx: CanvasRenderingContext2D, n: DiagramNode, blur: number, color: string, dy = 0, outline?: (c: CanvasRenderingContext2D) => void) {
  const draw = outline ?? ((c: CanvasRenderingContext2D) => shapePath(c, { ...n, x: 0, y: 0 }));
  const s = blurSprite(outline ? `${n.shape}-card` : n.shape, n.w, n.h, blur, color, draw);
  ctx.drawImage(s.img, n.x - s.pad, n.y - s.pad + dy);
}

const FONT = (size: number, weight = 600) => `${weight} ${size}px "Inter Variable", Inter, system-ui, sans-serif`;
const HAND = (size: number) => `600 ${size}px Caveat, "Comic Sans MS", cursive`;

export interface DiagramFrame extends Timing {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  dark: boolean;
  spotlight: boolean;
  now: number;
  preview?: { ids: string[]; kind: EnterKind | FxKind; start: number } | null;
  /** Node or arrow whose text is being typed in the editor (drawn without its text). */
  editing?: string | null;
  onIconLoad?: () => void;
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(next).width > maxW) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], cx: number, cy: number, lh: number) {
  const top = cy - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lh));
}

/** Width available for text inside each shape. */
function textWidth(n: DiagramNode) {
  if (n.shape === 'diamond') return n.w * 0.58;
  if (n.shape === 'ellipse' || n.shape === 'cloud') return n.w * 0.72;
  if (n.shape === 'hexagon' || n.shape === 'parallelogram') return n.w * 0.74;
  return n.w - 28;
}

function drawNode(ctx: CanvasRenderingContext2D, n: DiagramNode, th: DiagramTheme, L: Look, f: DiagramFrame) {
  const color = themed(n.color, th);
  const { x, y, w, h } = n;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save();
  ctx.globalAlpha *= L.alpha;
  ctx.translate(cx + L.dx, cy + L.dy);
  if (L.rot) ctx.rotate(L.rot);
  ctx.scale(L.scale * L.sx, L.scale * L.sy);
  ctx.translate(-cx, -cy);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glow = Math.max(L.glow, L.current && f.presenting ? 0.75 : 0);
  const pulse = 0.8 + 0.2 * Math.sin(f.now / 260);

  switch (n.shape) {
    case 'frame': {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 22);
      ctx.fillStyle = color;
      ctx.globalAlpha *= 0.07;
      ctx.fill();
      ctx.globalAlpha /= 0.07;
      ctx.setLineDash([16, 12]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = FONT(26, 700);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(n.text, x + 22, y + 18);
      break;
    }
    case 'note': {
      halo(ctx, n, 18, 'rgba(0,0,0,0.28)', 6, (c) => c.rect(0, 0, w, h));
      ctx.fillStyle = th.dark ? '#f7d96b' : '#ffe58f';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#3d3200';
      ctx.font = HAND(32);
      drawLines(ctx, wrapLines(ctx, n.text, w - 30), cx, cy, 34);
      break;
    }
    case 'text': {
      ctx.fillStyle = color === th.colors[0] ? th.text : color;
      ctx.font = FONT(32, 700);
      drawLines(ctx, wrapLines(ctx, n.text, w), cx, cy, 40);
      break;
    }
    case 'icon': {
      const card = (c: CanvasRenderingContext2D) => c.roundRect(0, 0, w, h, Math.min(26, w * 0.22));
      if (glow) {
        ctx.save();
        ctx.globalAlpha *= glow * pulse;
        halo(ctx, n, 34, color, 0, card);
        ctx.restore();
      } else halo(ctx, n, 20, 'rgba(0,0,0,0.3)', 6, card);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(26, w * 0.22));
      ctx.fillStyle = th.card;
      ctx.fill();
      ctx.lineWidth = glow ? 4 : 1.5;
      ctx.strokeStyle = glow ? color : th.cardEdge;
      ctx.stroke();
      if (n.icon) {
        const s = Math.min(w, h) * 0.62;
        // White card: the icon needs the light-theme version of its colour.
        drawIcon(ctx, n.icon, cx - s / 2, cy - s / 2, s, themed(n.color, diagramTheme(false)), f.onIconLoad);
      }
      if (n.text) {
        ctx.fillStyle = th.text;
        ctx.font = FONT(25, 650);
        ctx.textBaseline = 'top';
        wrapLines(ctx, n.text, w + 90).forEach((l, i) => ctx.fillText(l, cx, y + h + 14 + i * 30));
      }
      break;
    }
    case 'dot': {
      if (glow) {
        ctx.save();
        ctx.globalAlpha *= glow * pulse;
        halo(ctx, n, 28, color);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, w / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = th.dark ? '#0e1016' : '#ffffff';
      ctx.stroke();
      if (n.text) {
        ctx.fillStyle = th.muted;
        ctx.font = FONT(21, 600);
        ctx.textBaseline = 'top';
        ctx.fillText(n.text, cx, y + h + 10);
      }
      break;
    }
    default: {
      if (glow) {
        ctx.save();
        ctx.globalAlpha *= glow * pulse;
        halo(ctx, n, 34, color);
        ctx.restore();
      } else if (!th.dark) halo(ctx, n, 14, 'rgba(20,30,50,0.10)', 4);
      ctx.beginPath();
      shapePath(ctx, n);
      ctx.fillStyle = th.nodeBase;
      ctx.fill();
      ctx.fillStyle = color;
      ctx.globalAlpha *= th.dark ? 0.16 : 0.1;
      ctx.fill();
      ctx.globalAlpha /= th.dark ? 0.16 : 0.1;
      ctx.lineWidth = glow ? 4 : 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      if (n.shape === 'cylinder') {
        const ry = Math.min(h * 0.14, 20);
        ctx.beginPath();
        ctx.ellipse(cx, y + ry, w / 2, ry, 0, 0, Math.PI);
        ctx.stroke();
      }
      if (n.text) {
        ctx.fillStyle = th.text;
        ctx.font = FONT(27, 650);
        const top = n.shape === 'cylinder' ? Math.min(h * 0.14, 20) / 2 : 0;
        drawLines(ctx, wrapLines(ctx, n.text, textWidth(n)), cx, cy + top, 33);
      }
    }
  }
  ctx.restore();
}

function strokePolyline(ctx: CanvasRenderingContext2D, pts: Pt[], rounded: boolean) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    if (rounded) {
      const a = pts[i], b = pts[i + 1], prev = pts[i - 1];
      const r = Math.min(18, Math.hypot(a.x - prev.x, a.y - prev.y) / 2, Math.hypot(b.x - a.x, b.y - a.y) / 2);
      ctx.arcTo(a.x, a.y, b.x, b.y, r);
    } else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
}

function arrowHead(ctx: CanvasRenderingContext2D, tip: Pt, angle: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - size * Math.cos(angle - 0.42), tip.y - size * Math.sin(angle - 0.42));
  ctx.lineTo(tip.x - size * Math.cos(angle + 0.42), tip.y - size * Math.sin(angle + 0.42));
  ctx.closePath();
  ctx.fill();
}

function pill(ctx: CanvasRenderingContext2D, text: string, at: Pt, bg: string, border: string, fg: string, size = 21) {
  ctx.font = FONT(size, 650);
  const w = ctx.measureText(text).width + 22, h = size + 14;
  ctx.beginPath();
  ctx.roundRect(at.x - w / 2, at.y - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, at.x, at.y + 1);
}

function drawEdge(ctx: CanvasRenderingContext2D, e: DiagramEdge, path: EdgePath, th: DiagramTheme, L: Look, f: DiagramFrame) {
  const color = themed(e.color, th);
  const flowing = L.flowing || e.flow || (f.presenting && L.current && L.draw >= 1);
  ctx.save();
  ctx.globalAlpha *= L.alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5 + L.thick;
  const drawn = L.draw * path.total;
  const pts = slicePath(path, drawn);
  if (pts.length >= 2 && (L.glow || (L.current && f.presenting))) {
    // A soft wide line underneath instead of a blurred shadow.
    ctx.save();
    ctx.globalAlpha *= 0.22 * Math.max(L.glow, 0.7);
    ctx.lineWidth += 10;
    strokePolyline(ctx, pts, path.corners);
    ctx.restore();
  }
  if (e.dashed) ctx.setLineDash([14, 11]);
  if (pts.length >= 2) strokePolyline(ctx, pts, path.corners);
  ctx.setLineDash([]);
  const head = 16 + ctx.lineWidth * 1.6;
  if (e.arrows !== 'none' && L.draw > 0.97) {
    const end = pointAt(path, path.total);
    arrowHead(ctx, end, end.angle, head);
  }
  if (e.arrows === 'both' && L.draw > 0.05) {
    const start = pointAt(path, 0);
    arrowHead(ctx, start, start.angle + Math.PI, head);
  }
  if (e.text && L.draw >= 1) pill(ctx, e.text, pointAt(path, path.total / 2), th.labelBg, color, th.text, 20);

  if (flowing && L.draw >= 1 && path.total > 40) {
    const speed = 230;
    const travel = (f.now / 1000) * speed;
    if (e.packet) {
      const period = path.total + 120;
      const d = travel % period;
      if (d < path.total) pill(ctx, e.packet, pointAt(path, d), color, color, th.dark ? '#0b0d12' : '#ffffff', 19);
    } else {
      const gap = 150;
      const sprite = glowDot(color, 7);
      const half = sprite.width / 2;
      for (let d = travel % gap; d < path.total - 8; d += gap) {
        const p = pointAt(path, d);
        const fade = Math.min(1, d / 40, (path.total - d) / 40);
        ctx.globalAlpha = L.alpha * fade;
        ctx.drawImage(sprite, p.x - half, p.y - half);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** Where a running node is: along its first outgoing arrow, hopping as it goes. */
function runOffset(n: DiagramNode, L: Look, paths: Map<string, { e: DiagramEdge; path: EdgePath }>) {
  if (!L.travel) return;
  let path: EdgePath | null = null;
  for (const { e, path: p } of paths.values()) {
    if (e.from === n.id) {
      path = p;
      break;
    }
  }
  const dist = path ? Math.max(0, path.total - Math.max(n.w, n.h) * 0.5) : 320;
  const d = L.travel * dist;
  const at = path ? pointAt(path, d) : { x: d, y: 0, angle: 0 };
  const start = path ? pointAt(path, 0) : { x: 0, y: 0 };
  L.dx += at.x - start.x;
  L.dy += at.y - start.y;
  const hops = Math.max(2, Math.round(dist / 110));
  if (L.travel > 0 && L.travel < 1) {
    L.dy -= Math.abs(Math.sin(L.travel * Math.PI * hops)) * 30;
    L.rot += Math.sin(L.travel * Math.PI * hops * 2) * 0.06;
  }
}

/** Draws every diagram element of a page with the page→frame transform. */
export function drawDiagram(ctx: CanvasRenderingContext2D, t: Xform, f: DiagramFrame) {
  if (!f.nodes.length && !f.edges.length) return;
  const th = diagramTheme(f.dark);
  const byId = new Map(f.nodes.map((n) => [n.id, n]));

  // Things that happen in this step play one after another, nodes first.
  const order = new Map<string, number>();
  const happens = (x: { step?: number; fx?: { step: number }[] }) => x.step === f.step || !!x.fx?.some((z) => z.step === f.step);
  for (const n of f.nodes) if (happens(n)) order.set(n.id, order.size);

  const looks = new Map<string, Look | null>();
  const preview = (id: string) => (!f.presenting && f.preview?.ids.includes(id) ? previewLook(f.preview.kind, f.now - f.preview.start) : null);
  for (const n of f.nodes) {
    const L = preview(n.id) ?? lookAt(n.step ?? 0, n.enter ?? 'pop', n.fx, order.get(n.id) ?? 0, f);
    looks.set(n.id, L);
  }

  const paths = new Map<string, { e: DiagramEdge; path: EdgePath }>();
  const edgeLooks = new Map<string, Look | null>();
  for (const e of f.edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b || a === b) continue;
    paths.set(e.id, { e, path: edgePath(e, a, b) });
    const la = looks.get(a.id), lb = looks.get(b.id);
    // An arrow appears with whichever of its ends shows up last, drawing itself just after.
    const appear = Math.max(e.step ?? 0, a.step ?? 0, b.step ?? 0);
    const after = Math.max(order.get(a.id) ?? -1, order.get(b.id) ?? -1) + 1;
    let L = preview(e.id) ?? lookAt(appear, e.enter ?? 'draw', e.fx, appear === f.step ? after + 1 : (order.get(e.id) ?? after), f);
    if (!la || !lb) L = null;
    else if (L) L.alpha *= Math.min(1, la.alpha, lb.alpha) * Math.min(1, la.scale * lb.scale);
    edgeLooks.set(e.id, L);
  }

  const dim = f.presenting && f.spotlight && f.step > 0;
  const fade = (L: Look, context: boolean) => {
    if (dim && !L.current) L.alpha *= context ? 0.6 : 0.32;
  };

  ctx.save();
  ctx.setTransform(t.scale, 0, 0, t.scale, t.ox, t.oy);
  // Sections behind everything, then arrows, then boxes (running ones on top).
  for (const n of f.nodes) {
    const L = looks.get(n.id);
    if (n.shape !== 'frame' || !L) continue;
    fade(L, true);
    drawNode(ctx, n.id === f.editing ? { ...n, text: '' } : n, th, L, f);
  }
  for (const { e, path } of paths.values()) {
    const L = edgeLooks.get(e.id);
    if (!L) continue;
    fade(L, false);
    drawEdge(ctx, e.id === f.editing ? { ...e, text: '' } : e, path, th, L, f);
  }
  const runners: [DiagramNode, Look][] = [];
  for (const n of f.nodes) {
    const L = looks.get(n.id);
    if (n.shape === 'frame' || !L) continue;
    fade(L, isContext(n));
    runOffset(n, L, paths);
    const shown = n.id === f.editing ? { ...n, text: '' } : n;
    if (L.travel) runners.push([shown, L]);
    else drawNode(ctx, shown, th, L, f);
  }
  for (const [n, L] of runners) drawNode(ctx, n, th, L, f);
  ctx.restore();
}

/** Static drawing (thumbnails, previews): everything visible, no animation. */
export function drawDiagramStatic(ctx: CanvasRenderingContext2D, t: Xform, nodes: DiagramNode[], edges: DiagramEdge[], dark: boolean, onIconLoad?: () => void) {
  drawDiagram(ctx, t, { nodes, edges, dark, spotlight: false, now: 0, presenting: false, step: 0, since: Infinity, onIconLoad });
}

