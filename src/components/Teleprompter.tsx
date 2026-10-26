// Script that scrolls near the top of the frame (close to the camera) so you keep eye contact.
// It is part of the app window only; it never appears in the video.
import { useEffect, useRef, useState } from 'react';
import { GripHorizontal, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { useStore } from '../store';

const SCRIPT_KEY = 'jungey.script';
const PROMPT_KEY = 'jungey.prompter';
const EXAMPLE = `Paste or type your script here.

When you press Record it scrolls by itself, and it pauses when you pause. You can also press Play here to practise.

Tip: keep this box near the top of the screen, close to your camera, so you look at the viewer while you read.`;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function Teleprompter() {
  const playing = useStore((s) => s.promptPlaying);
  const [script, setScript] = useState(() => load(SCRIPT_KEY, EXAMPLE));
  const [opts, setOpts] = useState(() => load(PROMPT_KEY, { speed: 36, font: 26, x: 0.5, y: 0.04 }));
  const [editing, setEditing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SCRIPT_KEY, JSON.stringify(script));
      localStorage.setItem(PROMPT_KEY, JSON.stringify(opts));
    } catch {
      /* not critical */
    }
  }, [script, opts]);

  useEffect(() => {
    if (playing) setEditing(false);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const el = textRef.current;
      if (el) {
        el.scrollTop += (opts.speed * (now - last)) / 1000;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) useStore.setState({ promptPlaying: false });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, opts.speed]);

  const drag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const box = boxRef.current!;
    const parent = box.offsetParent as HTMLElement;
    const start = { x: e.clientX, y: e.clientY, ox: opts.x, oy: opts.y };
    const pw = parent.clientWidth, ph = parent.clientHeight;
    const move = (ev: PointerEvent) =>
      setOpts((o) => ({
        ...o,
        x: Math.min(0.95, Math.max(0.05, start.ox + (ev.clientX - start.x) / pw)),
        y: Math.min(0.85, Math.max(0, start.oy + (ev.clientY - start.y) / ph)),
      }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const setPlaying = (p: boolean) => useStore.setState({ promptPlaying: p });

  return (
    <div className="prompter" ref={boxRef} style={{ left: `${opts.x * 100}%`, top: `${opts.y * 100}%` }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="prompter-head" onPointerDown={drag}>
        <GripHorizontal size={16} className="grip" />
        <button className="icon-btn small" onClick={() => setPlaying(!playing)} data-tip={playing ? 'Pause script' : 'Play script'}>
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <button
          className="icon-btn small"
          onClick={() => {
            if (textRef.current) textRef.current.scrollTop = 0;
            setPlaying(false);
          }}
          data-tip="Back to the start"
        >
          <RotateCcw size={15} />
        </button>
        <span className="prompter-ctl">
          Speed
          <button className="icon-btn small" onClick={() => setOpts((o) => ({ ...o, speed: Math.max(8, o.speed - 8) }))} aria-label="Slower">
            <Minus size={14} />
          </button>
          <button className="icon-btn small" onClick={() => setOpts((o) => ({ ...o, speed: Math.min(160, o.speed + 8) }))} aria-label="Faster">
            <Plus size={14} />
          </button>
        </span>
        <span className="prompter-ctl">
          Text
          <button className="icon-btn small" onClick={() => setOpts((o) => ({ ...o, font: Math.max(16, o.font - 3) }))} aria-label="Smaller text">
            <Minus size={14} />
          </button>
          <button className="icon-btn small" onClick={() => setOpts((o) => ({ ...o, font: Math.min(56, o.font + 3) }))} aria-label="Bigger text">
            <Plus size={14} />
          </button>
        </span>
        <button className="link-btn" onClick={() => (setPlaying(false), setEditing(!editing))}>
          {editing ? 'Done' : 'Edit'}
        </button>
        <button className="icon-btn small" onClick={() => useStore.setState({ teleprompter: false, promptPlaying: false })} aria-label="Close script">
          <X size={15} />
        </button>
      </div>
      {editing ? (
        <textarea className="prompter-edit" value={script} autoFocus onChange={(e) => setScript(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Type or paste your script…" />
      ) : (
        <div className="prompter-text" ref={textRef} style={{ fontSize: opts.font }} onDoubleClick={() => setEditing(true)}>
          <div className="prompter-pad" />
          {script || 'Double-click to write your script.'}
          <div className="prompter-pad end" />
        </div>
      )}
    </div>
  );
}
