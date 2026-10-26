// Mouse/pen editing of diagrams with the Select tool: pick, move, resize, pull arrows out of
// boxes, click a box's "+" to grow the flow, rubber-band select, and click-to-order steps.
import { actions, currentPage, useStore } from '../store';
import { compositor } from '../engine/compositor';
import { toWorld } from '../engine/layout';
import { uid } from '../lib/util';
import { useDiagramUI, type Rect } from './ui';
import { DEFAULT_SIZE, distToPath, edgePath, hitNode, inside, nodeBounds, sideMid, type Pt, type Side } from './geometry';
import { C, slotColor } from './theme';
import { normalizeSteps, stepCount } from './steps';
import type { DiagramEdge, DiagramNode, NodeShape } from '../types';

const ui = useDiagramUI;
/** Canvas pixels → page units at the current zoom. */
const px = (n: number) => n / compositor.xform.scale;

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const OUT: Record<Side, Pt> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };
type Corner = 'nw' | 'ne' | 'sw' | 'se';
export const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

const nodesNow = () => currentPage()?.nodes ?? [];
const edgesNow = () => currentPage()?.edges ?? [];

/** Where a node's "+" handle for a side sits. */
export function handlePoint(n: DiagramNode, side: Side): Pt {
  const b = side === 'bottom' ? nodeBounds(n) : n;
  const m = sideMid({ ...n, ...b } as DiagramNode, side);
  const d = px(24);
  return { x: m.x + OUT[side].x * d, y: m.y + OUT[side].y * d };
}

export function cornerPoint(n: DiagramNode, c: Corner): Pt {
  return { x: c.endsWith('w') ? n.x : n.x + n.w, y: c.startsWith('n') ? n.y : n.y + n.h };
}

export const canConnect = (n: DiagramNode) => n.shape !== 'frame' && n.shape !== 'text' && n.shape !== 'note';

export function newNode(shape: NodeShape, cx: number, cy: number, extra: Partial<DiagramNode> = {}): DiagramNode {
  const [w, h] = DEFAULT_SIZE[shape];
  const color = shape === 'frame' || shape === 'text' ? C.grey : shape === 'note' ? C.yellow : C.blue;
  return { id: uid(), shape, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, text: '', color: slotColor(color), ...extra };
}

export function newEdge(from: string, to: string, extra: Partial<DiagramEdge> = {}): DiagramEdge {
  return { id: uid(), from, to, text: '', color: slotColor(C.grey), route: 'elbow', dashed: false, arrows: 'end', flow: false, ...extra };
}

/** Topmost node under p; sections (frames) only by their border. */
export function nodeAt(p: Pt, pad = 0, except?: string): DiagramNode | null {
  const nodes = nodesNow();
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.id !== except && n.shape !== 'frame' && hitNode(n, p, pad)) return n;
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.id !== except && n.shape === 'frame' && hitNode(n, p, pad + px(6))) return n;
  }
  return null;
}

