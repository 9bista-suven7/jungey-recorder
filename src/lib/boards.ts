import type { Aspect, BoardStyleId, Layout, Pattern, ProjectSettings } from '../types';

const CHALK = ['#f4f1e8', '#ffe27a', '#ff9fb6', '#8fd3ff', '#a6e8a0', '#ffb36b'];
const MARKER = ['#1f2328', '#1d64d8', '#d93a3a', '#1f9d55', '#7b4ddb', '#ef7a12'];
const NEON = ['#f5f7ff', '#ffe45e', '#ff5fa2', '#4dd9ff', '#7cff8a', '#ffa14d'];
/** Ink over a camera or a shared screen has to read on anything. */
const OVERLAY = ['#ffffff', '#ffd60a', '#ff375f', '#0a84ff', '#30d158', '#ff9f0a'];

export interface BoardStyle {
  id: BoardStyleId;
  label: string;
  bg: string;
  dark: boolean;
  /** Chalk grain on the ink and dust on the board. */
  chalk: boolean;
  line: string;
  palette: string[];
}

export const BOARD_STYLES: BoardStyle[] = [
  { id: 'blackboard', label: 'Blackboard', bg: '#23292b', dark: true, chalk: true, line: 'rgba(244,241,232,0.09)', palette: CHALK },
  { id: 'greenboard', label: 'Chalkboard', bg: '#2a4a3c', dark: true, chalk: true, line: 'rgba(244,241,232,0.10)', palette: CHALK },
  { id: 'midnight', label: 'Midnight', bg: '#14161f', dark: true, chalk: false, line: 'rgba(160,170,255,0.10)', palette: NEON },
  { id: 'whiteboard', label: 'Whiteboard', bg: '#fbfbf9', dark: false, chalk: false, line: 'rgba(30,40,60,0.09)', palette: MARKER },
  { id: 'paper', label: 'Paper', bg: '#f6f0e1', dark: false, chalk: false, line: 'rgba(90,70,40,0.13)', palette: MARKER },
];

export const getBoardStyle = (id: BoardStyleId) => BOARD_STYLES.find((b) => b.id === id) ?? BOARD_STYLES[0];

export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: 'none', label: 'Plain' },
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dots' },
  { id: 'lines', label: 'Lined' },
];

export const ASPECTS: { id: Aspect; label: string; hint: string }[] = [
  { id: '16:9', label: '16:9', hint: 'YouTube, courses' },
  { id: '9:16', label: '9:16', hint: 'Shorts, Reels, TikTok' },
  { id: '1:1', label: '1:1', hint: 'Square posts' },
  { id: '4:3', label: '4:3', hint: 'Classic slides' },
];

export const STAGE_SIZE: Record<Aspect, [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:3': [1440, 1080],
};

export const LAYOUTS: { id: Layout; label: string; short: string; hint: string }[] = [
  { id: 'board', label: 'Board only', short: 'Board', hint: 'Just the board, no camera' },
  { id: 'board-cam', label: 'Board + me', short: '+ Me', hint: 'Board with your face in a bubble' },
  { id: 'side', label: 'Side by side', short: 'Split', hint: 'Board and camera next to each other' },
  { id: 'cam', label: 'Just me', short: 'Me', hint: 'Full camera, you can still draw on top' },
  { id: 'screen-cam', label: 'Screen + me', short: 'Screen', hint: 'Share a window and draw over it' },
];

export const isOverlayLayout = (l: Layout) => l === 'cam' || l === 'screen-cam';

export function paletteFor(s: ProjectSettings): string[] {
  return isOverlayLayout(s.layout) ? OVERLAY : getBoardStyle(s.boardStyle).palette;
}

const SLOT = new Map<string, number>();
for (const pal of [CHALK, MARKER, NEON, OVERLAY]) pal.forEach((c, i) => SLOT.set(c, i));

/** White chalk becomes black marker on a whiteboard, and so on, so nothing disappears when you switch. */
export function adaptColor(color: string, palette: string[]) {
  const i = SLOT.get(color);
  return i === undefined ? color : palette[i];
}
