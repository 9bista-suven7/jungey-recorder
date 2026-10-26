import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ImageUp, LoaderCircle, MonitorUp, Video } from 'lucide-react';
import { actions, SIZES, useStore } from '../store';
import { STAGE_SIZE } from '../lib/boards';
import { compositor, startLoop } from '../engine/compositor';
import { attachStageInput } from '../engine/input';
import { bubblePlacement } from '../engine/layout';
import { media } from '../engine/media';
import { shareScreen } from '../desk/present';
import { importFiles } from '../engine/importer';
import { TEXT_FONT, TEXT_LINE } from '../engine/items';
import { clamp } from '../lib/util';
import { Teleprompter } from './Teleprompter';
import { DiagramOverlay } from './DiagramOverlay';
import { DRAG_TYPE } from './LibraryPanel';
import { addFromLibrary } from '../diagram/interact';
import { toWorld } from '../engine/layout';
import type { NodeShape } from '../types';

/** Drag to move the camera bubble, drag the knob to resize, double-click to change its shape. */
function BubbleHandle({ k }: { k: number }) {
  const layout = useStore((s) => s.project!.settings.layout);
  const aspect = useStore((s) => s.project!.settings.aspect);
  const bubble = useStore((s) => s.project!.settings.bubble);
  const cam = useStore((s) => s.cam);
  if ((layout !== 'board-cam' && layout !== 'screen-cam') || cam !== 'on' || !k) return null;
  const [W, H] = STAGE_SIZE[aspect];
  const pl = bubblePlacement(bubble, W, H);
  const r = pl.rect;

  const drag = (e: React.PointerEvent, resize: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const start = { x: e.clientX, y: e.clientY, size: bubble.size };
    const startDist = Math.hypot(r.w / 2, r.h / 2);
    const short = Math.min(W, H);
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / k, dy = (ev.clientY - start.y) / k;
      if (resize) {
        const dist = Math.hypot(r.w / 2 + dx, r.h / 2 + dy);
        actions.setBubble({ size: clamp((start.size * dist) / startDist, 0.14, 0.6) });
      } else {
        actions.setBubble({ x: (cx + dx) / W, y: (cy + dy) / H });
      }
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      if (resize) return;
      // Snap to the edges when close: tidy corners with no fiddling.
      const b = useStore.getState().project!.settings.bubble;
      const p = bubblePlacement(b, W, H).rect;
      const m = short * 0.03, snap = short * 0.06;
      let x = p.x + p.w / 2, y = p.y + p.h / 2;
      if (p.x - m < snap) x = m + p.w / 2;
      if (W - m - (p.x + p.w) < snap) x = W - m - p.w / 2;
      if (p.y - m < snap) y = m + p.h / 2;
      if (H - m - (p.y + p.h) < snap) y = H - m - p.h / 2;
      actions.setBubble({ x: x / W, y: y / H });
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      className={`bubble-handle ${pl.circle ? 'circle' : ''}`}
      style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: r.h * k, borderRadius: pl.circle ? '50%' : pl.radius * k }}
      onPointerDown={(e) => drag(e, false)}
      onDoubleClick={() => actions.setBubble({ shape: bubble.shape === 'circle' ? 'rounded' : 'circle' })}
      onWheel={(e) => actions.setBubble({ size: clamp(bubble.size * Math.exp(-e.deltaY * 0.001), 0.14, 0.6) })}
    >
      <span className="bubble-hint">Drag to move · double-click for shape</span>
      <span className="bubble-knob" onPointerDown={(e) => drag(e, true)} />
    </div>
  );
}

function TextEditor({ k }: { k: number }) {
  const draft = useStore((s) => s.textDraft);
  useStore((s) => s.project?.pages[s.pageIndex]?.view); // follow pan/zoom
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (draft) requestAnimationFrame(() => ref.current?.focus());
  }, [draft?.x, draft?.y, draft]);
  if (!draft || !k) return null;
  const t = compositor.xform;
  const fontPx = draft.size * t.scale * k;
  return (
    <textarea
      ref={ref}
      className="text-editor"
      style={{
        left: (draft.x * t.scale + t.ox) * k,
        top: (draft.y * t.scale + t.oy) * k,
        font: TEXT_FONT(fontPx),
        lineHeight: TEXT_LINE,
        color: draft.color,
      }}
      value={draft.text}
      placeholder="Type…"
      spellCheck={false}
      onChange={(e) => actions.updateText(e.target.value)}
      onBlur={() => actions.commitText()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          actions.commitText();
        }
      }}
    />
  );
}