export function edgeAt(p: Pt): DiagramEdge | null {
  const byId = new Map(nodesNow().map((n) => [n.id, n]));
  let best: DiagramEdge | null = null;
  let bestD = px(12);
  for (const e of edgesNow()) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const d = distToPath(edgePath(e, a, b), p);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

const overlaps = (r: Rect, nodes: DiagramNode[]) =>
  nodes.some((n) => n.shape !== 'frame' && r.x < n.x + n.w + 24 && r.x + r.w + 24 > n.x && r.y < n.y + n.h + 24 && r.y + r.h + 24 > n.y);

/**
 * Centre for a new w×h node next to `from`: the requested side first, then the other sides,
 * sliding along each one, and only on the visible page.
 */
function placeBeside(from: DiagramNode, side: Side, w: number, h: number): Pt {
  const gap = 110;
  const fb = nodeBounds(from);
  const at = (sd: Side): Pt => {
    const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
    if (sd === 'right') return { x: from.x + from.w + gap + w / 2, y: cy };
    if (sd === 'left') return { x: from.x - gap - w / 2, y: cy };
    if (sd === 'bottom') return { x: cx, y: fb.y + fb.h + gap + h / 2 };
    return { x: cx, y: from.y - gap - h / 2 };
  };
  const nodes = [...nodesNow(), ...cameraObstacle()];
  const W = compositor.W || 1920, H = compositor.H || 1080;
  const fits = (c: Pt) =>
    c.x - w / 2 >= 20 && c.y - h / 2 >= 20 && c.x + w / 2 <= W - 20 && c.y + h / 2 + 50 <= H - 20 &&
    !overlaps({ x: c.x - w / 2, y: c.y - h / 2, w, h: h + (h > 100 ? 50 : 0) }, nodes);
  const order: Side[] = [side, ...(['right', 'bottom', 'top', 'left'] as Side[]).filter((s) => s !== side)];
  for (const slide of [0, 1, -1, 2, -2]) {
    for (const sd of order) {
      const c = at(sd);
      const step = sd === 'left' || sd === 'right' ? { x: 0, y: (h + 60) * slide } : { x: (w + 60) * slide, y: 0 };
      const cand = { x: c.x + step.x, y: c.y + step.y };
      if (fits(cand)) return cand;
    }
  }
  // Crowded: the nearest free spot anywhere on the page.
  const want = at(side);
  const spots: Pt[] = [];
  for (let y = 80; y <= H - 80; y += 40) for (let x = 80; x <= W - 80; x += 40) spots.push({ x, y });
  spots.sort((a, b) => Math.hypot(a.x - want.x, a.y - want.y) - Math.hypot(b.x - want.x, b.y - want.y));
  return spots.find(fits) ?? want;
}

/** The camera bubble's corner counts as taken, so new boxes don't land under your face. */
function cameraObstacle(): DiagramNode[] {
  const cam = compositor.layout?.cam;
  if (!cam?.movable) return [];
  const a = toWorld(compositor.xform, cam.rect.x, cam.rect.y);
  const b = toWorld(compositor.xform, cam.rect.x + cam.rect.w, cam.rect.y + cam.rect.h);
  return [{ id: '_cam', shape: 'rect', x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, text: '', color: '' }];
}

/** With steps on the page, new things appear as the next step so the story stays in order. */
function nextStep(): number | undefined {
  const n = stepCount(currentPage());
  return n ? n + 1 : undefined;
}

/** Centre of what's visible on the stage, in page units. */
export function viewCenter(): Pt {
  const R = compositor.layout?.region;
  if (!R) return { x: 960, y: 540 };
  return toWorld(compositor.xform, R.x + R.w / 2, R.y + R.h / 2);
}

/**
 * Adds a node from the library. With one box selected (and no drop point), the new one goes
 * next to it and gets connected: the quickest way to build a flow.
 */
export function addFromLibrary(shape: NodeShape, extra: Partial<DiagramNode> = {}, at?: Pt) {
  const s = ui.getState();
  const nodes = nodesNow();
  const sel = s.selected.length === 1 ? nodes.find((n) => n.id === s.selected[0] && canConnect(n)) : undefined;
  const [w, h] = DEFAULT_SIZE[shape];
  const c = at ?? (sel ? placeBeside(sel, 'right', w, h) : viewCenter());
  const node = newNode(shape, c.x, c.y, { step: nextStep(), ...extra });
  actions.addDiagram([node], sel && !at && canConnect(node) ? [newEdge(sel.id, node.id)] : []);
  useStore.setState({ tool: 'select' });
  ui.setState({ selected: [node.id], editing: shape === 'icon' || shape === 'dot' ? null : node.id });
  return node;
}

/** Click on a box's "+": add a similar box on that side, connected, ready to type. */
function quickAdd(from: DiagramNode, side: Side) {
  const shape: NodeShape = from.shape === 'dot' ? 'dot' : from.shape === 'icon' ? 'rounded' : from.shape;
  const [w, h] = DEFAULT_SIZE[shape];
  const c = placeBeside(from, side, w, h);
  const node = newNode(shape, c.x, c.y, { color: from.shape === 'icon' ? slotColor(C.blue) : from.color, step: nextStep() });
  actions.addDiagram([node], [newEdge(from.id, node.id, from.shape === 'dot' ? { route: 'straight', arrows: 'none', color: from.color } : {})]);
  ui.setState({ selected: [node.id], editing: shape === 'dot' ? null : node.id });
}

// ---------------------------------------------------------------- gestures

type Gesture =
  | { kind: 'move'; start: Pt; ids: string[]; moved: boolean; click: string }
  | { kind: 'resize'; id: string; corner: Corner; orig: Rect; square: boolean }
  | { kind: 'connect'; from: string; side: Side; start: Pt; moved: boolean }
  | { kind: 'marquee'; start: Pt; base: string[] };

let g: Gesture | null = null;

/** Click-to-order: each click gives the next step; with Shift, the same step as the last click. */
function assignOrder(id: string, together: boolean) {
  const s = ui.getState();
  const k = (s.ordering ?? 0) + (together && s.ordering ? 0 : 1);
  if (nodesNow().some((n) => n.id === id)) actions.updateNodes({ [id]: { step: k } });
  else actions.updateEdges({ [id]: { step: k } });
  ui.setState({ ordering: k, selected: [id] });
}

export function startOrdering() {
  const page = currentPage();
  if (!page) return;
  const clear = <T extends { step?: number }>(x: T) => ({ ...x, step: undefined });
  const { nodes, edges } = normalizeSteps((page.nodes ?? []).map(clear), (page.edges ?? []).map(clear));
  actions.setDiagram(nodes, edges);
  useStore.setState({ tool: 'select' });
  ui.setState({ ordering: 0, selected: [], editing: null });
}

export function selectDown(p: Pt, shift: boolean) {
  const nodes = nodesNow();
  const s = ui.getState();
  if (s.ordering !== null) {
    const hit = nodeAt(p)?.id ?? edgeAt(p)?.id;
    if (hit) assignOrder(hit, shift);
    return;
  }
  if (s.selected.length === 1) {
    const n = nodes.find((x) => x.id === s.selected[0]);
    if (n && n.shape !== 'dot') {
      const corner = CORNERS.find((c) => {
        const q = cornerPoint(n, c);
        return Math.hypot(q.x - p.x, q.y - p.y) < px(12);
      });
      if (corner) {
        g = { kind: 'resize', id: n.id, corner, orig: { x: n.x, y: n.y, w: n.w, h: n.h }, square: n.shape === 'icon' };
        return;
      }
    }
  }
  for (const id of new Set([s.hover, ...s.selected])) {
    const n = id && nodes.find((x) => x.id === id);
    if (!n || !canConnect(n)) continue;
    const side = SIDES.find((sd) => {
      const q = handlePoint(n, sd);
      return Math.hypot(q.x - p.x, q.y - p.y) < px(14);
    });
    if (side) {
      g = { kind: 'connect', from: n.id, side, start: p, moved: false };
      ui.setState({ connect: { from: n.id, x: p.x, y: p.y, to: null } });
      return;
    }
  }
  const n = nodeAt(p);
  if (n) {
    let sel = s.selected;
    if (shift) sel = sel.includes(n.id) ? sel.filter((x) => x !== n.id) : [...sel, n.id];
    else if (!sel.includes(n.id)) sel = [n.id];
    ui.setState({ selected: sel, editing: null });
    const ids = new Set(sel.filter((id) => nodes.some((x) => x.id === id)));
    for (const f of nodes) if (ids.has(f.id) && f.shape === 'frame') for (const c of nodes) if (inside(c, f)) ids.add(c.id);
    g = { kind: 'move', start: p, ids: [...ids], moved: false, click: n.id };
    return;
  }
  const e = edgeAt(p);
  if (e) {
    ui.setState({ selected: shift ? [...s.selected, e.id] : [e.id], editing: null });
    return;
  }
  g = { kind: 'marquee', start: p, base: shift ? s.selected : [] };
  ui.setState({ selected: g.base, editing: null, marquee: { x: p.x, y: p.y, w: 0, h: 0 } });
}

export function selectHover(p: Pt) {
  if (g) return;
  const n = nodeAt(p, px(34));
  const id = n && canConnect(n) ? n.id : null;
  if (ui.getState().hover !== id) ui.setState({ hover: id });
}

export function selectMove(p: Pt, shift: boolean) {
  if (!g) return selectHover(p);
  switch (g.kind) {
    case 'move': {
      const dx = p.x - g.start.x, dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < px(4)) return;
      g.moved = true;
      ui.setState({ drag: { dx: Math.round(dx / 5) * 5, dy: Math.round(dy / 5) * 5, ids: g.ids } });
      break;
    }
    case 'resize': {
      const o = g.orig;
      let { x, y, w, h } = o;
      const dx = p.x - (g.corner.endsWith('w') ? o.x : o.x + o.w);
      const dy = p.y - (g.corner.startsWith('n') ? o.y : o.y + o.h);
      if (g.corner.endsWith('w')) (x = o.x + dx), (w = o.w - dx);
      else w = o.w + dx;
      if (g.corner.startsWith('n')) (y = o.y + dy), (h = o.h - dy);
      else h = o.h + dy;
      if (g.square || shift) {
        const sz = Math.max(w, h);
        if (g.corner.endsWith('w')) x -= sz - w;
        if (g.corner.startsWith('n')) y -= sz - h;
        w = h = sz;
      }
      if (w < 40) (x -= g.corner.endsWith('w') ? 40 - w : 0), (w = 40);
      if (h < 30) (y -= g.corner.startsWith('n') ? 30 - h : 0), (h = 30);
      ui.setState({ resize: { id: g.id, rect: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } } });
      break;
    }
    case 'connect': {
      if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) > px(6)) g.moved = true;
      const to = nodeAt(p, 0, g.from);
      ui.setState({ connect: { from: g.from, x: p.x, y: p.y, to: to && canConnect(to) ? to.id : null } });
      break;
    }
    case 'marquee': {
      const r = { x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), w: Math.abs(p.x - g.start.x), h: Math.abs(p.y - g.start.y) };
      ui.setState({ marquee: r });
      break;
    }
  }
}

