import type { CamBubble, Layout, View } from '../types';
import { clamp } from '../lib/util';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CamPlacement {
  rect: Rect;
  circle: boolean;
  radius: number;
  /** Bubbles can be dragged; the side-by-side panel is fixed. */
  movable: boolean;
}

export interface SceneLayout {
  bg: 'board' | 'screen' | 'camera';
  /** Where the board / ink lives inside the frame. */
  region: Rect;
  cam: CamPlacement | null;
}

/** Page → frame transform: frame = page * scale + offset. */
export interface Xform {
  scale: number;
  ox: number;
  oy: number;
}

export function bubblePlacement(b: CamBubble, W: number, H: number): CamPlacement {
  const short = Math.min(W, H);
  const h = short * clamp(b.size, 0.12, 0.62);
  const w = b.shape === 'circle' ? h : h * 1.33;
  const m = short * 0.03;
  const cx = clamp(b.x * W, m + w / 2, W - m - w / 2);
  const cy = clamp(b.y * H, m + h / 2, H - m - h / 2);
  return { rect: { x: cx - w / 2, y: cy - h / 2, w, h }, circle: b.shape === 'circle', radius: h * 0.16, movable: true };
}

export function computeLayout(layout: Layout, W: number, H: number, bubble: CamBubble): SceneLayout {
  const full: Rect = { x: 0, y: 0, w: W, h: H };
  switch (layout) {
    case 'board':
      return { bg: 'board', region: full, cam: null };
    case 'board-cam':
      return { bg: 'board', region: full, cam: bubblePlacement(bubble, W, H) };
    case 'screen-cam':
      return { bg: 'screen', region: full, cam: bubblePlacement(bubble, W, H) };
    case 'cam':
      return { bg: 'camera', region: full, cam: null };
    case 'side': {
      const m = Math.round(Math.min(W, H) * 0.035);
      if (W >= H) {
        const cw = Math.round(W * 0.32);
        return {
          bg: 'board',
          region: { x: 0, y: 0, w: W - cw, h: H },
          cam: { rect: { x: W - cw, y: m, w: cw - m, h: H - m * 2 }, circle: false, radius: m, movable: false },
        };
      }
      const ch = Math.round(H * 0.42);
      return {
        bg: 'board',
        region: { x: 0, y: ch, w: W, h: H - ch },
        cam: { rect: { x: m, y: m, w: W - m * 2, h: ch - m }, circle: false, radius: m, movable: false },
      };
    }
  }
}

/** The page (W×H units) is fitted into the region, then panned/zoomed by the page view. */
export function viewXform(R: Rect, W: number, H: number, v: View): Xform {
  const base = Math.min(R.w / W, R.h / H);
  const scale = base * v.zoom;
  return {
    scale,
    ox: R.x + (R.w - W * base) / 2 - v.x * scale,
    oy: R.y + (R.h - H * base) / 2 - v.y * scale,
  };
}

export const toWorld = (t: Xform, x: number, y: number) => ({ x: (x - t.ox) / t.scale, y: (y - t.oy) / t.scale });

/** Zoom by `factor` keeping the page point under (sx, sy) fixed. */
export function zoomAt(v: View, R: Rect, W: number, H: number, sx: number, sy: number, factor: number): View {
  const base = Math.min(R.w / W, R.h / H);
  const w = toWorld(viewXform(R, W, H, v), sx, sy);
  const zoom = clamp(v.zoom * factor, 0.25, 6);
  const scale = base * zoom;
  const cx = R.x + (R.w - W * base) / 2;
  const cy = R.y + (R.h - H * base) / 2;
  return { zoom, x: w.x - (sx - cx) / scale, y: w.y - (sy - cy) / scale };
}

/** A view that fits page-unit bounds `b` (plus padding) inside the region. */
export function fitView(b: Rect, R: Rect, W: number, H: number, pad = 120, maxZoom = 2): View {
  const base = Math.min(R.w / W, R.h / H);
  const zoom = clamp(Math.min(R.w / ((b.w + pad * 2) * base), R.h / ((b.h + pad * 2) * base)), 0.3, maxZoom);
  return { zoom, x: b.x + b.w / 2 - W / (2 * zoom), y: b.y + b.h / 2 - H / (2 * zoom) };
}
