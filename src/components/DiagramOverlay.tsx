// Everything you see on top of a diagram while editing: selection, "+" handles, the floating
// toolbar, the text editor, step badges and the presenter pill. None of it is recorded.
import { useEffect, useRef, useState } from 'react';
import { ChartColumn, ChevronLeft, ChevronRight, Ellipsis, Sparkles, Trash } from 'lucide-react';
import { actions, useStore } from '../store';
import { compositor } from '../engine/compositor';
import { liveNodes, useDiagramUI } from '../diagram/ui';
import { edgePath, nodeBounds, pickSides, sideMid } from '../diagram/geometry';
import { CORNERS, SIDES, canConnect, cornerPoint, deleteSelection, handlePoint } from '../diagram/interact';
import { addFx, presentedSteps, stepCount } from '../diagram/steps';
import { COLOR_NAMES, NODE_COLORS_LIGHT, diagramTheme, themed } from '../diagram/theme';
import { ENTER_LABEL, FX_LABEL, LOOPABLE } from '../diagram/anim';
import { getBoardStyle, isOverlayLayout } from '../lib/boards';
import { Popover } from './ui';
import type { DiagramEdge, DiagramNode, EdgeRoute, EnterKind, FxKind } from '../types';

const NODE_ENTER: EnterKind[] = ['pop', 'fade', 'grow', 'drop', 'slide', 'zoom'];
const NODE_FX: FxKind[] = ['jump', 'shake', 'pulse', 'spin', 'wiggle', 'glow', 'collapse', 'regrow', 'fadeout', 'run', 'runback'];
const EDGE_ENTER: EnterKind[] = ['draw', 'fade'];
const CHART_ENTER: EnterKind[] = ['reveal', 'pop', 'fade', 'slide', 'zoom'];
const EDGE_FX: FxKind[] = ['flow', 'glow', 'pulse', 'collapse', 'regrow', 'fadeout'];

/** Page units → CSS pixels on the stage. */
function useMapper(k: number) {
  const t = compositor.xform;
  return {
    x: (x: number) => (x * t.scale + t.ox) * k,
    y: (y: number) => (y * t.scale + t.oy) * k,
    s: (v: number) => v * t.scale * k,
  };
}

