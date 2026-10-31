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

/** Frames are compared at half size: plenty for page text, and four times less work. */
export const SCALE = 0.5;
/** Furthest a page may move between two frames and still be followed, in screen px. */
const REACH = 480;
const MARGIN = 120;
/** Compare every n-th pixel when checking a candidate shift. */
const STEP = 3;

export class ScrollTracker {
  private canvas = new OffscreenCanvas(1, 1);
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  /** Frames since the last whole-screen search. */
  private sinceFind = Infinity;
  private prev: Uint8Array | null = null;
  private w = 0;
  private h = 0;
  /** What the page looked like around the marks, and where they were then (half-scale px). */
  private anchor: { tpl: Uint8Array; tw: number; th: number; tx: number; ty: number; rx: number; ry: number } | null = null;
  private sinceAnchor = 0;
  /** The scrolling panel the marks are in, once seen (half-scale columns). */
  private panel: { x0: number; x1: number } | null = null;
  /** The part of the screen that panel scrolls in (screen px): marks are hidden outside it. */
  area: Rect | null = null;
  /** What the last comparison saw (for diagnostics). */
  last: { still: number; dx: number; dy: number; e: number; dys: number[]; dxs: number[] } | null = null;

  reset() {
    this.prev = null;
    this.anchor = null;
    this.panel = null;
    this.area = null;
    this.sinceFind = Infinity;
  }

