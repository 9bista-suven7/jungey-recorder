// Step-by-step reveal. Nodes and arrows can have a step number; while presenting, step k shows
// everything up to k. Arrows without a step appear as soon as both their ends are visible.
import type { DiagramEdge, DiagramNode, Fx, FxKind, Page } from '../types';
import { isContext } from './geometry';

export const nodesOf = (p?: Page) => p?.nodes ?? [];
export const edgesOf = (p?: Page) => p?.edges ?? [];

type Stepped = { step?: number; fx?: Fx[] };
const stepsIn = (x: Stepped) => [x.step ?? 0, ...(x.fx ?? []).map((f) => f.step)];

export function stepCount(p?: Page) {
  let max = 0;
  for (const x of [...nodesOf(p), ...edgesOf(p)]) max = Math.max(max, ...stepsIn(x));
  return max;
}

/** The step at which each node and arrow first appears (0 = from the start). */
export function revealSteps(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const at = new Map<string, number>();
  for (const n of nodes) at.set(n.id, n.step ?? 0);
  for (const e of edges) at.set(e.id, Math.max(e.step ?? 0, at.get(e.from) ?? 0, at.get(e.to) ?? 0));
  return at;
}

/**
 * Orders the flow automatically: start from boxes nothing points to, then follow the arrows,
 * one "wave" per step (so a box that fans out to three reveals all three together).
 */
export function autoSteps(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const flow = nodes.filter((n) => !isContext(n));
  const ids = new Set(flow.map((n) => n.id));
  const links = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const incoming = new Map(flow.map((n) => [n.id, 0]));
  for (const e of links) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const byPos = (a: DiagramNode, b: DiagramNode) => a.x - b.x || a.y - b.y;
  const step = new Map<string, number>();
  let wave = flow.filter((n) => !incoming.get(n.id)).sort(byPos);
  if (!wave.length && flow.length) wave = [flow.slice().sort(byPos)[0]];
  let k = 0;
  while (wave.length) {
    k++;
    for (const n of wave) step.set(n.id, k);
    const next = new Map<string, DiagramNode>();
    for (const n of wave) {
      for (const e of links) {
        if (e.from === n.id && !step.has(e.to)) next.set(e.to, flow.find((x) => x.id === e.to)!);
      }
    }
    wave = [...next.values()].sort(byPos);
    // Anything unreachable gets its own steps at the end.
    if (!wave.length) {
      const rest = flow.filter((n) => !step.has(n.id)).sort(byPos);
      if (rest.length) wave = [rest[0]];
    }
  }
  // Auto-order rebuilds the story from scratch, so earlier animations are dropped.
  return {
    nodes: nodes.map((n) => ({ ...n, step: step.get(n.id), fx: undefined })),
    edges: edges.map((e) => ({ ...e, step: undefined, fx: undefined })),
  };
}

/** Rewrites every step number (appearances and animations) through `map`. */
function remap<T extends Stepped>(x: T, map: (s: number) => number | undefined): T {
  const step = x.step ? map(x.step) : x.step;
  const fx = x.fx?.map((f) => ({ ...f, step: map(f.step) })).filter((f): f is Fx => !!f.step);
  return { ...x, step, fx: fx?.length ? fx : undefined };
}

/** Removes gaps so steps are always 1..N. */
export function normalizeSteps(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const used = [...new Set([...nodes, ...edges].flatMap(stepsIn).filter((s) => s > 0))].sort((a, b) => a - b);
  const index = new Map(used.map((s, i) => [s, i + 1]));
  const map = (s: number) => index.get(s);
  return { nodes: nodes.map((n) => remap(n, map)), edges: edges.map((e) => remap(e, map)) };
}

/** Swaps steps a and b. */
export function swapSteps(nodes: DiagramNode[], edges: DiagramEdge[], a: number, b: number) {
  const map = (s: number) => (s === a ? b : s === b ? a : s);
  return { nodes: nodes.map((n) => remap(n, map)), edges: edges.map((e) => remap(e, map)) };
}

/** Drops step k: things that appeared then are always visible; its animations are removed. */
export function removeStep(nodes: DiagramNode[], edges: DiagramEdge[], k: number) {
  const map = (s: number) => (s === k ? undefined : s);
  return normalizeSteps(nodes.map((n) => remap(n, map)), edges.map((e) => remap(e, map)));
}

/** Adds an animation to elements, as a new last step or together with the last step. */
export function addFx<T extends Stepped & { id: string }>(list: T[], ids: Set<string>, kind: FxKind, step: number): T[] {
  return list.map((x) => (ids.has(x.id) ? { ...x, fx: [...(x.fx ?? []).filter((f) => f.step !== step), { step, kind }] } : x));
}

export const FX_VERB: Record<FxKind, string> = {
  jump: 'jumps', shake: 'shakes', pulse: 'pulses', spin: 'spins', wiggle: 'wiggles', glow: 'glows',
  collapse: 'collapses', regrow: 'grows back', fadeout: 'fades out', run: 'runs along its arrow', runback: 'runs back', flow: 'sends data',
};

/** Lines for the steps panel: "MongoDB appears", "User jumps", ... */
export function stepLabels(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const name = (id: string) => nodes.find((n) => n.id === id)?.text || 'box';
  const label = (x: DiagramNode | DiagramEdge) => ('from' in x ? x.text || `${name(x.from)} → ${name(x.to)}` : x.text || 'box');
  const out: string[][] = [];
  for (const x of [...nodes, ...edges]) {
    if (x.step) (out[x.step - 1] ??= []).push(`${label(x)} appears`);
    for (const f of x.fx ?? []) (out[f.step - 1] ??= []).push(`${label(x)} ${FX_VERB[f.kind]}`);
  }
  return Array.from({ length: out.length }, (_, i) => out[i] ?? []);
}

const autoCache = new WeakMap<DiagramNode[], { edges: DiagramEdge[]; result: { nodes: DiagramNode[]; edges: DiagramEdge[] } }>();

/**
 * The diagram as it is presented. A page with no steps of its own is revealed in arrow order
 * automatically, so a diagram can be recorded step by step with no setup.
 */
export function presented(p: Page | undefined, auto: boolean) {
  const nodes = nodesOf(p), edges = edgesOf(p);
  if (!auto || !nodes.length || stepCount(p) > 0) return { nodes, edges };
  const hit = autoCache.get(nodes);
  if (hit && hit.edges === edges) return hit.result;
  const result = autoSteps(nodes, edges);
  autoCache.set(nodes, { edges, result });
  return result;
}

export const presentedSteps = (p: Page | undefined, auto: boolean) => {
  const d = presented(p, auto);
  return stepCount({ ...(p as Page), nodes: d.nodes, edges: d.edges });
};
