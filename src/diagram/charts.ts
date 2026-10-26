// Charts on the board: line, area, bar, pie, donut and candlestick. Each draws itself in when its
// step comes (lines left to right, bars growing, slices sweeping) with numbers counting up.
import type { ChartKind, ChartSpec, DiagramNode } from '../types';
import { C, slotColor, themed, type DiagramTheme } from './theme';

const FONT = (size: number, weight = 600) => `${weight} ${size}px "Inter Variable", Inter, system-ui, sans-serif`;
const SERIES_SLOTS = [C.blue, C.green, C.orange, C.purple, C.red, C.teal, C.yellow];

export const CHART_KINDS: { kind: ChartKind; label: string }[] = [
  { kind: 'line', label: 'Line' },
  { kind: 'area', label: 'Area' },
  { kind: 'bar', label: 'Bar' },
  { kind: 'pie', label: 'Pie' },
  { kind: 'donut', label: 'Donut' },
  { kind: 'candle', label: 'Candles' },
];

/** Starter data for each kind, clearly marked as sample data. */
export function sampleChart(kind: ChartKind): ChartSpec {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  switch (kind) {
    case 'line':
      return { kind, title: 'Share price (sample)', unit: '$', labels: months, series: [{ name: 'ACME', values: [102, 108, 105, 115, 121, 97, 88, 104, 118, 126, 133, 141] }] };
    case 'area':
      return { kind, title: 'Monthly users (sample)', unit: '', labels: months.slice(0, 8), series: [{ name: 'Users', values: [1200, 1900, 2600, 3900, 5200, 7400, 9800, 13100] }] };
    case 'bar':
      return { kind, title: 'Inflation by year, % (sample)', unit: '%', labels: ['2019', '2020', '2021', '2022', '2023', '2024'], series: [{ name: 'Inflation', values: [1.8, 1.2, 4.7, 8.0, 4.1, 2.9] }] };
    case 'pie':
    case 'donut':
      return { kind, title: 'Market share (sample)', unit: '%', labels: ['Alpha', 'Beta', 'Gamma', 'Others'], series: [{ name: 'Share', values: [42, 27, 18, 13] }] };
    case 'candle': {
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const c = [100, 103, 101, 106, 110, 107, 104, 109, 114, 112];
      const candles = c.map((close, i) => {
        const open = i ? c[i - 1] : 98;
        return { o: open, c: close, h: Math.max(open, close) + 2 + (i % 3), l: Math.min(open, close) - 2 - (i % 2) };
      });
      return { kind, title: 'Daily price (sample)', unit: '$', labels, series: [{ name: 'Close', values: c }], candles };
    }
  }
}

// ---------------------------------------------------------------- pasted tables

/** Numbers as people paste them: "$1,234.5", "4.7%", "(12)", "1 234". */
export function parseNumber(s: string): number {
  const t = s.trim();
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t);
  const v = parseFloat(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(v) ? (neg ? -v : v) : NaN;
}

function splitRow(line: string, sep: string) {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') (cur += '"'), i++;
      else quoted = !quoted;
    } else if (ch === sep && !quoted) (out.push(cur.trim()), (cur = ''));
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Reads CSV, TSV (pasted from Excel / Google Sheets) or semicolon tables. */
export function parseTable(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const sep = first.includes('\t') ? '\t' : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  return lines.map((l) => splitRow(l, sep));
}