export function selectUp(p: Pt, cancelled = false) {
  const gest = g;
  g = null;
  if (!gest) return;
  const s = ui.getState();
  switch (gest.kind) {
    case 'move': {
      const d = s.drag;
      ui.setState({ drag: null });
      if (cancelled) return;
      if (gest.moved && d && (d.dx || d.dy)) {
        const nodes = nodesNow();
        actions.updateNodes(Object.fromEntries(d.ids.map((id) => {
          const n = nodes.find((x) => x.id === id)!;
          return [id, { x: n.x + d.dx, y: n.y + d.dy }];
        })));
      } else if (!gest.moved && s.selected.length > 1 && s.selected.includes(gest.click)) {
        ui.setState({ selected: [gest.click] });
      }
      break;
    }
    case 'resize': {
      const r = s.resize;
      ui.setState({ resize: null });
      if (r && !cancelled) actions.updateNodes({ [r.id]: r.rect });
      break;
    }
    case 'connect': {
      const c = s.connect;
      ui.setState({ connect: null });
      const from = nodesNow().find((n) => n.id === gest.from);
      if (!from || cancelled) return;
      if (!gest.moved) return quickAdd(from, gest.side);
      if (c?.to) {
        if (!edgesNow().some((e) => e.from === from.id && e.to === c.to)) {
          const edge = newEdge(from.id, c.to, from.shape === 'dot' ? { route: 'curve', arrows: 'none', color: from.color } : {});
          actions.addDiagram([], [edge]);
          ui.setState({ selected: [edge.id] });
        }
        return;
      }
      // Dropped on empty space: make a new box there.
      const shape: NodeShape = from.shape === 'dot' ? 'dot' : from.shape === 'icon' ? 'rounded' : from.shape;
      const node = newNode(shape, p.x, p.y, { color: from.shape === 'icon' ? slotColor(C.blue) : from.color, step: nextStep() });
      actions.addDiagram([node], [newEdge(from.id, node.id)]);
      ui.setState({ selected: [node.id], editing: shape === 'dot' ? null : node.id });
      break;
    }
    case 'marquee': {
      const r = s.marquee;
      ui.setState({ marquee: null });
      if (!r || r.w < px(3)) return;
      const ids = new Set(gest.base);
      for (const n of nodesNow()) {
        const b = nodeBounds(n);
        if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) ids.add(n.id);
      }
      for (const e of edgesNow()) if (ids.has(e.from) && ids.has(e.to)) ids.add(e.id);
      ui.setState({ selected: [...ids] });
      break;
    }
  }
}

