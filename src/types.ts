export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'shape' | 'text' | 'laser' | 'hand';
export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse';
/** How the frame is composed: what is behind the ink, and where the camera goes. */
export type Layout = 'board' | 'board-cam' | 'side' | 'cam' | 'screen-cam';
export type BoardStyleId = 'blackboard' | 'greenboard' | 'midnight' | 'whiteboard' | 'paper';
export type Pattern = 'none' | 'grid' | 'dots' | 'lines';
export type Aspect = '16:9' | '9:16' | '1:1' | '4:3';
export type CamShape = 'circle' | 'rounded';

/** Points are flat [x, y, pressure, x, y, pressure, ...] in page (world) units. */
export interface StrokeItem {
  id: string;
  kind: 'stroke';
  pen: 'pen' | 'highlighter';
  color: string;
  size: number;
  points: number[];
  /** True when the points carry real stylus pressure. */
  pressure: boolean;
}

export interface ShapeItem {
  id: string;
  kind: 'shape';
  shape: ShapeKind;
  color: string;
  size: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextItem {
  id: string;
  kind: 'text';
  color: string;
  size: number;
  x: number;
  y: number;
  text: string;
}

export type Item = StrokeItem | ShapeItem | TextItem;

export interface PageImage {
  src: string;
  w: number;
  h: number;
}

/** Pan (in page units) and zoom of one page. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

/** How something appears at its step. */
export type EnterKind = 'pop' | 'fade' | 'grow' | 'drop' | 'slide' | 'zoom' | 'draw' | 'reveal';
/** Something that happens to an element at a later step. */
export type FxKind =
  | 'jump' | 'shake' | 'pulse' | 'spin' | 'wiggle' | 'glow'
  | 'collapse' | 'regrow' | 'fadeout' | 'run' | 'runback' | 'flow';
export interface Fx {
  step: number;
  kind: FxKind;
}

export type NodeShape =
  | 'rect'
  | 'rounded'
  | 'pill'
  | 'ellipse'
  | 'diamond'
  | 'cylinder'
  | 'hexagon'
  | 'parallelogram'
  | 'document'
  | 'cloud'
  | 'note'
  | 'frame'
  | 'text'
  | 'icon'
  | 'dot'
  | 'chart';

export type ChartKind = 'line' | 'area' | 'bar' | 'pie' | 'donut' | 'candle';

export interface ChartSeries {
  name: string;
  values: number[];
}

/** A chart's data lives inside the chart (no database): labels along the bottom, one or more series. */
export interface ChartSpec {
  kind: ChartKind;
  title: string;
  labels: string[];
  /** Line, area and bar charts can have several; pie and donut use the first. */
  series: ChartSeries[];
  /** Candlestick charts: open, high, low, close per label. */
  candles?: { o: number; h: number; l: number; c: number }[];
  /** Shown with the numbers: '$', '₹', '%', ' bn', ... */
  unit?: string;
  /** Where the numbers came from, shown small under the chart. */
  source?: string;
}

/** A box, icon or section on a flow diagram. x/y is the top-left corner, in page units. */
export interface DiagramNode {
  id: string;
  shape: NodeShape;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  /** 'dev:maven', 'si:stripe' or 'lu:server' (only used by icon nodes). */
  icon?: string;
  /** Only used by chart nodes. */
  chart?: ChartSpec;
  /** Revealed at this step while presenting; always visible when unset. */
  step?: number;
  enter?: EnterKind;
  fx?: Fx[];
}

export type EdgeRoute = 'straight' | 'elbow' | 'curve';

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  text: string;
  color: string;
  route: EdgeRoute;
  dashed: boolean;
  arrows: 'end' | 'both' | 'none';
  /** Dots always travel along this arrow. */
  flow: boolean;
  /** Label carried by the travelling dot, e.g. "JWT" or "order JSON". */
  packet?: string;
  step?: number;
  enter?: EnterKind;
  fx?: Fx[];
}

export interface Page {
  id: string;
  items: Item[];
  bg?: PageImage;
  view: View;
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
}

/** Camera bubble: centre as a fraction of the frame, size as a fraction of the short side. */
export interface CamBubble {
  x: number;
  y: number;
  size: number;
  shape: CamShape;
}

export interface ProjectSettings {
  layout: Layout;
  boardStyle: BoardStyleId;
  pattern: Pattern;
  aspect: Aspect;
  bubble: CamBubble;
  /** Steps: dim everything except the current step. */
  spotlight?: boolean;
  /** Steps: smoothly zoom to each step. */
  followSteps?: boolean;
  /** Diagrams reveal step by step while recording (on unless turned off). */
  reveal?: boolean;
}

export interface Project {
  id: string;
  title: string;
  presetId: string;
  createdAt: number;
  updatedAt: number;
  pages: Page[];
  settings: ProjectSettings;
}

/** A finished video in the library (the file itself lives on disk). */
export interface VideoMeta {
  id: string;
  title: string;
  file: string;
  createdAt: number;
  durationMs: number;
  width: number;
  height: number;
  thumb: string;
  projectId?: string;
}