function AnimateMenu({ nodes, edges, onDone }: { nodes: DiagramNode[]; edges: DiagramEdge[]; onDone: () => void }) {
  const page = useStore((s) => s.project?.pages[s.pageIndex]);
  const [together, setTogether] = useState(false);
  /** Seconds of rest between runs of a repeating effect; null = play once. */
  const [every, setEvery] = useState<number | null>(null);
  const isEdge = !nodes.length;
  const count = stepCount(page);
  const step = together && count ? count : count + 1;
  const ids = [...nodes, ...edges].map((x) => x.id);

  const apply = (kind: EnterKind | FxKind, enter: boolean) => {
    const all = page?.nodes ?? [], allE = page?.edges ?? [];
    const sel = new Set(ids);
    let n2: DiagramNode[], e2: DiagramEdge[];
    if (enter) {
      n2 = all.map((n) => (sel.has(n.id) ? { ...n, enter: kind as EnterKind, step: n.step ?? step } : n));
      e2 = allE.map((e) => (sel.has(e.id) ? { ...e, enter: kind as EnterKind, step: e.step ?? step } : e));
    } else {
      n2 = addFx(all, sel, kind as FxKind, step, every ?? undefined);
      e2 = addFx(allE, sel, kind as FxKind, step, every ?? undefined);
    }
    actions.setDiagram(n2, e2);
    compositor.preview = { ids, kind, start: performance.now() };
    // An entrance plays when the element appears, which may be an earlier step than the next one.
    const at = enter ? Math.min(...[...n2, ...e2].filter((x) => sel.has(x.id)).map((x) => x.step ?? step)) : step;
    const what = enter ? ENTER_LABEL[kind as EnterKind] : FX_LABEL[kind as FxKind];
    const again = !enter && every !== null && LOOPABLE.has(kind as FxKind) ? `, then again every ${every} s` : '';
    actions.toast(`${what} plays at step ${at}${again}. While recording, press → to reach it.`);
    onDone();
  };

  const enterList = isEdge ? EDGE_ENTER : nodes.every((n) => n.shape === 'chart') ? CHART_ENTER : NODE_ENTER;
  const fxList = isEdge ? EDGE_FX : NODE_FX;
  return (
    <div className="anim-menu" onPointerDown={(e) => e.stopPropagation()}>
      <div className="menu-label">When it appears</div>
      <div className="anim-grid">
        {enterList.map((k) => (
          <button key={k} className="pill" onClick={() => apply(k, true)} onMouseEnter={() => (compositor.preview = { ids, kind: k, start: performance.now() })}>
            {ENTER_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="menu-label">Then, as step {step}</div>
      <div className="anim-grid">
        {fxList.map((k) => (
          <button
            key={k}
            className="pill"
            disabled={every !== null && !LOOPABLE.has(k)}
            title={every !== null && !LOOPABLE.has(k) ? 'This one plays once' : undefined}
            onClick={() => apply(k, false)}
            onMouseEnter={() => (compositor.preview = { ids, kind: k, start: performance.now() })}
          >
            {FX_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="toggle-row small anim-repeat">
        <label>
          <input type="checkbox" checked={every !== null} onChange={(e) => setEvery(e.target.checked ? 2 : null)} />
          Keep repeating
        </label>
        {every !== null && (
          <>
            <span>with</span>
            <select className="text-field tiny" value={every} onChange={(e) => setEvery(Number(e.target.value))} aria-label="Rest between runs">
              {[1, 2, 3, 5, 10].map((s) => (
                <option key={s} value={s}>
                  {s} s
                </option>
              ))}
            </select>
            <span>of rest between runs</span>
          </>
        )}
      </div>
      {count > 0 && (
        <label className="toggle-row small">
          <input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} />
          Play together with step {count}
        </label>
      )}
    </div>
  );
}

function EdgeOptions({ edges }: { edges: DiagramEdge[] }) {
  const e = edges[0];
  const set = (patch: Partial<DiagramEdge>) => actions.updateEdges(Object.fromEntries(edges.map((x) => [x.id, patch])));
  const routes: [EdgeRoute, string][] = [['elbow', 'Elbow'], ['straight', 'Straight'], ['curve', 'Curved']];
  return (
    <div className="menu-section" onPointerDown={(ev) => ev.stopPropagation()}>
      <div className="pill-row">
        {routes.map(([r, label]) => (
          <button key={r} className={`pill ${e.route === r ? 'on' : ''}`} onClick={() => set({ route: r })}>{label}</button>
        ))}
      </div>
      <div className="pill-row">
        <button className={`pill ${e.arrows === 'end' ? 'on' : ''}`} onClick={() => set({ arrows: 'end' })}>One way</button>
        <button className={`pill ${e.arrows === 'both' ? 'on' : ''}`} onClick={() => set({ arrows: 'both' })}>Both ways</button>
        <button className={`pill ${e.arrows === 'none' ? 'on' : ''}`} onClick={() => set({ arrows: 'none' })}>No arrow</button>
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={e.dashed} onChange={(ev) => set({ dashed: ev.target.checked })} /> Dashed line
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={e.flow} onChange={(ev) => set({ flow: ev.target.checked })} /> Always show data flowing
      </label>
      <label className="slider-row">
        Data
        <input
          className="text-field"
          defaultValue={e.packet ?? ''}
          placeholder="e.g. JSON, token"
          onKeyDown={(ev) => ev.stopPropagation()}
          onBlur={(ev) => set({ packet: ev.target.value.trim() || undefined })}
        />
      </label>
    </div>
  );
}

function Toolbar({ nodes, edges, left, top }: { nodes: DiagramNode[]; edges: DiagramEdge[]; left: number; top: number }) {
  const setColor = (c: string) => {
    if (nodes.length) actions.updateNodes(Object.fromEntries(nodes.map((n) => [n.id, { color: c }])));
    if (edges.length) actions.updateEdges(Object.fromEntries(edges.map((e) => [e.id, { color: c }])));
  };
  const style = useStore((s) => s.project!.settings);
  const th = diagramTheme(isOverlayLayout(style.layout) || getBoardStyle(style.boardStyle).dark);
  const current = (nodes[0] ?? edges[0])?.color;
  return (
    <div className="d-toolbar" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="d-colors">
        {NODE_COLORS_LIGHT.map((c, i) => (
          <button
            key={c}
            className={`d-color ${themed(current, th) === themed(c, th) ? 'on' : ''}`}
            style={{ background: themed(c, th) }}
            onClick={() => setColor(c)}
            aria-label={COLOR_NAMES[i]}
            title={COLOR_NAMES[i]}
          />
        ))}
      </div>
      <span className="d-sep" />
      {nodes.length === 1 && !edges.length && nodes[0].shape === 'chart' && (
        <button className="btn chip" onClick={() => useDiagramUI.setState({ chartEditing: nodes[0].id })} title="Edit the numbers (or double-click the chart)">
          <ChartColumn size={15} /> Edit data
        </button>
      )}
      <Popover
        placement="bottom-start"
        className="anim-pop"
        button={({ toggle, open }) => (
          <button className={`btn chip ${open ? 'active' : ''}`} onClick={toggle} title="Animate (adds a step)">
            <Sparkles size={15} /> Animate
          </button>
        )}
      >
        {(close) => <AnimateMenu nodes={nodes} edges={edges} onDone={close} />}
      </Popover>
      {edges.length > 0 && !nodes.length && (
        <Popover
          placement="bottom-start"
          button={({ toggle }) => (
            <button className="icon-btn small" onClick={toggle} title="Arrow options">
              <Ellipsis size={16} />
            </button>
          )}
        >
          <EdgeOptions edges={edges} />
        </Popover>
      )}
      <button className="icon-btn small" onClick={deleteSelection} title="Delete (Del)">
        <Trash size={15} />
      </button>
    </div>
  );
}

function TextEditor({ k }: { k: number }) {
  const editing = useDiagramUI((s) => s.editing);
  const page = useStore((s) => s.project?.pages[s.pageIndex]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const node = page?.nodes?.find((n) => n.id === editing);
  const edge = !node ? page?.edges?.find((e) => e.id === editing) : undefined;
  const [value, setValue] = useState('');
  useEffect(() => {
    setValue(node?.text ?? edge?.text ?? '');
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    // Only when a different element starts editing.
  }, [editing]);
  const m = useMapper(k);
  if (!editing || (!node && !edge)) return null;

  const commit = () => {
    const text = value.trim();
    if (node && text !== node.text) actions.updateNodes({ [node.id]: { text } });
    if (edge && text !== edge.text) actions.updateEdges({ [edge.id]: { text } });
    useDiagramUI.setState({ editing: null });
  };

  let style: React.CSSProperties;
  if (node) {
    const below = node.shape === 'icon' || node.shape === 'dot';
    const font = node.shape === 'frame' ? 26 : node.shape === 'text' ? 32 : below ? 25 : 27;
    if (node.shape === 'frame') style = { left: m.x(node.x + 22), top: m.y(node.y + 14), textAlign: 'left' };
    else if (below) style = { left: m.x(node.x + node.w / 2), top: m.y(node.y + node.h + 12), transform: 'translateX(-50%)' };
    else style = { left: m.x(node.x + node.w / 2), top: m.y(node.y + node.h / 2), transform: 'translate(-50%, -50%)', maxWidth: m.s(node.w - 16) };
    style.fontSize = m.s(font);
  } else {
    const nodes = page?.nodes ?? [];
    const a = nodes.find((n) => n.id === edge!.from)!, b = nodes.find((n) => n.id === edge!.to)!;
    const path = edgePath(edge!, a, b);
    let d = path.total / 2, i = 1;
    while (i < path.lens.length - 1 && path.lens[i] < d) i++;
    const p0 = path.pts[i - 1], p1 = path.pts[i], u = (d - path.lens[i - 1]) / (path.lens[i] - path.lens[i - 1] || 1);
    style = { left: m.x(p0.x + (p1.x - p0.x) * u), top: m.y(p0.y + (p1.y - p0.y) * u), transform: 'translate(-50%, -50%)', fontSize: m.s(20) };
  }
  return (
    <textarea
      ref={ref}
      className="d-editor"
      style={style}
      value={value}
      rows={1}
      placeholder={node ? 'Type a name' : 'Label'}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

function PresentPill() {
  const presenting = useStore((s) => s.presenting);
  const step = useStore((s) => s.stepAt);
  const rec = useStore((s) => s.rec);
  const page = useStore((s) => s.project?.pages[s.pageIndex]);
  const auto = useStore((s) => s.project?.settings.reveal ?? true);
  if (!presenting) return null;
  const total = presentedSteps(page, auto);
  return (
    <div className="d-present" onPointerDown={(e) => e.stopPropagation()}>
      <button className="icon-btn small" onClick={actions.prevStep} aria-label="Previous step (←)">
        <ChevronLeft size={18} />
      </button>
      <span>{total ? (step === 0 ? `Press → to start · ${total} steps` : `Step ${step} of ${total}`) : 'No steps on this page'}</span>
      <button className="icon-btn small" onClick={actions.nextStep} aria-label="Next step (→)">
        <ChevronRight size={18} />
      </button>
      {rec === 'idle' && (
        <button className="link-btn" onClick={actions.stopPresenting}>
          Done
        </button>
      )}
    </div>
  );
}

export function DiagramOverlay({ k }: { k: number }) {
  const page = useStore((s) => s.project?.pages[s.pageIndex]);
  useStore((s) => s.project?.settings);
  const presenting = useStore((s) => s.presenting);
  const tool = useStore((s) => s.tool);
  const ui = useDiagramUI();
  const m = useMapper(k);
  if (!k) return null;
  if (presenting) return <PresentPill />;

  const nodes = liveNodes(page?.nodes ?? [], ui);
  const edges = page?.edges ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const selNodes = nodes.filter((n) => ui.selected.includes(n.id));
  const selEdges = edges.filter((e) => ui.selected.includes(e.id));
  const single = selNodes.length === 1 && !selEdges.length ? selNodes[0] : null;
  const showSteps = ui.ordering !== null || ui.panel === 'steps';
  const handlesFor = [...new Set([ui.hover, single?.id])].map((id) => id && byId.get(id)).filter((n): n is DiagramNode => !!n && canConnect(n));
  const editingTools = tool === 'select' && ui.ordering === null;

  // Toolbar sits above the selection.
  let bar: { left: number; top: number } | null = null;
  if ((selNodes.length || selEdges.length) && editingTools && !ui.drag && !ui.resize && !ui.editing) {
    const pts = [
      ...selNodes.flatMap((n) => {
        const b = nodeBounds(n);
        return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }];
      }),
      ...selEdges.flatMap((e) => {
        const a = byId.get(e.from), b = byId.get(e.to);
        return a && b ? edgePath(e, a, b).pts : [];
      }),
    ];
    if (pts.length) {
      const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y));
      bar = { left: m.x((x0 + x1) / 2), top: Math.max(8, m.y(y0) - 58) };
    }
  }

  return (
    <div className="d-overlay">
      <svg className="d-svg">
        {selEdges.map((e) => {
          const a = byId.get(e.from), b = byId.get(e.to);
          if (!a || !b) return null;
          const pts = edgePath(e, a, b).pts.map((p) => `${m.x(p.x)},${m.y(p.y)}`).join(' ');
          return <polyline key={e.id} points={pts} className="d-sel-edge" />;
        })}
        {selNodes.map((n) => {
          const b = nodeBounds(n);
          return <rect key={n.id} x={m.x(b.x) - 5} y={m.y(b.y) - 5} width={m.s(b.w) + 10} height={m.s(b.h) + 10} rx={8} className="d-sel" />;
        })}
        {single && single.shape !== 'dot' && editingTools &&
          CORNERS.map((c) => {
            const p = cornerPoint(single, c);
            return <rect key={c} x={m.x(p.x) - 5} y={m.y(p.y) - 5} width={10} height={10} rx={2} className="d-corner" />;
          })}
        {editingTools && !ui.drag && !ui.connect &&
          handlesFor.flatMap((n) =>
            SIDES.map((sd) => {
              const p = handlePoint(n, sd);
              return (
                <g key={`${n.id}-${sd}`} className="d-plus" transform={`translate(${m.x(p.x)} ${m.y(p.y)})`}>
                  <circle r={9} />
                  <path d="M-4 0h8M0 -4v8" />
                </g>
              );
            }),
          )}
        {ui.connect && byId.get(ui.connect.from) && (() => {
          const from = byId.get(ui.connect.from)!;
          const to = ui.connect.to ? byId.get(ui.connect.to) : undefined;
          const target = to ?? { ...from, x: ui.connect.x - 1, y: ui.connect.y - 1, w: 2, h: 2 };
          const [sa] = pickSides(from, target);
          const s = sideMid(from, sa);
          return (
            <>
              {to && <rect x={m.x(to.x) - 6} y={m.y(to.y) - 6} width={m.s(to.w) + 12} height={m.s(to.h) + 12} rx={10} className="d-target" />}
              <line x1={m.x(s.x)} y1={m.y(s.y)} x2={m.x(ui.connect.x)} y2={m.y(ui.connect.y)} className="d-connect" />
            </>
          );
        })()}
        {ui.marquee && <rect x={m.x(ui.marquee.x)} y={m.y(ui.marquee.y)} width={m.s(ui.marquee.w)} height={m.s(ui.marquee.h)} className="d-marquee" />}
      </svg>
      {showSteps &&
        nodes
          .filter((n) => n.step || n.fx?.length)
          .map((n) => (
            <span key={n.id} className="d-badge" style={{ left: m.x(n.x) - 10, top: m.y(n.y) - 10 }}>
              {[n.step, ...(n.fx ?? []).map((f) => f.step)].filter(Boolean).join(',')}
            </span>
          ))}
      {bar && <Toolbar nodes={selNodes} edges={selEdges} left={bar.left} top={bar.top} />}
      <TextEditor k={k} />
    </div>
  );
}
