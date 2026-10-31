// Follows the page under your marks as it scrolls, so a circle around a paragraph stays on that
// paragraph. Works from the shared-screen video alone: compare each frame with the last one
// around the marks, find the vertical / horizontal shift that lines them up, and move the marks.
// While the marks are on screen it also remembers what the page looks like around them; once
// they scroll out of view it looks for that spot in every frame and puts them back exactly there
// when it returns (also after a Page Down too big to follow, and without drift).
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
  /** What the page looked like around the marks, and where they were then (half-scale px). */
  private anchor: { tpl: Uint8Array; tw: number; th: number; tx: number; ty: number; rx: number; ry: number } | null = null;
  private sinceAnchor = 0;
  private searches = 0;
  /** What the last comparison saw (for diagnostics). */
  last: { still: number; dx: number; dy: number; e: number; dys: number[]; dxs: number[] } | null = null;

  reset() {
    this.prev = null;
    this.anchor = null;
  }

  /** Remember the page around the marks (fully on screen, textured enough to find again). */
  private remember(cur: Uint8Array, rx: number, ry: number, rw: number, rh: number) {
    const w = this.w, h = this.h;
    const tw = Math.min(240, Math.max(64, Math.round(rw + 40))), th = Math.min(160, Math.max(48, Math.round(rh + 40)));
    const tx = Math.round(rx + rw / 2 - tw / 2), ty = Math.round(ry + rh / 2 - th / 2);
    if (tx < 0 || ty < 0 || tx + tw > w || ty + th > h) return;
    const tpl = new Uint8Array(tw * th);
    let sum = 0, sq = 0;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const v = cur[(ty + y) * w + tx + x];
      tpl[y * tw + x] = v;
      sum += v;
      sq += v * v;
    }
    const n = tw * th, sd = Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
    if (sd < 12) return; // a blank area could be found anywhere
    this.anchor = { tpl, tw, th, tx, ty, rx, ry };
    this.sinceAnchor = 0;
  }

  /** How different the remembered spot is from this frame at (x, y), half-scale px; Infinity if off screen. */
  private costAt(cur: Uint8Array, x: number, y: number) {
    const a = this.anchor!, w = this.w;
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x + a.tw > w || y + a.th > this.h) return Infinity;
    let e = 0, n = 0;
    for (let ty = 0; ty < a.th; ty += 2) {
      const row = (y + ty) * w + x, trow = ty * a.tw;
      for (let tx = 0; tx < a.tw; tx += 2) {
        e += Math.abs(cur[row + tx] - a.tpl[trow + tx]);
        n++;
      }
    }
    return e / n;
  }

  /** Where the remembered spot should be for marks at (rx, ry), half-scale px. */
  private expected(rx: number, ry: number) {
    const a = this.anchor!;
    return { x: a.tx + (rx - a.rx), y: a.ty + (ry - a.ry) };
  }

  /**
   * Check the remembered spot near where the marks are now expected; if they have slipped (a jump
   * too big to follow, or drift), say how far to move them. Searches the whole frame when needed.
   */
  private verify(cur: Uint8Array, rx: number, ry: number): { dx: number; dy: number } | null {
    if (!this.anchor) return null;
    const ex = this.expected(rx, ry);
    const here = this.costAt(cur, ex.x, ex.y);
    if (here < 6) {
      // Close by: settle on the exact pixel.
      let bx = ex.x, by = ex.y, be = here;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const e = this.costAt(cur, ex.x + dx, ex.y + dy);
        if (e < be - 0.3) { be = e; bx = ex.x + dx; by = ex.y + dy; }
      }
      return bx !== ex.x || by !== ex.y ? { dx: bx - ex.x, dy: by - ex.y } : null;
    }
    const at = this.find(cur);
    return at ? { dx: at.x - ex.x, dy: at.y - ex.y } : null;
  }

  /** Where the remembered spot is in this frame, if it is clearly there (half-scale px). */
  private find(cur: Uint8Array): { x: number; y: number } | null {
    const a = this.anchor!, w = this.w, h = this.h;
    // Coarse pass at quarter scale over the whole height and a band around the old column.
    const q = (img: Uint8Array, iw: number, ih: number) => {
      const qw = iw >> 1, qh = ih >> 1, out = new Uint8Array(qw * qh);
      for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
        const i = 2 * y * iw + 2 * x;
        out[y * qw + x] = (img[i] + img[i + 1] + img[i + iw] + img[i + iw + 1]) >> 2;
      }
      return { img: out, w: qw, h: qh };
    };
    const S = q(cur, w, h), T = q(a.tpl, a.tw, a.th);
    const cost = (img: Uint8Array, iw: number, tpl: Uint8Array, tw: number, th: number, x: number, y: number, step: number) => {
      let e = 0, n = 0;
      for (let ty = 0; ty < th; ty += step) {
        const row = (y + ty) * iw + x, trow = ty * tw;
        for (let tx = 0; tx < tw; tx += step) {
          e += Math.abs(img[row + tx] - tpl[trow + tx]);
          n++;
        }
      }
      return e / n;
    };
    const cx = a.tx >> 1, band = 40;
    const scored: { x: number; y: number; e: number }[] = [];
    for (let y = 0; y + T.h <= S.h; y += 1) {
      for (let x = Math.max(0, cx - band); x <= Math.min(S.w - T.w, cx + band); x += 2) {
        scored.push({ x, y, e: cost(S.img, S.w, T.img, T.w, T.h, x, y, 2) });
      }
    }
    if (!scored.length) return null;
    scored.sort((p, r) => p.e - r.e);
    const best = scored[0];
    // Something else that looks just as good (repeated rows of code, say): don't guess.
    const rival = scored.find((c) => Math.abs(c.y - best.y) > 6 || Math.abs(c.x - best.x) > 6);
    if (best.e > 14 || (rival && best.e > rival.e * 0.7)) return null;
    // Exact pixel at half scale.
    let fx = best.x * 2, fy = best.y * 2, fe = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = best.x * 2 + dx, y = best.y * 2 + dy;
      if (x < 0 || y < 0 || x + a.tw > w || y + a.th > h) continue;
      const e = cost(cur, w, a.tpl, a.tw, a.th, x, y, 2);
      if (e < fe) { fe = e; fx = x; fy = y; }
    }
    return fe < 12 ? { x: fx, y: fy } : null;
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

    // The marks as they are now (half-scale px), and whether they are all on screen.
    const rx = region.x * s, ry = region.y * s, rw = region.w * s, rh = region.h * s;
    const visible = rx >= 0 && ry >= 0 && rx + rw <= w && ry + rh <= h;
    if (!visible && this.anchor && this.searches++ % 4 === 0) {
      // Out of view: watch for the remembered spot coming back and put the marks right there
      // (a whole-screen search, so every 4th frame is plenty).
      const fix = this.verify(cur, rx, ry);
      if (fix) {
        this.last = { still, dx: fix.dx / s, dy: fix.dy / s, e: -1, dys, dxs };
        return { dx: fix.dx / s, dy: fix.dy / s };
      }
    }
    if (still < 0.8) {
      if (visible && this.anchor) {
        // A quiet frame: make sure the marks still sit on their spot (undo any drift)...
        const fix = this.verify(cur, rx, ry);
        if (fix) return { dx: fix.dx / s, dy: fix.dy / s };
      }
      // ...and now and then remember the page around them afresh.
      if (visible && (!this.anchor || ++this.sinceAnchor > 15)) this.remember(cur, rx, ry, rw, rh);
      return null; // nothing changed
    }
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
    const ok = best.e <= still * 0.55;
    if (this.anchor) {
      // Trust the remembered spot over a frame-to-frame guess (a jump may be too big to follow).
      const fix = this.verify(cur, rx + (ok ? best.dx : 0), ry + (ok ? best.dy : 0));
      const dx = (ok ? best.dx : 0) + (fix?.dx ?? 0), dy = (ok ? best.dy : 0) + (fix?.dy ?? 0);
      return dx || dy ? { dx: dx / s, dy: dy / s } : null;
    }
    if (!ok) return null;
    return { dx: best.dx / s, dy: best.dy / s };
  }
}
