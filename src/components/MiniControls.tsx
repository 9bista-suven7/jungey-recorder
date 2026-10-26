// A small always-on-top window with the recording controls, for when you switch to the app
// you're presenting in "Screen + me". It is a child window rendered by this same React app.
import { createRoot, type Root } from 'react-dom/client';
import { Pause, Play, Square } from 'lucide-react';
import { useStore } from '../store';
import { cancelCountdown, stopRecording, togglePause } from '../engine/session';
import { Timer } from './TopBar';

let win: Window | null = null;
let root: Root | null = null;

function MiniControls() {
  const rec = useStore((s) => s.rec);
  const n = useStore((s) => s.countdownN);
  const paused = rec === 'paused';
  return (
    <div className="mini">
      <span className="mini-drag" />
      {rec === 'countdown' ? (
        <>
          <span className="mini-status">Starting in {n}…</span>
          <button className="mini-btn" onClick={cancelCountdown}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className={`mini-status ${paused ? 'paused' : ''}`}>
            <span className="rec-dot" />
            <Timer />
            {paused && <em>Paused</em>}
          </span>
          <button className="mini-btn" onClick={togglePause} title="Pause / resume (Alt+Shift+P)">
            {paused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
          </button>
          <button className="mini-btn stop" onClick={() => void stopRecording()} title="Stop (Alt+Shift+R)">
            <Square size={13} fill="currentColor" /> Stop
          </button>
        </>
      )}
    </div>
  );
}

export function openMiniControls() {
  if (win && !win.closed) return;
  const w = window.open('', 'jungey-mini', 'width=392,height=64');
  if (!w) return;
  win = w;
  const doc = w.document;
  doc.title = 'Jungey controls';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = doc.createElement('style');
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      doc.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        doc.head.appendChild(link);
      }
    }
  }
  doc.body.className = 'mini-body';
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  root = createRoot(host);
  root.render(<MiniControls />);
  w.addEventListener('pagehide', () => {
    root?.unmount();
    root = null;
    win = null;
  });
}

export function closeMiniControls() {
  root?.unmount();
  root = null;
  win?.close();
  win = null;
}
