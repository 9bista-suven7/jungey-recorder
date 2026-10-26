import type { CamBubble, ProjectSettings, Tool } from './types';

export interface Preset {
  id: string;
  title: string;
  blurb: string;
  settings: Partial<ProjectSettings>;
  tool?: Tool;
  teleprompter?: boolean;
  /** Something to do right away so the user doesn't have to look for it. */
  action?: 'screen' | 'import' | 'flow';
}

export const DEFAULT_BUBBLE: CamBubble = { x: 0.87, y: 0.8, size: 0.3, shape: 'circle' };

export const DEFAULT_SETTINGS: ProjectSettings = {
  layout: 'board-cam',
  boardStyle: 'blackboard',
  pattern: 'none',
  aspect: '16:9',
  bubble: DEFAULT_BUBBLE,
};

export const PRESETS: Preset[] = [
  {
    id: 'blackboard',
    title: 'Blackboard lesson',
    blurb: 'Chalk on a board, your face in the corner',
    settings: { layout: 'board-cam', boardStyle: 'blackboard' },
    tool: 'pen',
  },
  {
    id: 'flow',
    title: 'Explain a flow',
    blurb: 'Diagrams, pipelines and architecture, revealed step by step',
    settings: { layout: 'board-cam', boardStyle: 'midnight', pattern: 'dots' },
    tool: 'select',
    action: 'flow',
  },
  {
    id: 'whiteboard',
    title: 'Whiteboard explainer',
    blurb: 'Clean marker drawings on white',
    settings: { layout: 'board-cam', boardStyle: 'whiteboard' },
    tool: 'pen',
  },
  {
    id: 'screen',
    title: 'Screen + me',
    blurb: 'Share a window or screen and draw on top',
    settings: { layout: 'screen-cam', boardStyle: 'blackboard' },
    tool: 'pen',
    action: 'screen',
  },
  {
    id: 'slides',
    title: 'Teach from slides',
    blurb: 'Open a PDF or images and mark them up',
    settings: { layout: 'board-cam', boardStyle: 'whiteboard' },
    tool: 'pen',
    action: 'import',
  },
  {
    id: 'talking',
    title: 'Talking head',
    blurb: 'Full camera with a scrolling script',
    settings: { layout: 'cam' },
    tool: 'laser',
    teleprompter: true,
  },
  {
    id: 'shorts',
    title: 'Shorts & Reels',
    blurb: 'Vertical 9:16, you on top and the board below',
    settings: { layout: 'side', aspect: '9:16', boardStyle: 'blackboard' },
    tool: 'pen',
  },
];
