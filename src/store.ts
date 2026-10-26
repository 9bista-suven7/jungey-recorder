import { create } from 'zustand';
import type { DiagramEdge, DiagramNode, Item, Page, PageImage, Project, ProjectSettings, ShapeKind, Tool, VideoMeta, View, CamBubble } from './types';
import { presentedSteps } from './diagram/steps';
import { DEFAULT_SETTINGS, type Preset } from './presets';
import { paletteFor } from './lib/boards';
import { clamp, shortDate, uid } from './lib/util';

export type DevState = 'off' | 'pending' | 'on' | 'denied' | 'error';
export type RecState = 'idle' | 'countdown' | 'recording' | 'paused' | 'saving';

/** Small / medium / large, in frame pixels (converted to page units when drawing). */
export const SIZES = {
  pen: [4, 8, 16],
  highlighter: [22, 38, 60],
  shape: [4, 7, 12],
  text: [44, 68, 104],
  eraser: [24, 48, 96],
} as const;

export const SHAPES: ShapeKind[] = ['line', 'arrow', 'rect', 'ellipse'];

export interface TextDraft {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  /** Set when editing an existing text item. */
  replaceId?: string;
}

interface Prefs {
  tool: Tool;
  shape: ShapeKind;
  colorIndex: number;
  sizeIndex: number;
  mirror: boolean;
  countdown: boolean;
  autoScroll: boolean;
  camId: string;
  micId: string;
}

/** What undo restores: the ink and the diagram of one page. */
type Snapshot = { items: Item[]; nodes: DiagramNode[]; edges: DiagramEdge[] };

export interface State extends Prefs {
  screenView: 'home' | 'studio';
  project: Project | null;
  pageIndex: number;
  history: Record<string, { undo: Snapshot[]; redo: Snapshot[] }>;
  /** Step-by-step mode: arrows/boxes reveal as you press → (on while recording a page with steps). */
  presenting: boolean;
  stepAt: number;
  /** performance.now() when the step last moved forward; 0 after moving back (no animation). */
  stepChangedAt: number;
  textDraft: TextDraft | null;
  cam: DevState;
  mic: DevState;
  screen: DevState;
  teleprompter: boolean;
  promptPlaying: boolean;
  rec: RecState;
  countdownN: number;
  /** 0..1 while a recording is being finished on disk. */
  saveProgress: number;
  videos: VideoMeta[];
  projects: Project[];
  reviewId: string | null;
  libraryOpen: boolean;
  helpOpen: boolean;
  toast: { id: number; text: string; tone: 'info' | 'error' } | null;
}

const PREFS_KEY = 'jungey.prefs.v1';
const DEFAULT_PREFS: Prefs = {
  tool: 'pen',
  shape: 'arrow',
  colorIndex: 0,
  sizeIndex: 1,
  mirror: true,
  countdown: true,
  autoScroll: true,
  camId: '',
  micId: '',
};

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

export const useStore = create<State>()(() => ({
  ...loadPrefs(),
  screenView: 'home',
  project: null,
  pageIndex: 0,
  history: {},
  textDraft: null,
  cam: 'off',
  mic: 'off',
  screen: 'off',
  teleprompter: false,
  promptPlaying: false,
  rec: 'idle',
  presenting: false,
  stepAt: 0,
  stepChangedAt: 0,
  countdownN: 3,
  saveProgress: 0,
  videos: [],
  projects: [],
  reviewId: null,
  libraryOpen: false,
  helpOpen: false,
  toast: null,
}));

useStore.subscribe((s, prev) => {
  const keys = Object.keys(DEFAULT_PREFS) as (keyof Prefs)[];
  if (keys.some((k) => s[k] !== prev[k])) {
    const prefs = Object.fromEntries(keys.map((k) => [k, s[k]]));
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage full or blocked: prefs are a convenience */
    }
  }
});

const get = useStore.getState;
const set = useStore.setState;

export const blankPage = (): Page => ({ id: uid(), items: [], view: { x: 0, y: 0, zoom: 1 } });

export function currentPage(s: State = get()): Page | undefined {
  return s.project?.pages[s.pageIndex];
}

export function activeColor(s: State = get()): string {
  if (!s.project) return '#ffffff';
  const pal = paletteFor(s.project.settings);
  return pal[s.colorIndex] ?? pal[0];
}

function patchProject(fn: (p: Project) => Project) {
  const p = get().project;
  if (p) set({ project: { ...fn(p), updatedAt: Date.now() } });
}

function patchPage(id: string, fn: (pg: Page) => Page) {
  patchProject((p) => ({ ...p, pages: p.pages.map((pg) => (pg.id === id ? fn(pg) : pg)) }));
}

const snapshot = (pg: Page): Snapshot => ({ items: pg.items, nodes: pg.nodes ?? [], edges: pg.edges ?? [] });