/** Builds chart data from a table; the first column is the labels, the first row the names. */
export function specFromTable(base: ChartSpec, rows: string[][]): ChartSpec | string {
  if (rows.length < 2 && !(rows.length === 1 && rows[0].length > 1)) return 'Add at least two rows: a label and a number on each line.';
  const hasHeader = rows[0].slice(1).some((c) => c && Number.isNaN(parseNumber(c)));
  const header = hasHeader ? rows[0] : ['Label', ...rows[0].slice(1).map((_, i) => (i ? `Series ${i + 1}` : 'Value'))];
  const body = hasHeader ? rows.slice(1) : rows;
  if (!body.length) return 'There are names but no numbers yet.';
  const labels = body.map((r) => r[0] ?? '');
  if (base.kind === 'candle') {
    const find = (name: string, fallback: number) => {
      const i = header.findIndex((h) => h.toLowerCase().startsWith(name));
      return i > 0 ? i : fallback;
    };
    const [io, ih, il, ic] = [find('open', 1), find('high', 2), find('low', 3), find('close', 4)];
    const candles = body.map((r) => ({ o: parseNumber(r[io] ?? ''), h: parseNumber(r[ih] ?? ''), l: parseNumber(r[il] ?? ''), c: parseNumber(r[ic] ?? '') }));
    if (candles.some((k) => [k.o, k.h, k.l, k.c].some(Number.isNaN))) return 'Candles need four numbers per row: open, high, low, close.';
    return { ...base, labels, candles, series: [{ name: 'Close', values: candles.map((k) => k.c) }] };
  }
  const series = header.slice(1).map((name, j) => ({ name: name || `Series ${j + 1}`, values: body.map((r) => parseNumber(r[j + 1] ?? '')) }));
  const usable = series.filter((s) => s.values.some((v) => !Number.isNaN(v)));
  if (!usable.length) return 'No numbers found. Put labels in the first column and numbers next to them.';
  return { ...base, labels, series: usable.map((s) => ({ ...s, values: s.values.map((v) => (Number.isNaN(v) ? 0 : v)) })), candles: undefined };
}

/** The chart's data as editable text (tab-separated, so it round-trips with spreadsheets). */
export function tableText(spec: ChartSpec): string {
  if (spec.kind === 'candle' && spec.candles) {
    return ['Label\tOpen\tHigh\tLow\tClose', ...spec.labels.map((l, i) => {
      const k = spec.candles![i];
      return [l, k.o, k.h, k.l, k.c].join('\t');
    })].join('\n');
  }
  return [['Label', ...spec.series.map((s) => s.name)].join('\t'), ...spec.labels.map((l, i) => [l, ...spec.series.map((s) => s.values[i] ?? '')].join('\t'))].join('\n');
}

/** Switches chart kind, keeping the data that still makes sense. */
export function changeKind(spec: ChartSpec, kind: ChartKind): ChartSpec {
  if (kind === spec.kind) return spec;
  if (kind === 'candle' && !spec.candles) {
    const v = spec.series[0]?.values ?? [];
    const candles = v.map((c, i) => {
      const o = i ? v[i - 1] : c;
      return { o, c, h: Math.max(o, c), l: Math.min(o, c) };
    });
    return { ...spec, kind, candles };
  }
  return { ...spec, kind };
}

// ---------------------------------------------------------------- scales and numbers

const CURRENCY = /^[$€£₹¥₩₽₺₦]|^(Rs|NPR|INR|USD)\s?$/;

export function fmt(v: number, unit = '') {
  const a = Math.abs(v);
  let s: string;
  if (a >= 1e12) s = `${(v / 1e12).toFixed(1)}T`;
  else if (a >= 1e9) s = `${(v / 1e9).toFixed(1)}B`;
  else if (a >= 1e6) s = `${(v / 1e6).toFixed(1)}M`;
  else if (a >= 1e4) s = `${(v / 1e3).toFixed(1)}k`;
  else if (a >= 100 || Number.isInteger(v)) s = Math.round(v).toLocaleString('en-US');
  else s = v.toFixed(a < 10 ? 1 : 0);
  s = s.replace(/\.0([kMBT]?)$/, '$1');
  if (!unit) return s;
  if (CURRENCY.test(unit)) return v < 0 ? `-${unit}${s.slice(1)}` : `${unit}${s}`;
  return `${s}${unit}`;
}

