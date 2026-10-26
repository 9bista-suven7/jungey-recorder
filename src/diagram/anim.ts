// What each node or arrow looks like at a moment of a presentation: visible or not, and the
// transform of any animation playing (pop in, jump, collapse, run along an arrow, ...).
import type { EnterKind, Fx, FxKind } from '../types';

export interface Look {
  alpha: number;
  scale: number;
  sx: number;
  sy: number;
  rot: number;
  dx: number;
  dy: number;
  /** 0..1 glow ring. */
  glow: number;
  /** Arrows: how much of the line is drawn. */
  draw: number;
  /** Extra line width for pulsing arrows. */
  thick: number;
  /** Run: 0 = at home, 1 = at the end of its arrow. */
  travel: number;
  /** Part of what happens in the current step. */
  current: boolean;
  /** Arrow sends dots this step. */
  flowing: boolean;
}

export const idle = (): Look => ({
  alpha: 1, scale: 1, sx: 1, sy: 1, rot: 0, dx: 0, dy: 0, glow: 0, draw: 1, thick: 0, travel: 0, current: false, flowing: false,
});

export const ENTER_LABEL: Record<EnterKind, string> = {
  pop: 'Pop', fade: 'Fade in', grow: 'Grow', drop: 'Jump in', slide: 'Slide in', zoom: 'Zoom in', draw: 'Draw',
};
export const FX_LABEL: Record<FxKind, string> = {
  jump: 'Jump', shake: 'Shake', pulse: 'Pulse', spin: 'Spin', wiggle: 'Wiggle', glow: 'Glow', collapse: 'Collapse',
  regrow: 'Regrow', fadeout: 'Fade out', run: 'Run along arrow', runback: 'Run back', flow: 'Send data',
};

export const ENTER_MS: Record<EnterKind, number> = { pop: 480, fade: 450, grow: 520, drop: 950, slide: 600, zoom: 520, draw: 750 };
export const FX_MS: Record<FxKind, number> = {
  jump: 950, shake: 650, pulse: 900, spin: 850, wiggle: 850, glow: 600, collapse: 520, regrow: 720, fadeout: 520,
  run: 1500, runback: 1300, flow: 0,
};
/** Delay between things that happen in the same step, so they read one after another. */
export const STAGGER = 140;

const c01 = (v: number) => Math.max(0, Math.min(1, v));
const outCubic = (t: number) => 1 - (1 - t) ** 3;
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const outBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const inBack = (t: number) => 2.70158 * t ** 3 - 1.70158 * t ** 2;
function outBounce(t: number) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
const hop = (q: number) => 4 * q * (1 - q);
const bump = (p: number, at: number, w = 0.045) => Math.exp(-(((p - at) / w) ** 2));

/** Applies an entrance at progress p (0..1). */
export function applyEnter(L: Look, kind: EnterKind, p: number) {
  const q = c01(p);
  switch (kind) {
    case 'pop':
      L.scale *= 0.55 + 0.45 * outBack(q);
      L.alpha *= c01(q * 2.5);
      break;
    case 'fade':
      L.alpha *= outCubic(q);
      break;
    case 'grow':
      L.scale *= outCubic(q);
      break;
    case 'drop':
      L.dy -= 260 * (1 - outBounce(q));
      L.alpha *= c01(q * 4);
      break;
    case 'slide':
      L.dx -= 320 * (1 - outCubic(q));
      L.alpha *= outCubic(q);
      break;
    case 'zoom':
      L.scale *= 1 + 1.2 * (1 - outCubic(q));
      L.alpha *= outCubic(q);
      break;
    case 'draw':
      L.draw = inOutCubic(q);
      break;
  }
}

