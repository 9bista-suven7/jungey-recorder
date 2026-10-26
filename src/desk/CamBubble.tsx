// Your face as a real round window on the screen while you present it: you can see it, drag it
// out of the way, and the screen recording shows it exactly there.
import { useEffect, useRef, type PointerEvent } from 'react';
import { useStore } from '../store';
import { bridge } from '../platform';
import { media } from '../engine/media';
import { bubblePlacement } from '../engine/layout';

/** Room around the bubble for its shadow. */
export const BUBBLE_PAD = 22;

/** Where the bubble goes on a screen of this size, as window.open features. */
export function bubbleFeatures(bounds: { x: number; y: number; width: number; height: number }) {
  const b = useStore.getState().project!.settings.bubble;
  const { rect } = bubblePlacement(b, bounds.width, bounds.height);
  const f = {
    left: Math.round(bounds.x + rect.x - BUBBLE_PAD),
    top: Math.round(bounds.y + rect.y - BUBBLE_PAD),
    width: Math.round(rect.w + BUBBLE_PAD * 2),
    height: Math.round(rect.h + BUBBLE_PAD * 2),
  };
  return Object.entries(f).map(([k, v]) => `${k}=${v}`).join(',');
}

export function CamBubble() {
  const ref = useRef<HTMLVideoElement>(null);
  const cam = useStore((s) => s.cam);
  const mirror = useStore((s) => s.mirror);
  const shape = useStore((s) => s.project?.settings.bubble.shape ?? 'circle');
  const drag = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  useEffect(() => {
    const v = ref.current!;
    v.srcObject = media.camVideo.srcObject;
    void v.play().catch(() => {});
  }, [cam]);

  // Dragged by the app rather than the window manager, so it moves the same way everywhere.
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const view = e.currentTarget.ownerDocument.defaultView!;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: view.screenX, y: view.screenY, sx: e.screenX, sy: e.screenY };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) bridge.desk?.moveCam({ x: d.x + e.screenX - d.sx, y: d.y + e.screenY - d.sy });
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <div className={`bubble ${shape}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <video ref={ref} muted playsInline autoPlay style={mirror ? { transform: 'scaleX(-1)' } : undefined} />
    </div>
  );
}

export const BUBBLE_CSS = `
html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; }
.bubble {
  position: fixed; inset: ${BUBBLE_PAD}px; overflow: hidden; background: #111318;
  border: max(4px, 2.2vmin) solid rgba(255,255,255,0.92); box-sizing: border-box;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4); cursor: grab; touch-action: none; user-select: none;
}
.bubble.circle { border-radius: 50%; }
.bubble.rounded { border-radius: calc((100vh - ${BUBBLE_PAD * 2}px) * 0.16); }
.bubble:active { cursor: grabbing; }
.bubble video { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
`;
