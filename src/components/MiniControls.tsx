// A small always-on-top window with the recording controls, for when you switch to the app
// you're presenting in "Screen + me". While you present your whole screen it also has the
// drawing tools for the ink layer on top of it.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { AppWindow, Pause, Play, Square } from 'lucide-react';
import { useStore } from '../store';
import { cancelCountdown, startRecording, stopRecording, togglePause } from '../engine/session';
import { bridge } from '../platform';
import { closeChild, openChild } from '../lib/childWindow';
import { closePresenter } from '../desk/present';
import { useDesk } from '../desk/state';
import { DeskTools, StampRow, deskKey } from '../desk/DeskTools';
import { Timer } from './TopBar';

function MiniControls() {
  const rec = useStore((s) => s.rec);
  const n = useStore((s) => s.countdownN);
  const desk = useDesk((s) => s.on);
  const stamps = useDesk((s) => s.on && s.tool === 'stamp');
  const wrap = useRef<HTMLDivElement>(null);
  const paused = rec === 'paused';

  // The window fits what's in it (the emoji row comes and goes).
  useLayoutEffect(() => {
    if (!desk) return;
    const el = wrap.current!;
    const view = el.ownerDocument.defaultView!;
    const send = () => bridge.desk?.toolbar({ width: Math.ceil(el.scrollWidth), height: Math.ceil(el.scrollHeight) });
    const ro = new view.ResizeObserver(send);
    ro.observe(el);
    send();
    return () => ro.disconnect();
  }, [desk]);

  // Tool keys, while a drawing tool is on. In pointer mode the keyboard belongs to your apps
  // (the window manager may still hand this window the focus), so nothing is acted on here.
  useEffect(() => {
    if (!desk) return;
    const view = wrap.current!.ownerDocument.defaultView!;
    const key = (e: KeyboardEvent) => useDesk.getState().tool !== 'mouse' && deskKey(e);
    view.addEventListener('keydown', key);
    return () => view.removeEventListener('keydown', key);
  }, [desk]);

  return (
    <div className={`mini-wrap ${desk ? 'desk' : ''}`} ref={wrap}>
      {stamps && <StampRow />}
      <div className="mini">
        <span className="mini-drag" />
        {rec === 'idle' ? (
          // Presenting, not recording yet: use your computer, draw, and record when ready.
          <button className="mini-btn stop" onClick={() => void startRecording()} title="Start recording (Alt+Shift+R)">
            <span className="rec-dot" /> Record
          </button>
        ) : rec === 'countdown' ? (
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
        {desk && <DeskTools />}
        {desk && rec === 'idle' && (
          <>
            <span className="mini-sep" />
            <button className="mini-tool" onClick={closePresenter} title="Back to Jungey Recorder" aria-label="Back to Jungey Recorder">
              <AppWindow size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function openMiniControls() {
  openChild('jungey-mini', <MiniControls />, {
    title: 'Jungey controls',
    // Closed by hand while presenting: back to the app (where Stop still is, if recording).
    onClosed: () => useDesk.getState().on && closePresenter(),
    copyStyles: true,
    bodyClass: 'mini-body',
    features: useDesk.getState().on ? 'width=920,height=56' : 'width=392,height=64',
  });
}

export const closeMiniControls = () => closeChild('jungey-mini');
