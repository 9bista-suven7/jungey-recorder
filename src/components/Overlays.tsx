// Small app-wide overlays: video library drawer, screen picker, shortcuts help, toast.
import { useEffect, useState } from 'react';
import { AppWindow, FolderOpen, Monitor, X } from 'lucide-react';
import { useStore } from '../store';
import { bridge, isDesktop, type ScreenSource } from '../platform';
import { Kbd, VideoCard } from './ui';

export function LibraryDrawer() {
  const open = useStore((s) => s.libraryOpen);
  const videos = useStore((s) => s.videos);
  if (!open) return null;
  const close = () => useStore.setState({ libraryOpen: false });
  return (
    <div className="drawer-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <aside className="drawer" aria-label="My videos">
        <div className="drawer-head">
          <h2>My videos</h2>
          {isDesktop && (
            <button className="btn ghost" onClick={() => bridge.videos.openFolder()}>
              <FolderOpen size={16} /> Folder
            </button>
          )}
          <button className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {videos.length ? (
          <div className="drawer-list">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} onOpen={() => useStore.setState({ reviewId: v.id, libraryOpen: false })} />
            ))}
          </div>
        ) : (
          <p className="drawer-empty">Your recordings will show up here. Press Record to make the first one.</p>
        )}
      </aside>
    </div>
  );
}

/** The app's own picker for "Screen + me" (the main process asks for it). */
export function ScreenPicker() {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  useEffect(
    () =>
      bridge.onPickSource((list) => {
        setSources(list);
        setTab(list.some((s) => s.kind === 'window') ? 'window' : 'screen');
      }),
    [],
  );
  if (!sources) return null;
  const pick = (id: string | null) => {
    bridge.pickSource(id);
    setSources(null);
  };
  const shown = sources.filter((s) => s.kind === tab);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && pick(null)}>
      <div className="modal picker" role="dialog" aria-label="Choose what to share">
        <div className="picker-head">
          <h2>What do you want to show?</h2>
          <button className="icon-btn" onClick={() => pick(null)} aria-label="Cancel">
            <X size={18} />
          </button>
        </div>
        <div className="segmented picker-tabs">
          <button className={tab === 'window' ? 'on' : ''} onClick={() => setTab('window')}>
            <AppWindow size={16} /> <span className="seg-label">A window</span>
          </button>
          <button className={tab === 'screen' ? 'on' : ''} onClick={() => setTab('screen')}>
            <Monitor size={16} /> <span className="seg-label">Whole screen</span>
          </button>
        </div>
        <div className="picker-grid">
          {shown.map((s) => (
            <button key={s.id} className="picker-item" onClick={() => pick(s.id)}>
              <img src={s.thumb} alt="" />
              <span>{s.name}</span>
            </button>
          ))}
          {!shown.length && <p className="drawer-empty">Nothing to show here.</p>}
        </div>
        <p className="picker-tip">Tip: share a window (a browser, slides, code editor), then draw over it in Jungey Recorder.</p>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string[]][] = [
  ['Start / stop recording', ['R']],
  ['Pause / resume', ['K']],
  ['Record or pause from any app', ['Alt', 'Shift', 'R / P']],
  ['Pen · Highlighter · Eraser', ['P', 'H', 'E']],
  ['Shapes (press again to switch)', ['S']],
  ['Text · Laser pointer', ['T', 'L']],
  ['Move the board', ['Hold Space']],
  ['Zoom', ['Ctrl', 'Scroll']],
  ['Colours', ['1 – 6']],
  ['Thinner / thicker', ['[', ']']],
  ['Undo / redo', ['Ctrl Z', 'Ctrl Y']],
  ['Previous / next page', ['←', '→']],
  ['New page', ['N']],
  ['Camera on / off', ['C']],
  ['Next board colour', ['B']],
];

export function ShortcutsDialog() {
  const open = useStore((s) => s.helpOpen);
  if (!open) return null;
  const close = () => useStore.setState({ helpOpen: false });
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal help" role="dialog" aria-label="Keyboard shortcuts">
        <div className="picker-head">
          <h2>Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <dl className="shortcuts">
          {SHORTCUTS.map(([label, keys]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.tone}`} role="status" key={toast.id}>
      {toast.text}
    </div>
  );
}
