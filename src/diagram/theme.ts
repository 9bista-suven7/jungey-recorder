// Diagram colours. Each colour is a slot (neutral, blue, green, ...) that looks right on the
// current background: brighter on dark boards, deeper on light ones.

export const NODE_COLORS_DARK = ['#c9ced8', '#6aa8ff', '#5fd38d', '#ffab5e', '#b392ff', '#ff7a85', '#4fd1c5', '#ffd95e'];
export const NODE_COLORS_LIGHT = ['#5b6472', '#2563eb', '#16a34a', '#ea7c1a', '#7c3aed', '#dc2626', '#0d9488', '#ca8a04'];
export const COLOR_NAMES = ['Grey', 'Blue', 'Green', 'Orange', 'Purple', 'Red', 'Teal', 'Yellow'];

/** Slot indexes, for templates and defaults. */
export const C = { grey: 0, blue: 1, green: 2, orange: 3, purple: 4, red: 5, teal: 6, yellow: 7 } as const;

const SLOT = new Map<string, number>();
NODE_COLORS_DARK.forEach((c, i) => SLOT.set(c, i));
NODE_COLORS_LIGHT.forEach((c, i) => SLOT.set(c, i));

export interface DiagramTheme {
  dark: boolean;
  colors: string[];
  text: string;
  muted: string;
  nodeBase: string;
  card: string;
  cardEdge: string;
  labelBg: string;
}

export function diagramTheme(dark: boolean): DiagramTheme {
  return dark
    ? {
        dark, colors: NODE_COLORS_DARK, text: '#eef0f4', muted: '#a3a9b6', nodeBase: 'rgba(14,16,22,0.72)',
        card: '#ffffff', cardEdge: 'rgba(255,255,255,0.0)', labelBg: '#1b1f28',
      }
    : {
        dark, colors: NODE_COLORS_LIGHT, text: '#1d2230', muted: '#5b6472', nodeBase: '#ffffff',
        card: '#ffffff', cardEdge: 'rgba(20,30,50,0.12)', labelBg: '#ffffff',
      };
}

/** Stored colours are slot colours from either palette; show the current theme's version. */
export function themed(color: string, theme: DiagramTheme) {
  const i = SLOT.get(color);
  return i === undefined ? color : theme.colors[i];
}

export const slotColor = (slot: number) => NODE_COLORS_LIGHT[slot];
