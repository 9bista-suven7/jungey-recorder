// Right-hand panel: "Add" (shapes + icons by sector, with search) and "Steps" (reveal order).
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, ChartArea, ChartCandlestick, ChartColumn, ChartLine, ChartPie, CircleDot, LayoutTemplate, MousePointerClick, Play, Search, Sparkles, Trash, X } from 'lucide-react';
import { CHART_KINDS, sampleChart } from '../diagram/charts';
import { actions, currentPage, useStore } from '../store';
import { useDiagramUI } from '../diagram/ui';
import { SECTORS, existingIcons, iconLabel, loadIconSets, onIconSetsReady, searchIcons, drawIcon, type IconHit } from '../diagram/icons';
import { addFromLibrary, startOrdering } from '../diagram/interact';
import { autoSteps, removeStep, stepCount, stepLabels, swapSteps } from '../diagram/steps';
import { shapePath } from '../diagram/geometry';
import type { ChartKind, DiagramNode, NodeShape } from '../types';

const CHART_ICONS: Record<ChartKind, React.ReactNode> = {
  line: <ChartLine size={26} />,
  area: <ChartArea size={26} />,
  bar: <ChartColumn size={26} />,
  pie: <ChartPie size={26} />,
  donut: <CircleDot size={26} />,
  candle: <ChartCandlestick size={26} />,
};

export const DRAG_TYPE = 'application/x-jungey-node';

const SHAPES: { shape: NodeShape; label: string }[] = [
  { shape: 'rounded', label: 'Box' },
  { shape: 'rect', label: 'Square box' },
  { shape: 'pill', label: 'Pill' },
  { shape: 'ellipse', label: 'Circle' },
  { shape: 'diamond', label: 'Decision' },
  { shape: 'cylinder', label: 'Database' },
  { shape: 'hexagon', label: 'Hexagon' },
  { shape: 'parallelogram', label: 'Input / output' },
  { shape: 'document', label: 'Document' },
  { shape: 'cloud', label: 'Cloud' },
  { shape: 'note', label: 'Sticky note' },
  { shape: 'frame', label: 'Section' },
  { shape: 'text', label: 'Text' },
  { shape: 'dot', label: 'Dot / commit' },
];

/** A tiny drawing of a shape for its tile. */
function ShapeGlyph({ shape }: { shape: NodeShape }) {
  if (shape === 'text') return <span className="glyph-text">Aa</span>;
  const n: DiagramNode = { id: '', shape, x: 6, y: 10, w: 36, h: 24, text: '', color: '' };
  if (shape === 'dot') Object.assign(n, { x: 17, y: 15, w: 14, h: 14 });
  if (shape === 'cylinder' || shape === 'ellipse') Object.assign(n, { x: 9, y: 7, w: 30, h: 30 });
  const p = new Path2D();
  shapePath(p, n);
  return (
    <canvas
      width={96}
      height={88}
      className="glyph"
      ref={(c) => {
        const ctx = c?.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, 48, 44);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#c9ced8';
        ctx.setLineDash(shape === 'frame' ? [4, 3] : []);
        ctx.fillStyle = shape === 'note' ? '#f7d96b' : shape === 'dot' ? '#8b7bff' : 'rgba(139,123,255,0.18)';
        ctx.fill(p);
        if (shape !== 'note') ctx.stroke(p);
      }}
    />
  );
}

function IconGlyph({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 64);
    drawIcon(ctx, id, 8, 8, 48, '#2563eb', () => setTick((t) => t + 1));
  }, [id, tick]);
  return <canvas ref={ref} width={64} height={64} className="glyph icon" />;
}

const dragStart = (e: DragEvent, payload: object) => {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
};

function Tile({ label, onAdd, drag, children }: { label: string; onAdd: () => void; drag: object; children: React.ReactNode }) {
  return (
    <button className="lib-tile" onClick={onAdd} draggable onDragStart={(e) => dragStart(e, drag)} title={`${label}. Click to add, or drag onto the board`}>
      {children}
      <span>{label}</span>
    </button>
  );
}