  /** Remember the page around the marks (fully on screen, textured enough to find again). */
  private remember(cur: Uint8Array, rx: number, ry: number, rw: number, rh: number) {
    const w = this.w, h = this.h;
    let tw = Math.min(240, Math.max(64, Math.round(rw + 40)));
    const th = Math.min(160, Math.max(120, Math.round(rh + 40)));
    let tx = Math.round(rx + rw / 2 - tw / 2);
    const ty = Math.round(Math.min(Math.max(ry + rh / 2 - th / 2, 0), this.h - th));
    // Only from the panel that scrolls (a still sidebar next to it would pin the marks in place),
    // and wide enough to take in its text, not just the blank margin a mark often sits in.
    if (this.panel) {
      const pw = this.panel.x1 - this.panel.x0;
      if (pw < 32) return;
      tw = Math.min(240, pw);
      tx = Math.round(Math.min(Math.max(rx + rw / 2 - tw / 2, this.panel.x0), this.panel.x1 - tw));
    }
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
    if (sd < 4) return; // a blank area could be found anywhere
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
  private verify(cur: Uint8Array, rx: number, ry: number, urgent = false): { dx: number; dy: number } | null {
    if (!this.anchor) return null;
    const ex = this.expected(rx, ry);
    const here = this.costAt(cur, ex.x, ex.y);
    // "Still here" only if it matches far better than the same patch a little above and below:
    // pages full of text look alike everywhere, so a low difference alone proves nothing.
    const around = Math.min(...[-53, -37, 37, 53].map((d) => this.costAt(cur, ex.x, ex.y + d)).filter(Number.isFinite), Infinity);
    if (here < 8 && here < around * 0.5) {
      // Close by: settle on the exact pixel.
      let bx = ex.x, by = ex.y, be = here;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const e = this.costAt(cur, ex.x + dx, ex.y + dy);
        if (e < be - 0.3) { be = e; bx = ex.x + dx; by = ex.y + dy; }
      }
      return bx !== ex.x || by !== ex.y ? { dx: bx - ex.x, dy: by - ex.y } : null;
    }
    // The whole-screen search is the expensive part: every 8th frame (about 4 a second) is plenty.
    if (!urgent && this.sinceFind < 8) return null;
    this.sinceFind = 0;
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
    // It must stand out: far better than a typical spot, and than anything else that looks
    // alike (repeated rows of code, say). Otherwise don't guess.
    const typical = scored[scored.length >> 1].e;
    const rival = scored.find((c) => Math.abs(c.y - best.y) > 6 || Math.abs(c.x - best.x) > 6);
    if (best.e > typical * 0.4 || (rival && best.e > rival.e * 0.6)) return null;
    // Exact pixel at half scale.
    let fx = best.x * 2, fy = best.y * 2, fe = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = best.x * 2 + dx, y = best.y * 2 + dy;
      if (x < 0 || y < 0 || x + a.tw > w || y + a.th > h) continue;
      const e = cost(cur, w, a.tpl, a.tw, a.th, x, y, 2);
      if (e < fe) { fe = e; fx = x; fy = y; }
    }
    return fe < typical * 0.4 ? { x: fx, y: fy } : null;
  }

  /**
   * The page's movement since the last call, in screen px, or null when it didn't move (or
   * what changed doesn't look like scrolling). `region` is where the marks are, in screen px.
   */
  update(video: CanvasImageSource, screenW: number, screenH: number, region: Rect): { dx: number; dy: number } | null {
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
    this.sinceFind++;
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
    let pw = x1 - x0, ph = y1 - y0;

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
    const guessAll = () => {
      const rc = rows(cur, y0, y1), rp = rows(prev, Math.max(0, y0 - reach), Math.min(h, y1 + reach));
      const cc = cols(cur, x0, x1), cp = cols(prev, Math.max(0, x0 - reach), Math.min(w, x1 + reach));
      return [guesses(rc, rp, Math.max(0, y0 - reach), y0, reach), guesses(cc, cp, Math.max(0, x0 - reach), x0, reach)];
    };
    let [dys, dxs] = guessAll();

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
    let still = sad(0, 0);
    this.last = { still, dx: 0, dy: 0, e: still, dys, dxs };

    // The marks as they are now (half-scale px), and whether they are all on screen.
    const rx = region.x * s, ry = region.y * s, rw = region.w * s, rh = region.h * s;
    const visible = rx >= 0 && ry >= 0 && rx + rw <= w && ry + rh <= h;
    if (!visible && this.anchor) {
      // Out of view: watch for the remembered spot coming back and put the marks right there.
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

    // Follow only the panel the marks are in. A screen often has parts that stand still next to
    // the part that scrolls (a sidebar, a toolbar, another window), and those would make a real
    // scroll look like no scroll at all. Columns are split into strips; the moving strips around
    // the marks (small still gaps, like blank margins, allowed) are the panel. Still rows at its
    // top and bottom (a fixed header) are dropped too.
    const STRIP = 8;
    const strips = Math.ceil(w / STRIP);
    const moving = new Uint8Array(strips);
    for (let k = 0; k < strips; k++) {
      let e = 0, n = 0;
      const xb = Math.min(w, k * STRIP + STRIP);
      for (let y = y0; y < y1; y += 3) for (let x = k * STRIP; x < xb; x += 2) {
        e += Math.abs(cur[y * w + x] - prev[y * w + x]);
        n++;
      }
      moving[k] = n && e / n > 1.5 ? 1 : 0;
    }
    const ka = Math.max(0, Math.floor(rx / STRIP)), kb = Math.min(strips - 1, Math.floor((rx + rw) / STRIP));
    let seed = -1;
    for (let k = ka; k <= kb && seed < 0; k++) if (moving[k]) seed = k;
    // A mark in a blank margin sits on columns that look the same after a scroll: take the
    // moving content close beside it (within ~130 px) as its panel.
    for (let d = 1; d <= 8 && seed < 0; d++) {
      if (ka - d >= 0 && moving[ka - d]) seed = ka - d;
      else if (kb + d < strips && moving[kb + d]) seed = kb + d;
    }
    if (seed < 0) {
      // The marks sit on a part that stood still: they stay. (Out of view, look nearby instead.)
      if (visible) return null;
      for (let d = 0; d < strips && seed < 0; d++) {
        if (moving[Math.max(0, ka - d)]) seed = Math.max(0, ka - d);
        else if (moving[Math.min(strips - 1, kb + d)]) seed = Math.min(strips - 1, kb + d);
      }
    }
    if (seed >= 0) {
      const GAP = 6;
      let lo = seed, hi = seed;
      for (let k = seed - 1, gap = 0; k >= 0 && gap <= GAP; k--) moving[k] ? ((lo = k), (gap = 0)) : gap++;
      for (let k = seed + 1, gap = 0; k < strips && gap <= GAP; k++) moving[k] ? ((hi = k), (gap = 0)) : gap++;
      x0 = lo * STRIP;
      x1 = Math.min(w, hi * STRIP + STRIP);
      const rowMoves = (y: number) => {
        let e = 0, n = 0;
        for (let x = x0; x < x1; x += 2) {
          e += Math.abs(cur[y * w + x] - prev[y * w + x]);
          n++;
        }
        return e / n > 1.5;
      };
      // A scroll moves nearly every row of the panel that has something on it; a box appearing or
      // a video playing doesn't. (Blank rows look the same either way, so they don't count.)
      const hasContent = (img: Uint8Array, y: number) => {
        let lo = 255, hi = 0;
        for (let x = x0; x < x1; x += 2) {
          const v = img[y * w + x];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        return hi - lo > 24;
      };
      let movingRows = 0, contentRows = 0;
      for (let y = y0; y < y1; y++) {
        if (!hasContent(cur, y) && !hasContent(prev, y)) continue;
        contentRows++;
        if (rowMoves(y)) movingRows++;
      }
      if (movingRows < contentRows * 0.5) return null;
      while (y1 - y0 > 48 && !rowMoves(y0)) y0++;
      while (y1 - y0 > 48 && !rowMoves(y1 - 1)) y1--;
      // The area marks are shown in: every row and column of this panel seen moving so far (inside
      // a page some rows look the same after a scroll, like the middle of a card, so it builds up
      // over frames), widened through blank rows and margins up to whatever has content but
      // stays put (a header, a footer, a message box, a sidebar).
      const samePanel = this.panel && Math.abs(this.panel.x0 - x0) < 24 && Math.abs(this.panel.x1 - x1) < 24;
      let top = h, bottom = 0;
      for (let y = 0; y < h; y++) if (rowMoves(y)) { if (y < top) top = y; bottom = y + 1; }
      if (bottom > top) {
        // Blank and the same background as the row next to it: a header or a sidebar with its
        // own colour is where it stops.
        const rowMean = (y: number) => {
          let t = 0, n = 0;
          for (let x = x0; x < x1; x += 4) { t += cur[y * w + x]; n++; }
          return t / n;
        };
        const blankRow = (y: number, next: number) => !hasContent(cur, y) && Math.abs(rowMean(y) - rowMean(next)) < 6;
        while (top > 0 && blankRow(top - 1, top)) top--;
        while (bottom < h && blankRow(bottom, bottom - 1)) bottom++;
        const col = (x: number) => {
          let lo = 255, hi = 0, t = 0, n = 0;
          for (let y = top; y < bottom; y += 2) {
            const v = cur[y * w + x];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
            t += v;
            n++;
          }
          return { blank: hi - lo <= 24, mean: t / n };
        };
        const blankCol = (x: number, next: number) => {
          const a = col(x);
          return a.blank && Math.abs(a.mean - col(next).mean) < 6;
        };
        let ax0 = x0, ax1 = x1;
        while (ax0 > 0 && blankCol(ax0 - 1, ax0)) ax0--;
        while (ax1 < w && blankCol(ax1, ax1 - 1)) ax1++;
        const a = samePanel && this.area ? this.area : null;
        const L = Math.min(ax0 / s, a ? a.x : Infinity), R = Math.max(ax1 / s, a ? a.x + a.w : 0);
        const T = Math.min(top / s, a ? a.y : Infinity), B = Math.max(bottom / s, a ? a.y + a.h : 0);
        this.area = { x: L, y: T, w: R - L, h: B - T };
      }
      this.panel = { x0, x1 };
      // A remembered spot that reaches outside the panel is taken again, from the panel alone,
      // out of the frame before this one (where the marks still were where they are now).
      if (this.anchor && (this.anchor.tx < x0 || this.anchor.tx + this.anchor.tw > x1)) {
        this.anchor = null;
        if (visible) this.remember(prev, rx, ry, rw, rh);
      }
      pw = x1 - x0;
      ph = y1 - y0;
      [dys, dxs] = guessAll();
      still = sad(0, 0);
    }
    let best = { dx: 0, dy: 0, e: still };
    const tryAt = (dx: number, dy: number) => {
      if (dx === best.dx && dy === best.dy) return;
      const e = sad(dx, dy);
      if (e < best.e) best = { dx, dy, e };
    };
    for (const dy of dys) tryAt(0, dy);
    for (const dx of dxs) tryAt(dx, 0);
    const found = best.dx !== 0 || best.dy !== 0;
    // Settle on the exact pixel.
    for (let k = 0; found && k < 2; k++) {
      const { dx, dy } = best;
      for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) tryAt(dx + ex, dy + ey);
    }
    // A real scroll lines the frames up far better than leaving them be; anything less is just
    // the page changing (a video playing, text being typed).
    this.last = { still, dx: best.dx / s, dy: best.dy / s, e: best.e, dys, dxs };
    // A real scroll lines the frames up far better than standing still; a lookalike match after a
    // jump too big to follow does not.
    const ok = found && best.e <= still * 0.35;
    if (this.anchor) {
      // Trust the remembered spot over a frame-to-frame guess (a jump may be too big to follow).
      // Right after the page moved, a lost spot means a jump: search now, not in a while.
      const fix = this.verify(cur, rx + (ok ? best.dx : 0), ry + (ok ? best.dy : 0), true);
      const dx = (ok ? best.dx : 0) + (fix?.dx ?? 0), dy = (ok ? best.dy : 0) + (fix?.dy ?? 0);
      return dx || dy ? { dx: dx / s, dy: dy / s } : null;
    }
    if (!ok) return null;
    return { dx: best.dx / s, dy: best.dy / s };
  }
}
