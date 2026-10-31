// Follows the page under your marks as it scrolls, so a circle around a paragraph stays on that
// paragraph. Works from the shared-screen video alone: compare each frame with the last one
// around the marks, find the vertical / horizontal shift that lines them up, and move the marks.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SCALE = 0.5;
/** Furthest a page may move between two frames and still be followed, in screen px. */
const REACH = 480;
const MARGIN = 120;
/** Compare every n-th pixel when checking a candidate shift. */
const STEP = 3;

export class ScrollTracker {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private prev: Uint8Array | null = null;
  private w = 0;
  private h = 0;
  /** What the last comparison saw (for diagnostics). */
  last: { still: number; dx: number; dy: number; e: number; dys: number[]; dxs: number[] } | null = null;

  reset() {
    this.prev = null;
  }

  /**
   * The page's movement since the last call, in screen px, or null when it didn't move (or
   * what changed doesn't look like scrolling). `region` is where the marks are, in screen px.
   */
  update(video: HTMLVideoElement, screenW: number, screenH: number, region: Rect): { dx: number; dy: number } | null {
    const w = Math.ceil(screenW * SCALE), h = Math.ceil(screenH * SCALE);
    if (w !== this.w || h !== this.h) {
      this.canvas.width = this.w = w;
      this.canvas.height = this.h = h;
      this.prev = null;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    const rgba = this.ctx.getImageData(0, 0, w, h).data;
    const cur = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < cur.length; i++, j += 4) cur[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    const prev = this.prev;
    this.prev = cur;
    if (!prev) return null;

    // The patch to follow: around the marks, clipped to the screen. Marks scrolled out of view
    // leave too little to follow, so then the middle of the screen stands in for them.
    const s = SCALE, m = MARGIN * s, reach = Math.round(REACH * s);
    let x0 = Math.max(0, Math.floor(region.x * s - m)), y0 = Math.max(0, Math.floor(region.y * s - m));
    let x1 = Math.min(w, Math.ceil((region.x + region.w) * s + m)), y1 = Math.min(h, Math.ceil((region.y + region.h) * s + m));
    if (x1 - x0 < 48 || y1 - y0 < 48) {
      x0 = Math.round(w * 0.1);
      x1 = Math.round(w * 0.9);
      y0 = Math.round(h * 0.2);
      y1 = Math.round(h * 0.8);
    }
    // A thin strip (marks near an edge) can't tell a big move apart; keep at least 40% of the screen.
    const grow = (a0: number, a1: number, size: number) => {
      const want = Math.round(size * 0.4);
      if (a1 - a0 >= want) return [a0, a1];
      const c = Math.min(Math.max((a0 + a1) / 2, want / 2), size - want / 2);
      return [Math.round(c - want / 2), Math.round(c + want / 2)];
    };
    [x0, x1] = grow(x0, x1, w);
    [y0, y1] = grow(y0, y1, h);
    const pw = x1 - x0, ph = y1 - y0;

    // Quick 1D guesses from row and column sums, then the real check on pixels.
    const rows = (img: Uint8Array, from: number, to: number) => {
      const out = new Float32Array(Math.max(0, to - from));
      for (let y = from; y < to; y++) {
        let sum = 0;
        for (let x = x0; x < x1; x++) sum += img[y * w + x];
        out[y - from] = sum / pw;
      }
      return out;
    };
    const cols = (img: Uint8Array, from: number, to: number) => {
      const out = new Float32Array(Math.max(0, to - from));
      for (let x = from; x < to; x++) {
        let sum = 0;
        for (let y = y0; y < y1; y++) sum += img[y * w + x];
        out[x - from] = sum / ph;
      }
      return out;
    };
    const guesses = (c: Float32Array, p: Float32Array, pFrom: number, cFrom: number, max: number) => {
      // Content moved by d: cur[i] ≈ prev[i - d]. Best few d by profile difference.
      const scored: { d: number; e: number }[] = [];
      for (let d = -max; d <= max; d++) {
        let e = 0, n = 0;
        for (let i = 0; i < c.length; i++) {
          const j = cFrom + i - d - pFrom;
          if (j < 0 || j >= p.length) continue;
          e += Math.abs(c[i] - p[j]);
          n++;
        }
        if (n > c.length * 0.6) scored.push({ d, e: e / n });
      }
      scored.sort((a, b) => a.e - b.e);
      return scored.slice(0, 3).map((g) => g.d);
    };
    const rc = rows(cur, y0, y1), rp = rows(prev, Math.max(0, y0 - reach), Math.min(h, y1 + reach));
    const cc = cols(cur, x0, x1), cp = cols(prev, Math.max(0, x0 - reach), Math.min(w, x1 + reach));
    const dys = guesses(rc, rp, Math.max(0, y0 - reach), y0, reach);
    const dxs = guesses(cc, cp, Math.max(0, x0 - reach), x0, reach);

    // Sum of pixel differences for a candidate (dx, dy), sampled.
    const sad = (dx: number, dy: number) => {
      let e = 0, n = 0;
      for (let y = y0; y < y1; y += STEP) {
        const py = y - dy;
        if (py < 0 || py >= h) continue;
        for (let x = x0; x < x1; x += STEP) {
          const px = x - dx;
          if (px < 0 || px >= w) continue;
          e += Math.abs(cur[y * w + x] - prev[py * w + px]);
          n++;
        }
      }
      return n ? e / n : Infinity;
    };
    const still = sad(0, 0);
    this.last = { still, dx: 0, dy: 0, e: still, dys, dxs };
    if (still < 0.8) return null; // nothing changed
    let best = { dx: 0, dy: 0, e: still };
    const tryAt = (dx: number, dy: number) => {
      if (dx === best.dx && dy === best.dy) return;
      const e = sad(dx, dy);
      if (e < best.e) best = { dx, dy, e };
    };
    for (const dy of dys) tryAt(0, dy);
    for (const dx of dxs) tryAt(dx, 0);
    if (best.dx === 0 && best.dy === 0) return null;
    // Settle on the exact pixel.
    for (let k = 0; k < 2; k++) {
      const { dx, dy } = best;
      for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) tryAt(dx + ex, dy + ey);
    }
    // A real scroll lines the frames up far better than leaving them be; anything less is just
    // the page changing (a video playing, text being typed).
    this.last = { still, dx: best.dx / s, dy: best.dy / s, e: best.e, dys, dxs };
    if (best.e > still * 0.55) return null;
    return { dx: best.dx / s, dy: best.dy / s };
  }
}
