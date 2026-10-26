// Native features come from the Electron preload (window.jungey). When the UI runs in a plain
// browser (handy while developing), a small in-memory stand-in keeps everything working.
import fixWebmDuration from 'fix-webm-duration';
import type { Project, VideoMeta } from './types';

export interface ScreenSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumb: string;
}

export interface AppInfo {
  platform: string;
  version: string;
  videosDir: string;
  hasFfmpeg: boolean;
}

export type NewVideo = Omit<VideoMeta, 'id' | 'file'>;

export interface Bridge {
  info(): Promise<AppInfo>;
  rec: {
    begin(id: string, ext: 'mp4' | 'webm'): Promise<boolean>;
    chunk(id: string, buf: ArrayBuffer): Promise<boolean>;
    finish(id: string, meta: NewVideo): Promise<VideoMeta>;
    abort(id: string): Promise<boolean>;
  };
  /** Desktop only: boards saved as files. */
  projects?: {
    list(): Promise<Project[]>;
    put(p: Project): Promise<boolean>;
    remove(id: string): Promise<boolean>;
  };
  videos: {
    list(): Promise<VideoMeta[]>;
    rename(id: string, title: string): Promise<VideoMeta | null>;
    remove(id: string): Promise<boolean>;
    reveal(id: string): Promise<void>;
    openFolder(): Promise<string>;
    saveCopy(id: string): Promise<string | null>;
    trim(args: { id: string; start: number; end: number; title: string }): Promise<VideoMeta>;
  };
  /** Yearly figures for a country from the World Bank (inflation, GDP growth, ...). */
  worldBank(args: { country: string; indicator: string; years: number }): Promise<{ country: string; points: { year: string; value: number }[] }>;
  onProgress(cb: (p: { id: string; progress: number }) => void): () => void;
  onPickSource(cb: (list: ScreenSource[]) => void): () => void;
  pickSource(id: string | null): void;
  onShortcut(cb: (name: 'record' | 'pause') => void): () => void;
}

declare global {
  interface Window {
    jungey?: Bridge;
  }
}

export const isDesktop = !!window.jungey;

/** URL a <video> can play. On desktop the file is streamed from disk by the app:// protocol. */
export const mediaUrl = (v: VideoMeta) => (isDesktop ? `app://media/${encodeURIComponent(v.id)}` : v.file);

function webBridge(): Bridge {
  const parts = new Map<string, { ext: 'mp4' | 'webm'; blobs: Blob[] }>();
  let videos: VideoMeta[] = [];
  const none = () => () => {};
  return {
    info: async () => ({ platform: 'web', version: 'dev', videosDir: '', hasFfmpeg: false }),
    rec: {
      begin: async (id, ext) => (parts.set(id, { ext, blobs: [] }), true),
      chunk: async (id, buf) => (parts.get(id)?.blobs.push(new Blob([buf])), true),
      finish: async (id, meta) => {
        const p = parts.get(id)!;
        parts.delete(id);
        let blob = new Blob(p.blobs, { type: `video/${p.ext}` });
        if (p.ext === 'webm') blob = await fixWebmDuration(blob, meta.durationMs, { logger: false });
        const v: VideoMeta = { ...meta, id, file: URL.createObjectURL(blob) };
        videos = [v, ...videos];
        return v;
      },
      abort: async (id) => (parts.delete(id), true),
    },
    videos: {
      list: async () => videos,
      rename: async (id, title) => {
        videos = videos.map((v) => (v.id === id ? { ...v, title } : v));
        return videos.find((v) => v.id === id) ?? null;
      },
      remove: async (id) => ((videos = videos.filter((v) => v.id !== id)), true),
      reveal: async () => {},
      openFolder: async () => '',
      saveCopy: async (id) => {
        const v = videos.find((x) => x.id === id);
        if (v) {
          const a = document.createElement('a');
          a.href = v.file;
          a.download = `${v.title}.${parts.get(id)?.ext ?? 'mp4'}`;
          a.click();
        }
        return null;
      },
      trim: async () => {
        throw new Error('Trimming needs the desktop app');
      },
    },
    worldBank: async ({ country, indicator, years }) => {
      const res = await fetch(`https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=${years}&mrv=${years}`);
      const json = await res.json();
      const rows: { date: string; value: number | null; country: { value: string } }[] = Array.isArray(json?.[1]) ? json[1] : [];
      return {
        country: rows[0]?.country.value ?? country,
        points: rows.filter((r) => typeof r.value === 'number').map((r) => ({ year: r.date, value: r.value as number })).sort((a, b) => a.year.localeCompare(b.year)),
      };
    },
    onProgress: none,
    onPickSource: none,
    pickSource: () => {},
    onShortcut: none,
  };
}

export const bridge: Bridge = window.jungey ?? webBridge();
