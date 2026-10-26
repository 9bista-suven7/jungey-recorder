// Drawing on top of a shared whole screen: the tool, colour and marks on the ink layer.
// Nothing here is saved; the marks live only in the recording.
import { create } from 'zustand';
import { bridge } from '../platform';
import type { ShapeItem, StrokeItem } from '../types';

/** 'mouse' = clicks go through to your apps. */
export type DeskTool = 'mouse' | 'pen' | 'highlighter' | 'arrow' | 'rect' | 'ellipse' | 'stamp' | 'laser';

/** An emoji, or a numbered badge (1, 2, 3...) for "click here, then here" tutorials. */
export interface Stamp {
  id: string;
  kind: 'stamp';
  x: number;
  y: number;
  size: number;
  text: string;
  /** Badges are filled circles in this colour. */
  badge: string | null;
  born: number;
}

export type DeskMark = StrokeItem | ShapeItem | Stamp;

export const DESK_COLORS = ['#ff3b30', '#ffcc00', '#22c55e', '#2f7bff', '#111111', '#ffffff'];
export const COLOR_NAMES = ['Red', 'Yellow', 'Green', 'Blue', 'Black', 'White'];
/** The first stamp is the numbered badge. */
export const BADGE = '#';
export const STAMPS = [BADGE, '👉', '👆', '👇', '✅', '❌', '⭐', '🔥', '💡', '❓', '❗', '⚠️', '👍', '👎', '😀', '😂', '🤔', '😮', '🎉', '❤️', '🚀', '👀', '💯'];

interface DeskState {
  /** The ink layer is up over the shared screen. */
  on: boolean;
  tool: DeskTool;
  /** Tool to go back to after using your apps. */
  lastTool: Exclude<DeskTool, 'mouse'>;
  color: string;
  stamp: string;
  marks: DeskMark[];
  nextBadge: number;
  /** When "clear" started, for a quick fade. */
  clearing: number;
  /** The face bubble is a real window on the screen (so the recording already has it). */
  camOnScreen: boolean;
}

export const useDesk = create<DeskState>()(() => ({
  on: false,
  tool: 'mouse',
  lastTool: 'pen',
  color: DESK_COLORS[0],
  stamp: '👉',
  marks: [],
  nextBadge: 1,
  clearing: 0,
  camOnScreen: false,
}));

export const deskActions = {
  setTool(tool: DeskTool) {
    const was = useDesk.getState().tool;
    useDesk.setState(tool === 'mouse' ? { tool } : { tool, lastTool: tool });
    if ((was === 'mouse') !== (tool === 'mouse')) bridge.desk?.draw(tool !== 'mouse');
  },
  /** Alt+Shift+D: switch between drawing and using your apps. */
  toggleDraw() {
    const s = useDesk.getState();
    deskActions.setTool(s.tool === 'mouse' ? s.lastTool : 'mouse');
  },
  pickStamp(stamp: string) {
    useDesk.setState({ stamp });
    deskActions.setTool('stamp');
  },
  pickColor(color: string) {
    const { tool, lastTool } = useDesk.getState();
    useDesk.setState({ color });
    // Picking a colour means you want to draw with it (stamps keep going: badges use it).
    if (tool === 'laser') deskActions.setTool('pen');
    else if (tool === 'mouse') deskActions.setTool(lastTool === 'laser' ? 'pen' : lastTool);
  },
  add(mark: DeskMark) {
    useDesk.setState((s) => ({
      marks: [...s.marks, mark],
      nextBadge: mark.kind === 'stamp' && mark.badge ? s.nextBadge + 1 : s.nextBadge,
    }));
  },
  undo() {
    useDesk.setState((s) => {
      const last = s.marks[s.marks.length - 1];
      if (!last) return s;
      return { marks: s.marks.slice(0, -1), nextBadge: last.kind === 'stamp' && last.badge ? s.nextBadge - 1 : s.nextBadge };
    });
  },
  clear() {
    if (!useDesk.getState().marks.length) return;
    useDesk.setState({ clearing: performance.now() });
    setTimeout(() => useDesk.setState({ marks: [], nextBadge: 1, clearing: 0 }), 260);
  },
};
