// The chart's data, in one simple window: type, title, unit, a paste-friendly data box,
// real figures from the World Bank, and a live preview you can play.
import { useEffect, useRef, useState } from 'react';
import { FileUp, Globe, LoaderCircle, Play, Plus, X } from 'lucide-react';
import { actions, useStore } from '../store';
import { useDiagramUI } from '../diagram/ui';
import { CHART_KINDS, changeKind, drawChart, parseTable, specFromTable, tableText } from '../diagram/charts';
import { diagramTheme } from '../diagram/theme';
import { getBoardStyle, isOverlayLayout } from '../lib/boards';
import { bridge } from '../platform';
import { pickFiles } from '../lib/util';
import type { ChartSpec, DiagramNode } from '../types';

const INDICATORS = [
  { id: 'FP.CPI.TOTL.ZG', label: 'Inflation (consumer prices, % a year)', title: 'Inflation, % a year', unit: '%' },
  { id: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth (% a year)', title: 'GDP growth, % a year', unit: '%' },
  { id: 'SL.UEM.TOTL.ZS', label: 'Unemployment (% of workers)', title: 'Unemployment, %', unit: '%' },
  { id: 'FR.INR.LEND', label: 'Lending interest rate (%)', title: 'Lending interest rate, %', unit: '%' },
  { id: 'NY.GDP.PCAP.CD', label: 'GDP per person (US$)', title: 'GDP per person, US$', unit: '$' },
  { id: 'NY.GDP.MKTP.CD', label: 'GDP (US$)', title: 'GDP, US$', unit: '$' },
  { id: 'SP.POP.TOTL', label: 'Population', title: 'Population', unit: '' },
];

const COUNTRIES: [string, string][] = [
  ['WLD', 'World'], ['US', 'United States'], ['IN', 'India'], ['CN', 'China'], ['GB', 'United Kingdom'], ['DE', 'Germany'],
  ['FR', 'France'], ['JP', 'Japan'], ['CA', 'Canada'], ['AU', 'Australia'], ['BR', 'Brazil'], ['MX', 'Mexico'],
  ['ZA', 'South Africa'], ['NG', 'Nigeria'], ['EG', 'Egypt'], ['KE', 'Kenya'], ['PK', 'Pakistan'], ['BD', 'Bangladesh'],
  ['NP', 'Nepal'], ['LK', 'Sri Lanka'], ['ID', 'Indonesia'], ['KR', 'South Korea'], ['SG', 'Singapore'], ['IT', 'Italy'],
  ['ES', 'Spain'], ['TR', 'Türkiye'], ['SA', 'Saudi Arabia'], ['AE', 'United Arab Emirates'], ['RU', 'Russia'], ['AR', 'Argentina'],
];

function Preview({ spec, dark, play }: { spec: ChartSpec; dark: boolean; play: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const played = useRef(0);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const th = diagramTheme(dark);
    const node: DiagramNode = { id: 'preview', shape: 'chart', x: 0, y: 0, w: 780, h: 460, text: '', color: '', chart: spec };
    const k = c.width / 780;
    const draw = (p: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawChart(ctx, node, th, p);
    };
    // Animate only when asked (Play, a new chart type, new data fetched), not on every keystroke.
    if (play === played.current) return draw(1);
    played.current = play;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 2200);
      draw(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spec, dark, play]);
  return <canvas ref={ref} width={1040} height={613} className={`chart-preview ${dark ? 'dark' : ''}`} />;
}