function EraserCursor({ k, host }: { k: number; host: React.RefObject<HTMLDivElement | null> }) {
  const tool = useStore((s) => s.tool);
  const size = useStore((s) => SIZES.eraser[s.sizeIndex]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el || tool !== 'eraser') return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (ref.current) ref.current.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
    };
    el.addEventListener('pointermove', move);
    return () => el.removeEventListener('pointermove', move);
  }, [tool, host]);
  if (tool !== 'eraser') return null;
  const d = size * k;
  return <div ref={ref} className="eraser-cursor" style={{ width: d, height: d, margin: -d / 2 }} />;
}

function Placeholders() {
  const layout = useStore((s) => s.project!.settings.layout);
  const screen = useStore((s) => s.screen);
  const cam = useStore((s) => s.cam);
  if (layout === 'screen-cam' && screen !== 'on') {
    return (
      <div className="stage-empty">
        <MonitorUp size={34} />
        <h3>Share your screen</h3>
        <p>This window steps aside so you can use your computer as usual, with tools to draw on top of anything and to record.</p>
        <button className="btn primary" disabled={screen === 'pending'} onClick={() => void shareScreen()}>
          {screen === 'pending' ? <LoaderCircle size={16} className="spin" /> : <MonitorUp size={16} />} Choose what to share
        </button>
      </div>
    );
  }
  if ((layout === 'cam' || layout === 'side') && cam !== 'on' && cam !== 'pending') {
    return (
      <div className={`stage-empty ${layout === 'side' ? 'side' : ''}`}>
        <Video size={30} />
        <h3>{cam === 'denied' ? 'Camera access is blocked' : 'Your camera is off'}</h3>
        {cam === 'denied' && <p>Allow camera access for this app in your system settings, then try again.</p>}
        <button className="btn primary" onClick={() => void media.startCamera()}>
          <Video size={16} /> Turn camera on
        </button>
      </div>
    );
  }
  return null;
}

function Countdown() {
  const rec = useStore((s) => s.rec);
  const n = useStore((s) => s.countdownN);
  if (rec !== 'countdown') return null;
  return (
    <div className="countdown" key={n}>
      <span>{n}</span>
      <small>Recording starts…</small>
    </div>
  );
}

export function Stage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const aspect = useStore((s) => s.project!.settings.aspect);
  const tool = useStore((s) => s.tool);
  const teleprompter = useStore((s) => s.teleprompter);
  const zoom = useStore((s) => s.project?.pages[s.pageIndex]?.view.zoom ?? 1);
  const [W, H] = STAGE_SIZE[aspect];
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dropping, setDropping] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const fit = () => {
      const pad = 20;
      const aw = el.clientWidth - pad * 2, ah = el.clientHeight - pad * 2;
      const s = Math.max(0, Math.min(aw / W, ah / H));
      setBox({ w: Math.floor(W * s), h: Math.floor(H * s) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  useEffect(() => {
    hostRef.current!.appendChild(compositor.canvas);
    // 30 fps matches the recording and halves the work; 60 while drawing (when not recording).
    const stop = startLoop(
      (now) => compositor.render(now),
      () => (compositor.fast && useStore.getState().rec !== 'recording' ? 0 : 1000 / 30),
    );
    const detach = attachStageInput(compositor.canvas);
    return () => {
      stop();
      detach();
      compositor.canvas.remove();
    };
  }, []);

  const k = box.w / W;

  return (
    <div
      className={`stage-wrap ${dropping ? 'dropping' : ''}`}
      ref={wrapRef}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        } else if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const lib = e.dataTransfer.getData(DRAG_TYPE);
        if (lib) {
          const { shape, ...extra } = JSON.parse(lib) as { shape: NodeShape; icon?: string; text?: string };
          const r = compositor.canvas.getBoundingClientRect();
          const p = toWorld(compositor.xform, ((e.clientX - r.left) * compositor.W) / r.width, ((e.clientY - r.top) * compositor.H) / r.height);
          addFromLibrary(shape, extra, p);
          return;
        }
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="stage" ref={stageRef} data-tool={tool} style={{ width: box.w, height: box.h } as CSSProperties}>
        <div ref={hostRef} className="stage-host" />
        <DiagramOverlay k={k} />
        <BubbleHandle k={k} />
        <TextEditor k={k} />
        <EraserCursor k={k} host={stageRef} />
        <Placeholders />
        <Countdown />
        {teleprompter && <Teleprompter />}
        {Math.abs(zoom - 1) > 0.01 && (
          <button className="zoom-chip" onClick={actions.resetView} data-tip="Reset zoom and position">
            {Math.round(zoom * 100)}% · Reset
          </button>
        )}
      </div>
      {dropping && (
        <div className="drop-hint">
          <ImageUp size={28} /> Drop PDFs or images to add them as pages
        </div>
      )}
    </div>
  );
}