function niceScale(min: number, max: number, ticks = 5) {
  if (min === max) (min -= 1), (max += 1);
  const raw = (max - min) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

const ease = (t: number) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// ---------------------------------------------------------------- drawing

/** Draws a chart node into its box. `p` (0..1) is how far its reveal animation has got. */
export function drawChart(ctx: CanvasRenderingContext2D, n: DiagramNode, th: DiagramTheme, p: number) {
  const spec = n.chart;
  if (!spec) return;
  const { x, y, w, h } = n;
  const pad = 28;
  const colors = spec.series.map((_, i) => themed(slotColor(SERIES_SLOTS[i % SERIES_SLOTS.length]), th));
  const grid = th.dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,30,50,0.08)';

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  // Solid, unlike boxes: data must stay readable over anything behind it.
  ctx.fillStyle = th.dark ? '#14171f' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = th.dark ? 'rgba(255,255,255,0.10)' : 'rgba(20,30,50,0.12)';
  ctx.stroke();

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  // Legend for several series (pie/donut label their slices instead).
  const round = spec.kind === 'pie' || spec.kind === 'donut';
  const legend = !round && spec.series.length > 1;
  ctx.font = FONT(19, 600);
  const legendW = legend ? spec.series.reduce((sum, s) => sum + ctx.measureText(s.name).width + 40, 0) : 0;
  ctx.font = FONT(30, 700);
  const titleW = ctx.measureText(spec.title).width;
  const ownLine = legend && titleW + legendW + 24 > w - pad * 2;
  ctx.fillStyle = th.text;
  ctx.fillText(spec.title, x + pad, y + pad, w - pad * 2);
  let headH = 58;
  if (legend) {
    ctx.font = FONT(19, 600);
    const ly = ownLine ? y + pad + 44 : y + pad + 6;
    let lx = ownLine ? x + pad + legendW : x + w - pad;
    for (let i = spec.series.length - 1; i >= 0; i--) {
      const name = spec.series[i].name;
      lx -= ctx.measureText(name).width;
      ctx.fillStyle = th.muted;
      ctx.fillText(name, lx, ly);
      lx -= 18;
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(lx + 6, ly + 10, 6, 0, Math.PI * 2);
      ctx.fill();
      lx -= 22;
    }
    if (ownLine) headH += 34;
  }
  if (spec.source) {
    ctx.font = FONT(16, 500);
    ctx.fillStyle = th.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Source: ${spec.source}`, x + w - pad, y + h - 12);
  }

  const top = y + pad + headH;
  const bottom = y + h - pad - (spec.source ? 22 : 0);
  if (round) return drawRound(ctx, spec, colors, th, { x: x + pad, y: top, w: w - pad * 2, h: bottom - top }, p);

  // Cartesian charts: y axis on the left, labels along the bottom.
  const values = spec.kind === 'candle' && spec.candles ? spec.candles.flatMap((k) => [k.h, k.l]) : spec.series.flatMap((s) => s.values);
  let min = Math.min(...values), max = Math.max(...values);
  if (spec.kind === 'bar' || spec.kind === 'area') (min = Math.min(0, min)), (max = Math.max(0, max));
  else {
    const span = max - min || Math.abs(max) || 1;
    (min -= span * 0.08), (max += span * 0.08);
  }
  const sc = niceScale(min, max);
  ctx.font = FONT(18, 500);
  const yLabelW = Math.max(...[sc.lo, sc.hi].map((v) => ctx.measureText(fmt(v, spec.unit)).width)) + 14;
  const plot = { x: x + pad + yLabelW, y: top, w: w - pad * 2 - yLabelW, h: bottom - top - 36 };
  const Y = (v: number) => plot.y + plot.h - ((v - sc.lo) / (sc.hi - sc.lo)) * plot.h;

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  for (let v = sc.lo; v <= sc.hi + sc.step / 2; v += sc.step) {
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, Math.round(Y(v)) + 0.5);
    ctx.lineTo(plot.x + plot.w, Math.round(Y(v)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = th.muted;
    ctx.fillText(fmt(v, spec.unit), plot.x - 12, Y(v));
  }

  const count = spec.labels.length;
  const slot = plot.w / Math.max(1, count);
  const X = (i: number) => (spec.kind === 'line' || spec.kind === 'area' ? plot.x + (count > 1 ? (i / (count - 1)) * plot.w : plot.w / 2) : plot.x + slot * (i + 0.5));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = th.muted;
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plot.w / 84))));
  // Every n-th label, always ending on the latest one (dropping the regular label just before it).
  const last = count - 1;
  const lastRegular = last - (last % every);
  spec.labels.forEach((l, i) => {
    const show = i === last || (i % every === 0 && (i !== lastRegular || lastRegular === last || last - i >= every));
    if (show) ctx.fillText(l, X(i), plot.y + plot.h + 10, Math.max(slot * every, 60));
  });

  if (spec.kind === 'bar') {
    const groups = spec.series.length;
    const bw = Math.min(64, (slot * 0.72) / groups);
    spec.series.forEach((s, j) => {
      s.values.forEach((v, i) => {
        const t = ease((p * 1.5 - (i / Math.max(1, count)) * 0.5) * 1.2);
        if (t <= 0) return;
        const bx = X(i) - (bw * groups) / 2 + j * bw + 2;
        const y0 = Y(0), y1 = Y(v * t);
        ctx.fillStyle = colors[j];
        ctx.beginPath();
        ctx.roundRect(bx, Math.min(y0, y1), bw - 4, Math.abs(y1 - y0), v >= 0 ? [6, 6, 0, 0] : [0, 0, 6, 6]);
        ctx.fill();
        if (t > 0.5 && bw > 26) {
          ctx.font = FONT(groups > 1 ? 16 : 19, 650);
          ctx.fillStyle = th.text;
          ctx.textBaseline = v >= 0 ? 'bottom' : 'top';
          ctx.fillText(fmt(v * t, spec.unit), bx + (bw - 4) / 2, y1 + (v >= 0 ? -6 : 6));
        }
      });
    });
    return;
  }

  if (spec.kind === 'candle' && spec.candles) {
    const up = themed(slotColor(C.green), th), down = themed(slotColor(C.red), th);
    const shown = p * count;
    spec.candles.forEach((k, i) => {
      const a = clamp01(shown - i);
      if (a <= 0) return;
      ctx.globalAlpha *= a;
      const cx = X(i), cw = Math.min(28, slot * 0.6);
      const col = k.c >= k.o ? up : down;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, Y(k.h));
      ctx.lineTo(cx, Y(k.l));
      ctx.stroke();
      const yo = Y(k.o), yc = Y(k.c);
      ctx.fillRect(cx - cw / 2, Math.min(yo, yc), cw, Math.max(2, Math.abs(yc - yo)));
      ctx.globalAlpha /= a;
    });
    return;
  }

  // Line and area: the line runs left to right; a dot at its tip shows the value counting along.
  const badges: { x: number; y: number; label: string; color: string }[] = [];
  spec.series.forEach((s, j) => {
    const vals = s.values;
    if (!vals.length) return;
    const reach = p * (vals.length - 1);
    const pts: [number, number][] = [];
    for (let i = 0; i < vals.length && i <= reach; i++) pts.push([X(i), Y(vals[i])]);
    const i0 = Math.floor(reach);
    let tipV = vals[Math.min(i0, vals.length - 1)];
    if (i0 < vals.length - 1 && reach > i0) {
      const f = reach - i0;
      tipV = vals[i0] + (vals[i0 + 1] - vals[i0]) * f;
      pts.push([X(i0) + (X(i0 + 1) - X(i0)) * f, Y(tipV)]);
    }
    if (pts.length < 1) return;
    if (spec.kind === 'area' && pts.length > 1) {
      const g = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
      g.addColorStop(0, `${colors[j]}66`);
      g.addColorStop(1, `${colors[j]}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], Y(Math.max(sc.lo, 0)));
      pts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.lineTo(pts[pts.length - 1][0], Y(Math.max(sc.lo, 0)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = colors[j];
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    const [tx, ty] = pts[pts.length - 1];
    ctx.fillStyle = colors[j];
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = th.dark ? '#0e1016' : '#ffffff';
    ctx.stroke();
    // Value badge at the tip (counts along while drawing; stays on the last point).
    badges.push({ x: tx, y: ty - 40, label: fmt(tipV, spec.unit), color: colors[j] });
  });
  badges.sort((a, b) => a.y - b.y);
  for (let i = 1; i < badges.length; i++) badges[i].y = Math.max(badges[i].y, badges[i - 1].y + 34);
  ctx.font = FONT(20, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const b of badges) {
    const bw = ctx.measureText(b.label).width + 18;
    const bx = Math.min(b.x + 12, plot.x + plot.w - bw + 8);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.roundRect(bx, b.y, bw, 30, 15);
    ctx.fill();
    ctx.fillStyle = th.dark ? '#0b0d12' : '#ffffff';
    ctx.fillText(b.label, bx + 9, b.y + 15);
  }
}