function Body({ node }: { node: DiagramNode }) {
  const settings = useStore((s) => s.project!.settings);
  const dark = isOverlayLayout(settings.layout) || getBoardStyle(settings.boardStyle).dark;
  const [spec, setSpec] = useState<ChartSpec>(node.chart!);
  const [text, setText] = useState(() => tableText(node.chart!));
  const [error, setError] = useState('');
  const [play, setPlay] = useState(1);
  const [indicator, setIndicator] = useState(INDICATORS[0].id);
  const [country, setCountry] = useState('WLD');
  const [years, setYears] = useState(15);
  const [busy, setBusy] = useState(false);
  const close = () => useDiagramUI.setState({ chartEditing: null });

  const onText = (v: string) => {
    setText(v);
    const r = specFromTable(spec, parseTable(v));
    if (typeof r === 'string') setError(r);
    else (setError(''), setSpec(r));
  };

  const setKind = (kind: ChartSpec['kind']) => {
    const next = changeKind(spec, kind);
    setSpec(next);
    if ((kind === 'candle') !== (spec.kind === 'candle')) setText(tableText(next));
    setPlay((n) => n + 1);
  };

  const fetchData = async (compare: boolean) => {
    setBusy(true);
    setError('');
    try {
      const ind = INDICATORS.find((i) => i.id === indicator)!;
      const raw = await bridge.worldBank({ country, indicator, years });
      // Two decimals is plenty for rates; whole numbers for money and people.
      const res = { ...raw, points: raw.points.map((pt) => ({ ...pt, value: Math.abs(pt.value) >= 1000 ? Math.round(pt.value) : Math.round(pt.value * 100) / 100 })) };
      if (!res.points.length) throw new Error(`No ${ind.title.toLowerCase()} figures for ${res.country}.`);
      let next: ChartSpec;
      if (compare && spec.source === 'World Bank' && spec.series.length) {
        // Only the years both have, so the lines line up.
        const byYear = new Map(res.points.map((pt) => [pt.year, pt.value]));
        const keep = spec.labels.map((l, i) => [l, i] as const).filter(([l]) => byYear.has(l));
        next = {
          ...spec,
          labels: keep.map(([l]) => l),
          series: [...spec.series.map((s) => ({ ...s, values: keep.map(([, i]) => s.values[i]) })), { name: res.country, values: keep.map(([l]) => byYear.get(l)!) }],
          kind: spec.kind === 'pie' || spec.kind === 'donut' || spec.kind === 'candle' ? 'line' : spec.kind,
        };
      } else {
        next = {
          kind: spec.kind === 'pie' || spec.kind === 'donut' || spec.kind === 'candle' ? 'bar' : spec.kind,
          title: compare ? ind.title : `${ind.title}: ${res.country}`,
          unit: ind.unit,
          labels: res.points.map((pt) => pt.year),
          series: [{ name: res.country, values: res.points.map((pt) => pt.value) }],
          source: 'World Bank',
        };
      }
      if (next.series.length > 1) next.title = ind.title;
      setSpec(next);
      setText(tableText(next));
      setPlay((n) => n + 1);
    } catch (e) {
      setError(`Couldn't get the data. ${(e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')} Check your internet connection.`);
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    const [f] = await pickFiles('.csv,.tsv,.txt,text/csv,text/tab-separated-values', false);
    if (f) onText(await f.text());
  };

  const done = () => {
    actions.updateNodes({ [node.id]: { chart: spec } });
    close();
  };

  return (
    <>
      <div className="picker-head">
        <h2>Chart data</h2>
        <button className="icon-btn" onClick={close} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="chart-editor">
        <div className="chart-form">
          <div className="pill-row">
            {CHART_KINDS.map((c) => (
              <button key={c.kind} className={`pill ${spec.kind === c.kind ? 'on' : ''}`} onClick={() => setKind(c.kind)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="chart-fields">
            <label>
              Title
              <input className="text-field" value={spec.title} onChange={(e) => setSpec({ ...spec, title: e.target.value })} />
            </label>
            <label className="narrow">
              Unit
              <input className="text-field" value={spec.unit ?? ''} placeholder="$ or %" onChange={(e) => setSpec({ ...spec, unit: e.target.value })} />
            </label>
          </div>
          <label className="chart-data-label">
            Data
            <span>Paste from Excel or Google Sheets. First column: labels. First row: names.</span>
          </label>
          <textarea className="chart-data" value={text} spellCheck={false} onChange={(e) => onText(e.target.value)} />
          {error && <p className="chart-error">{error}</p>}
          <div className="chart-row">
            <button className="btn ghost" onClick={importFile}>
              <FileUp size={15} /> Open a CSV file
            </button>
            <span className="chart-tip">Stock prices: in Google Sheets use =GOOGLEFINANCE("AAPL","all",DATE(2025,1,1),TODAY(),"WEEKLY"), then copy and paste here.</span>
          </div>
          <div className="chart-real">
            <div className="menu-label">
              <Globe size={13} /> Get real data (World Bank)
            </div>
            <div className="chart-row">
              <select className="text-field" value={indicator} onChange={(e) => setIndicator(e.target.value)}>
                {INDICATORS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="chart-row">
              <select className="text-field" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <select className="text-field narrow" value={years} onChange={(e) => setYears(Number(e.target.value))}>
                {[10, 15, 20, 30].map((y) => (
                  <option key={y} value={y}>
                    {y} years
                  </option>
                ))}
              </select>
            </div>
            <div className="chart-row">
              <button className="btn primary" disabled={busy} onClick={() => fetchData(false)}>
                {busy ? <LoaderCircle size={15} className="spin" /> : <Globe size={15} />} Get data
              </button>
              {spec.source === 'World Bank' && (
                <button className="btn" disabled={busy} onClick={() => fetchData(true)} title="Add this country as another line or bar">
                  <Plus size={15} /> Compare this country
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="chart-side">
          <Preview spec={spec} dark={dark} play={play} />
          <button className="btn ghost" onClick={() => setPlay((n) => n + 1)}>
            <Play size={15} fill="currentColor" /> Play how it draws in
          </button>
        </div>
      </div>
      <div className="chart-foot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" onClick={done} disabled={!!error}>
          Done
        </button>
      </div>
    </>
  );
}

export function ChartEditor() {
  const id = useDiagramUI((s) => s.chartEditing);
  const node = useStore((s) => s.project?.pages[s.pageIndex]?.nodes?.find((n) => n.id === id));
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useDiagramUI.setState({ chartEditing: null });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);
  if (!node?.chart) return null;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && useDiagramUI.setState({ chartEditing: null })}>
      <div className="modal chart-modal" role="dialog" aria-label="Chart data">
        <Body key={node.id} node={node} />
      </div>
    </div>
  );
}
