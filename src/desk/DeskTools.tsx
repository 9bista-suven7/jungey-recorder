// Drawing tools in the floating controls while you present your whole screen.
import type { ReactNode } from 'react';
import { Circle, Highlighter, MousePointer2, MoveUpRight, Pencil, Smile, Square, Trash2, Undo2 } from 'lucide-react';
import { LaserIcon } from '../components/icons';
import { BADGE, COLOR_NAMES, DESK_COLORS, STAMPS, deskActions, useDesk, type DeskTool } from './state';

const TOOLS: { id: DeskTool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'mouse', label: 'Use your apps', key: 'Esc', icon: <MousePointer2 size={18} /> },
  { id: 'pen', label: 'Pen', key: 'P', icon: <Pencil size={18} /> },
  { id: 'highlighter', label: 'Highlighter', key: 'H', icon: <Highlighter size={18} /> },
  { id: 'arrow', label: 'Arrow', key: 'A', icon: <MoveUpRight size={19} /> },
  { id: 'rect', label: 'Box', key: 'B', icon: <Square size={17} /> },
  { id: 'ellipse', label: 'Circle', key: 'O', icon: <Circle size={18} /> },
  { id: 'stamp', label: 'Emojis and step numbers', key: 'E', icon: <Smile size={18} /> },
  { id: 'laser', label: 'Laser pointer', key: 'L', icon: <LaserIcon /> },
];

const KEYS: Record<string, DeskTool> = { p: 'pen', h: 'highlighter', a: 'arrow', b: 'rect', o: 'ellipse', e: 'stamp', l: 'laser' };

/** Shortcuts while the controls have the keyboard. */
export function deskKey(e: KeyboardEvent) {
  if (e.altKey) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') deskActions.undo();
  else if (e.ctrlKey || e.metaKey) return;
  else if (e.key === 'Escape') deskActions.setTool('mouse');
  else if (e.key === 'Delete' || e.key === 'Backspace') deskActions.clear();
  else if (KEYS[k]) deskActions.setTool(KEYS[k]);
  else if (/^[1-6]$/.test(k)) deskActions.pickColor(DESK_COLORS[Number(k) - 1]);
  else return;
  e.preventDefault();
}

export function DeskTools() {
  const tool = useDesk((s) => s.tool);
  const color = useDesk((s) => s.color);
  const count = useDesk((s) => s.marks.length);
  return (
    <>
      <span className="mini-sep" />
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`mini-tool ${tool === t.id ? 'on' : ''}`}
          onClick={() => deskActions.setTool(t.id)}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={tool === t.id}
        >
          {t.icon}
        </button>
      ))}
      <span className="mini-sep" />
      {DESK_COLORS.map((c, i) => (
        <button
          key={c}
          className={`mini-swatch ${color === c ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => deskActions.pickColor(c)}
          title={`${COLOR_NAMES[i]} (${i + 1})`}
          aria-label={COLOR_NAMES[i]}
          aria-pressed={color === c}
        />
      ))}
      <span className="mini-sep" />
      <button className="mini-tool" disabled={!count} onClick={deskActions.undo} title="Undo (Ctrl+Z)" aria-label="Undo">
        <Undo2 size={18} />
      </button>
      <button className="mini-tool" disabled={!count} onClick={deskActions.clear} title="Clear everything (Delete)" aria-label="Clear everything">
        <Trash2 size={18} />
      </button>
    </>
  );
}

export function StampRow() {
  const stamp = useDesk((s) => s.stamp);
  const color = useDesk((s) => s.color);
  const next = useDesk((s) => s.nextBadge);
  return (
    <div className="mini-stamps">
      {STAMPS.map((e) => (
        <button
          key={e}
          className={`mini-stamp ${stamp === e ? 'on' : ''}`}
          onClick={() => deskActions.pickStamp(e)}
          title={e === BADGE ? 'Step numbers: 1, 2, 3…' : 'Click to place, drag to make it bigger'}
          aria-pressed={stamp === e}
        >
          {e === BADGE ? (
            <span className="mini-badge" style={{ background: color, color: color === '#ffffff' || color === '#ffcc00' ? '#111' : '#fff' }}>
              {next}
            </span>
          ) : (
            e
          )}
        </button>
      ))}
    </div>
  );
}