export function selectDoubleClick(p: Pt) {
  if (ui.getState().ordering !== null) return;
  const n = nodeAt(p);
  if (n) return ui.setState({ selected: [n.id], editing: n.id });
  const e = edgeAt(p);
  if (e) return ui.setState({ selected: [e.id], editing: e.id });
  addFromLibrary('rounded', {}, p);
}

// ---------------------------------------------------------------- keyboard actions

let clipboard: { nodes: DiagramNode[]; edges: DiagramEdge[] } | null = null;

export function deleteSelection() {
  const s = ui.getState();
  if (!s.selected.length) return false;
  actions.removeDiagram(new Set(s.selected));
  ui.setState({ selected: [], editing: null });
  return true;
}

export function copySelection() {
  const ids = new Set(ui.getState().selected);
  const nodes = nodesNow().filter((n) => ids.has(n.id));
  if (!nodes.length) return false;
  const keep = new Set(nodes.map((n) => n.id));
  clipboard = { nodes, edges: edgesNow().filter((e) => keep.has(e.from) && keep.has(e.to)) };
  return true;
}

export function paste(offset = 40) {
  if (!clipboard) return false;
  const map = new Map<string, string>();
  const nodes = clipboard.nodes.map((n) => {
    const id = uid();
    map.set(n.id, id);
    return { ...n, id, x: n.x + offset, y: n.y + offset, step: undefined, fx: undefined };
  });
  const edges = clipboard.edges.map((e) => ({ ...e, id: uid(), from: map.get(e.from)!, to: map.get(e.to)!, step: undefined, fx: undefined }));
  actions.addDiagram(nodes, edges);
  clipboard = { nodes: nodes.map((n) => ({ ...n })), edges };
  ui.setState({ selected: [...nodes.map((n) => n.id), ...edges.map((e) => e.id)] });
  return true;
}

export const duplicateSelection = () => copySelection() && paste(30);

export function selectAll() {
  ui.setState({ selected: [...nodesNow().map((n) => n.id), ...edgesNow().map((e) => e.id)] });
}

export function nudge(dx: number, dy: number) {
  const ids = new Set(ui.getState().selected);
  const moving = nodesNow().filter((n) => ids.has(n.id));
  if (!moving.length) return false;
  actions.updateNodes(Object.fromEntries(moving.map((n) => [n.id, { x: n.x + dx, y: n.y + dy }])));
  return true;
}