function AddTab() {
  const [sector, setSector] = useState(SECTORS[0].id);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<IconHit[] | null>(null);
  const [, setReady] = useState(0);
  useEffect(() => onIconSetsReady(() => setReady((r) => r + 1)), []);
  useEffect(() => {
    if (!query.trim()) return setHits(null);
    let live = true;
    void searchIcons(query).then((h) => live && setHits(h));
    return () => {
      live = false;
    };
  }, [query]);
  const sections = useMemo(() => SECTORS.find((s) => s.id === sector)!.sections.map((sec) => ({ ...sec, icons: existingIcons(sec.icons) })), [sector]);
  const addIcon = (id: string) => addFromLibrary('icon', { icon: id, text: iconLabel(id) });

  return (
    <div className="lib-body">
      <div className="lib-search">
        <Search size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search 6,000 icons: maven, bank, tree…" onKeyDown={(e) => e.stopPropagation()} />
        {query && (
          <button className="icon-btn small" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </div>
      {hits ? (
        <div className="lib-grid">
          {hits.map((h) => (
            <Tile key={h.id} label={h.label} onAdd={() => addIcon(h.id)} drag={{ shape: 'icon', icon: h.id, text: h.label }}>
              <IconGlyph id={h.id} />
            </Tile>
          ))}
          {!hits.length && <p className="lib-empty">No icons match “{query}”.</p>}
        </div>
      ) : (
        <>
          <button className="btn wide lib-templates" onClick={() => useDiagramUI.setState({ templatesOpen: true })}>
            <LayoutTemplate size={16} /> Start from a template
          </button>
          <div className="lib-label">Shapes</div>
          <div className="lib-grid shapes">
            {SHAPES.map((s) => (
              <Tile key={s.shape} label={s.label} onAdd={() => addFromLibrary(s.shape, { text: s.shape === 'frame' ? 'Section' : '' })} drag={{ shape: s.shape }}>
                <ShapeGlyph shape={s.shape} />
              </Tile>
            ))}
          </div>
          <div className="lib-label">Charts</div>
          <div className="lib-grid">
            {CHART_KINDS.map((c) => (
              <Tile key={c.kind} label={c.label} onAdd={() => addFromLibrary('chart', { chart: sampleChart(c.kind) })} drag={{ shape: 'chart', chart: sampleChart(c.kind) }}>
                <span className="glyph chart-glyph">{CHART_ICONS[c.kind]}</span>
              </Tile>
            ))}
          </div>
          <div className="sector-tabs" role="tablist">
            {SECTORS.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === sector} className={s.id === sector ? 'on' : ''} onClick={() => setSector(s.id)}>
                {s.title}
              </button>
            ))}
          </div>
          {sections.map((sec) => (
            <div key={sec.title}>
              <div className="lib-label">{sec.title}</div>
              <div className="lib-grid">
                {sec.icons.map((id) => (
                  <Tile key={id} label={iconLabel(id)} onAdd={() => addIcon(id)} drag={{ shape: 'icon', icon: id, text: iconLabel(id) }}>
                    <IconGlyph id={id} />
                  </Tile>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function StepsTab() {
  const page = useStore((s) => s.project?.pages[s.pageIndex]);
  const settings = useStore((s) => s.project!.settings);
  const ordering = useDiagramUI((s) => s.ordering);
  const nodes = page?.nodes ?? [];
  const edges = page?.edges ?? [];
  const labels = stepLabels(nodes, edges);
  const count = stepCount(page);
  const apply = (r: { nodes: DiagramNode[]; edges: typeof edges }) => actions.setDiagram(r.nodes, r.edges);

  if (!nodes.length) {
    return (
      <div className="lib-body">
        <p className="lib-empty">Add some boxes or start from a template, then come back here to choose the order you'll explain them in.</p>
      </div>
    );
  }
  return (
    <div className="lib-body">
      <p className="lib-hint">While recording, press <kbd className="kbd">→</kbd> to show the next step.</p>
      {ordering !== null ? (
        <div className="ordering">
          <MousePointerClick size={18} />
          <span>Click things in the order you'll explain them. Hold Shift to add to the same step.</span>
          <button className="btn primary" onClick={() => useDiagramUI.setState({ ordering: null })}>
            Done
          </button>
        </div>
      ) : (
        <div className="steps-actions">
          <button className="btn" onClick={() => apply(autoSteps(nodes, edges))} title="Follow the arrows from the start">
            <Sparkles size={15} /> Auto order
          </button>
          <button className="btn" onClick={startOrdering}>
            <MousePointerClick size={15} /> Click to order
          </button>
        </div>
      )}
      <ol className="steps-list">
        {labels.map((lines, i) => (
          <li key={i}>
            <span className="step-num">{i + 1}</span>
            <span className="step-text">{lines.join(' · ') || 'Nothing yet'}</span>
            <span className="step-btns">
              <button className="icon-btn small" disabled={i === 0} onClick={() => apply(swapSteps(nodes, edges, i + 1, i))} aria-label="Earlier">
                <ArrowUp size={14} />
              </button>
              <button className="icon-btn small" disabled={i === count - 1} onClick={() => apply(swapSteps(nodes, edges, i + 1, i + 2))} aria-label="Later">
                <ArrowDown size={14} />
              </button>
              <button className="icon-btn small" onClick={() => apply(removeStep(nodes, edges, i + 1))} aria-label="Remove step">
                <Trash size={13} />
              </button>
            </span>
          </li>
        ))}
        {!count && <p className="lib-empty">No steps yet: everything shows at once. Use Auto order to reveal it one part at a time.</p>}
      </ol>
      <label className="toggle-row">
        <input type="checkbox" checked={settings.spotlight ?? true} onChange={(e) => actions.updateSettings({ spotlight: e.target.checked })} />
        Dim everything except the current step
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={!!settings.followSteps} onChange={(e) => actions.updateSettings({ followSteps: e.target.checked })} />
        Zoom in on each step
      </label>
      {count > 0 && (
        <button className="btn primary wide" onClick={() => actions.startPresenting()}>
          <Play size={15} fill="currentColor" /> Preview the steps
        </button>
      )}
    </div>
  );
}

export function LibraryPanel() {
  const panel = useDiagramUI((s) => s.panel);
  useEffect(() => {
    if (panel) void loadIconSets();
  }, [panel]);
  if (!panel) return null;
  return (
    <aside className="library" aria-label="Library">
      <div className="lib-head">
        <div className="segmented">
          <button className={panel === 'add' ? 'on' : ''} onClick={() => useDiagramUI.setState({ panel: 'add' })}>
            <span className="seg-label">Add</span>
          </button>
          <button className={panel === 'steps' ? 'on' : ''} onClick={() => useDiagramUI.setState({ panel: 'steps' })}>
            <span className="seg-label">Steps</span>
          </button>
        </div>
        <button className="icon-btn small" onClick={() => useDiagramUI.setState({ panel: null, ordering: null })} aria-label="Close panel">
          <X size={16} />
        </button>
      </div>
      {panel === 'add' ? <AddTab /> : <StepsTab />}
    </aside>
  );
}

/** Kept here so the page strip can show whether a page has steps. */
export const pageHasSteps = () => stepCount(currentPage()) > 0;