/** Applies an effect at progress p (0..1). Returns false once it has left the element hidden. */
export function applyFx(L: Look, kind: FxKind, p: number): boolean {
  const q = c01(p);
  switch (kind) {
    case 'jump': {
      const up = q < 0.6 ? hop(q / 0.6) * 95 : hop((q - 0.6) / 0.4) * 36;
      L.dy -= up;
      const squash = 0.13 * (bump(q, 0.6) + 0.6 * bump(q, 1) + 0.5 * bump(q, 0.02));
      L.sy *= 1 - squash;
      L.sx *= 1 + squash * 0.8;
      break;
    }
    case 'shake':
      L.dx += Math.sin(q * Math.PI * 10) * 16 * (1 - q);
      break;
    case 'pulse':
      L.scale *= 1 + 0.16 * Math.abs(Math.sin(q * Math.PI * 2));
      L.thick += 4 * Math.abs(Math.sin(q * Math.PI * 2));
      break;
    case 'spin':
      L.rot += inOutCubic(q) * Math.PI * 2;
      break;
    case 'wiggle':
      L.rot += Math.sin(q * Math.PI * 6) * 0.16 * (1 - q);
      break;
    case 'glow':
      L.glow = Math.max(L.glow, c01(q * 3));
      break;
    case 'collapse':
      L.scale *= Math.max(0, 1 - inBack(q));
      L.alpha *= 1 - c01((q - 0.65) / 0.35);
      L.draw = Math.min(L.draw, 1 - inOutCubic(q));
      return q < 1;
    case 'regrow':
      L.scale *= Math.max(0, outBack(q));
      L.alpha *= c01(q * 3);
      L.draw = Math.min(L.draw, inOutCubic(q));
      break;
    case 'fadeout':
      L.alpha *= 1 - outCubic(q);
      return q < 1;
    case 'run':
      L.travel = inOutCubic(q);
      break;
    case 'runback':
      L.travel = 1 - inOutCubic(q);
      break;
    case 'flow':
      L.flowing = true;
      break;
  }
  return true;
}

const HIDES = new Set<FxKind>(['collapse', 'fadeout']);
const SHOWS = new Set<FxKind>(['regrow']);

export interface Timing {
  presenting: boolean;
  step: number;
  /** ms since the current step started; Infinity when stepping backwards (no animation). */
  since: number;
}

/**
 * Look of an element with the given appear step, entrance and effects.
 * `order` staggers several things happening in the same step. Returns null when hidden.
 */
export function lookAt(appear: number, enter: EnterKind, fx: Fx[] | undefined, order: number, tm: Timing): Look | null {
  const L = idle();
  if (!tm.presenting) return L;
  const S = tm.step;
  let visible = appear === 0;
  let away = false;
  const sorted = (fx ?? []).slice().sort((a, b) => a.step - b.step);
  // State going into this step.
  if (appear > 0 && appear < S) visible = true;
  for (const f of sorted) {
    if (f.step >= S) break;
    if (HIDES.has(f.kind)) visible = false;
    else if (SHOWS.has(f.kind)) visible = true;
    else if (f.kind === 'run') away = true;
    else if (f.kind === 'runback') away = false;
  }
  L.travel = away ? 1 : 0;
  const t = tm.since - order * STAGGER;
  if (appear === S && S > 0) {
    visible = true;
    L.current = true;
    if (t < 0) return null;
    applyEnter(L, enter, t / ENTER_MS[enter]);
  }
  for (const f of sorted) {
    if (f.step !== S) continue;
    L.current = true;
    if (SHOWS.has(f.kind)) visible = true;
    if (!visible) continue;
    if (t < 0) {
      if (f.kind === 'regrow') return null;
      continue;
    }
    if (!applyFx(L, f.kind, FX_MS[f.kind] ? t / FX_MS[f.kind] : 1)) visible = false;
  }
  return visible ? L : null;
}

/** A one-off preview of an animation while editing. */
export function previewLook(kind: EnterKind | FxKind, elapsed: number): Look | null {
  const L = idle();
  if (kind in ENTER_MS) {
    const p = elapsed / ENTER_MS[kind as EnterKind];
    if (p > 1) return L;
    applyEnter(L, kind as EnterKind, p);
    return L;
  }
  const ms = FX_MS[kind as FxKind] || 900;
  const p = elapsed / ms;
  if (p > 1.4) return L; // hold the end pose briefly, then snap back
  applyFx(L, kind as FxKind, Math.min(1, p));
  if (kind === 'flow') L.flowing = p < 1.4;
  L.alpha = Math.max(L.alpha, 0.15);
  return L;
}
