// A small always-on-top window with the recording controls, for when you switch to the app
// you're presenting in "Screen + me". While you present your whole screen it also has the
// drawing tools for the ink layer on top of it.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useStore } from '../store';
import { cancelCountdown, stopRecording, togglePause } from '../engine/session';
import { bridge } from '../platform';
import { closeChild, openChild } from '../lib/childWindow';
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

  useEffect(() => {
    if (!desk) return;
    const view = wrap.current!.ownerDocument.defaultView!;
    view.addEventListener('keydown', deskKey);
    return () => view.removeEventListener('keydown', deskKey);
  }, [desk]);

  return (
    <div className={`mini-wrap ${desk ? 'desk' : ''}`} ref={wrap}>
      {stamps && <StampRow />}
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
        {desk && <DeskTools />}
      </div>
    </div>
  );
}

export function openMiniControls() {
  openChild('jungey-mini', <MiniControls />, {
    title: 'Jungey controls',
    copyStyles: true,
    bodyClass: 'mini-body',
    features: useDesk.getState().on ? 'width=920,height=56' : 'width=392,height=64',
  });
}

export const closeMiniControls = () => closeChild('jungey-mini');