/** Change the current page's ink and/or diagram, recording an undo step. */
function commitPage(patch: Partial<Snapshot>) {
  const s = get();
  const page = currentPage(s);
  if (!page) return;
  const h = s.history[page.id] ?? { undo: [], redo: [] };
  set({ history: { ...s.history, [page.id]: { undo: [...h.undo, snapshot(page)].slice(-200), redo: [] } } });
  patchPage(page.id, (pg) => ({ ...pg, ...patch }));
}
const commitItems = (items: Item[]) => commitPage({ items });

let toastSeq = 0;

export const actions = {
  newProject(preset: Preset): Project {
    const now = Date.now();
    const project: Project = {
      id: uid(),
      title: `${preset.title} · ${shortDate(now)}`,
      presetId: preset.id,
      createdAt: now,
      updatedAt: now,
      pages: [blankPage()],
      settings: { ...DEFAULT_SETTINGS, ...preset.settings, bubble: { ...DEFAULT_SETTINGS.bubble } },
    };
    set({
      project,
      pageIndex: 0,
      history: {},
      textDraft: null,
      screenView: 'studio',
      teleprompter: !!preset.teleprompter,
      tool: preset.tool ?? get().tool,
      colorIndex: 0,
    });
    return project;
  },

  openProject(project: Project) {
    set({ project, pageIndex: 0, history: {}, textDraft: null, screenView: 'studio' });
  },

  goHome() {
    actions.commitText();
    set({ screenView: 'home', libraryOpen: false, teleprompter: false, promptPlaying: false });
  },

  updateSettings(patch: Partial<ProjectSettings>) {
    patchProject((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  },

  setBubble(patch: Partial<CamBubble>) {
    patchProject((p) => ({ ...p, settings: { ...p.settings, bubble: { ...p.settings.bubble, ...patch } } }));
  },

  setTitle(title: string) {
    patchProject((p) => ({ ...p, title }));
  },

  setTool(tool: Tool) {
    actions.commitText();
    set({ tool });
  },

  setShape(shape: ShapeKind) {
    actions.commitText();
    set({ shape, tool: 'shape' });
  },

  setColor(i: number) {
    set({ colorIndex: clamp(i, 0, 5) });
    const d = get().textDraft;
    if (d) set({ textDraft: { ...d, color: activeColor() } });
  },

  setSize(i: number) {
    set({ sizeIndex: clamp(i, 0, 2) });
  },

  addItem(item: Item) {
    const page = currentPage();
    if (page) commitItems([...page.items, item]);
  },

  removeItems(ids: Set<string>) {
    const page = currentPage();
    if (page && ids.size) commitItems(page.items.filter((it) => !ids.has(it.id)));
  },

  clearPage() {
    const page = currentPage();
    if (page && (page.items.length || page.nodes?.length)) {
      commitPage({ items: [], nodes: [], edges: [] });
      actions.toast('Page cleared. Press Ctrl+Z to bring it back.');
    }
  },

  undo() {
    const s = get();
    const page = currentPage(s);
    const h = page && s.history[page.id];
    if (!page || !h?.undo.length) return;
    const prev = h.undo[h.undo.length - 1];
    set({ history: { ...s.history, [page.id]: { undo: h.undo.slice(0, -1), redo: [...h.redo, snapshot(page)] } } });
    patchPage(page.id, (pg) => ({ ...pg, ...prev }));
  },

  redo() {
    const s = get();
    const page = currentPage(s);
    const h = page && s.history[page.id];
    if (!page || !h?.redo.length) return;
    const next = h.redo[h.redo.length - 1];
    set({ history: { ...s.history, [page.id]: { undo: [...h.undo, snapshot(page)], redo: h.redo.slice(0, -1) } } });
    patchPage(page.id, (pg) => ({ ...pg, ...next }));
  },

  // ---------------------------------------------------------------- diagrams

  /** Replace the page's whole diagram (one undo step). */
  setDiagram(nodes: DiagramNode[], edges: DiagramEdge[]) {
    commitPage({ nodes, edges });
  },

  addDiagram(nodes: DiagramNode[], edges: DiagramEdge[] = []) {
    const page = currentPage();
    if (page) commitPage({ nodes: [...(page.nodes ?? []), ...nodes], edges: [...(page.edges ?? []), ...edges] });
  },

  updateNodes(changes: Record<string, Partial<DiagramNode>>) {
    const page = currentPage();
    if (page) commitPage({ nodes: (page.nodes ?? []).map((n) => (changes[n.id] ? { ...n, ...changes[n.id] } : n)) });
  },

  updateEdges(changes: Record<string, Partial<DiagramEdge>>) {
    const page = currentPage();
    if (page) commitPage({ edges: (page.edges ?? []).map((e) => (changes[e.id] ? { ...e, ...changes[e.id] } : e)) });
  },

  /** Deletes nodes and arrows; arrows attached to deleted nodes go too. */
  removeDiagram(ids: Set<string>) {
    const page = currentPage();
    if (!page || !ids.size) return;
    const nodes = (page.nodes ?? []).filter((n) => !ids.has(n.id));
    const kept = new Set(nodes.map((n) => n.id));
    commitPage({ nodes, edges: (page.edges ?? []).filter((e) => !ids.has(e.id) && kept.has(e.from) && kept.has(e.to)) });
  },

  // ---------------------------------------------------------------- presenting steps

  startPresenting() {
    set({ presenting: true, stepAt: 0, stepChangedAt: 0 });
  },

  stopPresenting() {
    set({ presenting: false, stepAt: 0, stepChangedAt: 0 });
  },

  /** → : next step, or the next page once this page's steps are done. */
  nextStep() {
    const s = get();
    if (!s.project) return;
    if (s.presenting && s.stepAt < presentedSteps(currentPage(s), s.project.settings.reveal ?? true)) {
      set({ stepAt: s.stepAt + 1, stepChangedAt: performance.now() });
    } else if (s.pageIndex < s.project.pages.length - 1) {
      actions.goToPage(s.pageIndex + 1);
    }
  },

  /** ← : previous step, or the previous page (fully shown). */
  prevStep() {
    const s = get();
    if (!s.project) return;
    if (s.presenting && s.stepAt > 0) {
      set({ stepAt: s.stepAt - 1, stepChangedAt: 0 });
    } else if (s.pageIndex > 0) {
      actions.goToPage(s.pageIndex - 1);
      if (s.presenting) set({ stepAt: presentedSteps(s.project.pages[s.pageIndex - 1], s.project.settings.reveal ?? true) });
    }
  },

  setView(view: View) {
    const page = currentPage();
    if (page) patchPage(page.id, (pg) => ({ ...pg, view }));
  },

  resetView() {
    actions.setView({ x: 0, y: 0, zoom: 1 });
  },

  addPage() {
    actions.commitText();
    const s = get();
    if (!s.project) return;
    const pages = s.project.pages.slice();
    pages.splice(s.pageIndex + 1, 0, blankPage());
    patchProject((p) => ({ ...p, pages }));
    set({ pageIndex: s.pageIndex + 1 });
  },

  deletePage(i: number) {
    const s = get();
    if (!s.project) return;
    if (s.project.pages.length === 1) {
      const only = s.project.pages[0];
      patchPage(only.id, (pg) => ({ ...pg, items: [], nodes: [], edges: [], bg: undefined }));
      return;
    }
    const pages = s.project.pages.filter((_, j) => j !== i);
    patchProject((p) => ({ ...p, pages }));
    set({ pageIndex: clamp(s.pageIndex > i ? s.pageIndex - 1 : s.pageIndex, 0, pages.length - 1), textDraft: null });
  },

  goToPage(i: number) {
    const s = get();
    if (!s.project) return;
    actions.commitText();
    set({ pageIndex: clamp(i, 0, s.project.pages.length - 1), stepAt: 0, stepChangedAt: 0 });
  },

  /** Each imported image/PDF page becomes a page. An empty current page is reused for the first one. */
  addImagePages(images: PageImage[]) {
    const s = get();
    if (!s.project || !images.length) return;
    const pages = s.project.pages.slice();
    const cur = pages[s.pageIndex];
    let at = s.pageIndex;
    const queue = images.slice();
    if (cur && !cur.items.length && !cur.bg && !cur.nodes?.length) {
      pages[at] = { ...cur, bg: queue.shift() };
    } else {
      at += 1;
      pages.splice(at, 0, { ...blankPage(), bg: queue.shift() });
    }
    pages.splice(at + 1, 0, ...queue.map((bg) => ({ ...blankPage(), bg })));
    patchProject((p) => ({ ...p, pages }));
    set({ pageIndex: at });
  },

  startText(d: TextDraft) {
    set({ textDraft: d });
  },

  updateText(text: string) {
    const d = get().textDraft;
    if (d) set({ textDraft: { ...d, text } });
  },

  commitText() {
    const d = get().textDraft;
    if (!d) return;
    set({ textDraft: null });
    const page = currentPage();
    if (!page) return;
    const text = d.text.replace(/\s+$/, '');
    const others = d.replaceId ? page.items.filter((it) => it.id !== d.replaceId) : page.items;
    if (!text) {
      if (d.replaceId) commitItems(others);
      return;
    }
    commitItems([...others, { id: d.replaceId ?? uid(), kind: 'text', x: d.x, y: d.y, text, color: d.color, size: d.size }]);
  },

  toast(text: string, tone: 'info' | 'error' = 'info') {
    const id = ++toastSeq;
    set({ toast: { id, text, tone } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, tone === 'error' ? 6000 : 3500);
  },
};
