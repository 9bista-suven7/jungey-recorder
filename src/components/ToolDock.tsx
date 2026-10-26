import { Eraser, Hand, Highlighter, MousePointer2, Pencil, Redo2, Shapes, Trash, Type, Undo2 } from 'lucide-react';
import { useDiagramUI } from '../diagram/ui';
import type { ReactNode } from 'react';
import { actions, currentPage, SHAPES, useStore } from '../store';
import { paletteFor } from '../lib/boards';
import { LaserIcon, ShapeIcon } from './icons';
import { Popover } from './ui';
import type { Tool } from '../types';

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select & move boxes', key: 'V', icon: <MousePointer2 size={19} /> },
  { id: 'pen', label: 'Pen', key: 'P', icon: <Pencil size={19} /> },
  { id: 'highlighter', label: 'Highlighter', key: 'H', icon: <Highlighter size={19} /> },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: <Eraser size={19} /> },
];
const TOOLS_AFTER: typeof TOOLS = [
  { id: 'text', label: 'Text', key: 'T', icon: <Type size={19} /> },
  { id: 'laser', label: 'Laser pointer', key: 'L', icon: <LaserIcon /> },
  { id: 'hand', label: 'Move the board (or hold Space)', key: 'Space', icon: <Hand size={19} /> },
];
const SHAPE_NAMES = { line: 'Line', arrow: 'Arrow', rect: 'Box', ellipse: 'Circle' } as const;

function ToolButton({ id, label, k, icon }: { id: Tool; label: string; k: string; icon: ReactNode }) {
  const active = useStore((s) => s.tool === id);
  return (
    <button className={`tool ${active ? 'on' : ''}`} onClick={() => actions.setTool(id)} data-tip={`${label} (${k})`} data-tip-side="right" aria-pressed={active}>
      {icon}
    </button>
  );
}

function ShapeButton() {
  const active = useStore((s) => s.tool === 'shape');
  const shape = useStore((s) => s.shape);
  return (
    <Popover
      placement="right"
      button={({ toggle }) => (
        <button
          className={`tool ${active ? 'on' : ''} has-more`}
          onClick={() => {
            actions.setTool('shape');
            toggle();
          }}
          data-tip={`Shapes (S) · hold Shift for straight lines`}
          data-tip-side="right"
          aria-pressed={active}
        >
          <ShapeIcon shape={shape} />
        </button>
      )}
    >
      {(close) => (
        <div className="shape-menu">
          {SHAPES.map((sh) => (
            <button
              key={sh}
              className={`tool ${sh === shape ? 'on' : ''}`}
              onClick={() => {
                actions.setShape(sh);
                close();
              }}
              data-tip={SHAPE_NAMES[sh]}
            >
              <ShapeIcon shape={sh} />
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function ToolDock() {
  const settings = useStore((s) => s.project!.settings);
  const colorIndex = useStore((s) => s.colorIndex);
  const sizeIndex = useStore((s) => s.sizeIndex);
  const canUndo = useStore((s) => {
    const p = currentPage(s);
    return !!(p && s.history[p.id]?.undo.length);
  });
  const canRedo = useStore((s) => {
    const p = currentPage(s);
    return !!(p && s.history[p.id]?.redo.length);
  });
  const palette = paletteFor(settings);
  const panel = useDiagramUI((s) => s.panel);

  return (
    <aside className="dock" aria-label="Drawing tools">
      <button
        className={`tool add ${panel ? 'on' : ''}`}
        onClick={() => useDiagramUI.setState({ panel: panel ? null : 'add' })}
        data-tip="Add boxes, icons and templates (A)"
        data-tip-side="right"
      >
        <Shapes size={19} />
      </button>
      <div className="dock-sep" />
      <div className="dock-group">
        {TOOLS.map((t) => (
          <ToolButton key={t.id} id={t.id} label={t.label} k={t.key} icon={t.icon} />
        ))}
        <ShapeButton />
        {TOOLS_AFTER.map((t) => (
          <ToolButton key={t.id} id={t.id} label={t.label} k={t.key} icon={t.icon} />
        ))}
      </div>
      <div className="dock-sep" />
      <div className="colors">
        {palette.map((c, i) => (
          <button
            key={c}
            className={`color ${i === colorIndex ? 'on' : ''}`}
            style={{ '--c': c } as React.CSSProperties}
            onClick={() => actions.setColor(i)}
            data-tip={`Colour ${i + 1}`}
            data-tip-side="right"
            aria-label={`Colour ${i + 1}`}
          />
        ))}
      </div>
      <div className="dock-sep" />
      <div className="sizes">
        {[0, 1, 2].map((i) => (
          <button key={i} className={`size ${i === sizeIndex ? 'on' : ''}`} onClick={() => actions.setSize(i)} data-tip={['Thin', 'Medium', 'Thick'][i] + ' ([ ])'} data-tip-side="right">
            <span style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
          </button>
        ))}
      </div>
      <div className="dock-sep" />
      <div className="dock-row">
        <button className="tool small" onClick={actions.undo} disabled={!canUndo} data-tip="Undo (Ctrl+Z)" data-tip-side="right">
          <Undo2 size={17} />
        </button>
        <button className="tool small" onClick={actions.redo} disabled={!canRedo} data-tip="Redo (Ctrl+Y)" data-tip-side="right">
          <Redo2 size={17} />
        </button>
      </div>
      <button className="tool small danger" onClick={actions.clearPage} data-tip="Clear page" data-tip-side="right">
        <Trash size={17} />
      </button>
    </aside>
  );
}