function drawRound(ctx: CanvasRenderingContext2D, spec: ChartSpec, _colors: string[], th: DiagramTheme, box: { x: number; y: number; w: number; h: number }, p: number) {
  const vals = (spec.series[0]?.values ?? []).map((v) => Math.max(0, v));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const colors = vals.map((_, i) => themed(slotColor(SERIES_SLOTS[i % SERIES_SLOTS.length]), th));
  const legendW = Math.min(260, box.w * 0.38);
  const r = Math.min((box.w - legendW) / 2, box.h / 2) - 6;
  const cx = box.x + (box.w - legendW) / 2, cy = box.y + box.h / 2;
  const sweep = ease(p) * Math.PI * 2;
  let a = -Math.PI / 2;
  vals.forEach((v, i) => {
    const part = (v / total) * Math.PI * 2;
    const end = Math.min(a + part, -Math.PI / 2 + sweep);
    if (end > a) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, end);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = th.nodeBase.startsWith('#') ? th.nodeBase : th.dark ? '#14161f' : '#ffffff';
      ctx.stroke();
      // Percentage on the slice once it's fully drawn.
      if (end >= a + part - 1e-6 && part > 0.3) {
        const mid = a + part / 2, rr = spec.kind === 'donut' ? r * 0.79 : r * 0.64;
        ctx.font = FONT(20, 700);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round((v / total) * 100)}%`, cx + Math.cos(mid) * rr, cy + Math.sin(mid) * rr);
      }
    }
    a += part;
  });
  if (spec.kind === 'donut') {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = th.dark ? '#14161f' : '#ffffff';
    ctx.fill();
    ctx.fillStyle = th.text;
    ctx.font = FONT(30, 750);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(total * ease(p), spec.unit === '%' ? '' : spec.unit), cx, cy - 8);
    ctx.font = FONT(17, 500);
    ctx.fillStyle = th.muted;
    ctx.fillText(spec.series[0]?.name ?? 'Total', cx, cy + 22);
  }
  // Legend
  ctx.font = FONT(20, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lx = box.x + box.w - legendW + 10;
  const ly = cy - (spec.labels.length * 34) / 2 + 17;
  spec.labels.forEach((label, i) => {
    const yy = ly + i * 34;
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.roundRect(lx, yy - 9, 18, 18, 5);
    ctx.fill();
    ctx.fillStyle = th.text;
    ctx.fillText(label, lx + 28, yy, legendW - 110);
    ctx.fillStyle = th.muted;
    ctx.textAlign = 'right';
    ctx.fillText(fmt(vals[i] ?? 0, spec.unit), box.x + box.w, yy);
    ctx.textAlign = 'left';
  });
}
