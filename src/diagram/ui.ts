// Short-lived diagram UI state: selection, previews while dragging, the side panel.
// None of this is saved or recorded; edits are committed to the page when a gesture ends.
import { create } from 'zustand';
import type { DiagramNode } from '../types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramUI {
  selected: string[];
  hover: string | null;
  /** Nodes being moved, and by how much. */
  drag: { dx: number; dy: number; ids: string[] } | null;
  resize: { id: string; rect: Rect } | null;
  /** Arrow being pulled out of a node. */
  connect: { from: string; x: number; y: number; to: string | null } | null;
  marquee: Rect | null;
  /** Node or arrow whose text is being typed. */
  editing: string | null;
  /** "Click things in the order you'll explain them" mode; holds the last step given out. */
  ordering: number | null;
  panel: 'add' | 'steps' | null;
  templatesOpen: boolean;
}

export const useDiagramUI = create<DiagramUI>()(() => ({
  selected: [],
  hover: null,
  drag: null,
  resize: null,
  connect: null,
  marquee: null,
  editing: null,
  ordering: null,
  panel: null,
  templatesOpen: false,
}));

/** Nodes as they look right now, including an unfinished move or resize. */
export function liveNodes(nodes: DiagramNode[], ui: Pick<DiagramUI, 'drag' | 'resize'> = useDiagramUI.getState()): DiagramNode[] {
  const { drag, resize } = ui;
  if (!drag && !resize) return nodes;
  const moving = drag ? new Set(drag.ids) : null;
  return nodes.map((n) => {
    if (resize?.id === n.id) return { ...n, ...resize.rect };
    if (moving?.has(n.id)) return { ...n, x: n.x + drag!.dx, y: n.y + drag!.dy };
    return n;
  });
}

export const clearSelection = () => useDiagramUI.setState({ selected: [], editing: null });
