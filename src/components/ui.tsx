import { useEffect, useRef, useState, type ReactNode } from 'react';
import { renderThumb } from '../engine/compositor';
import { STAGE_SIZE } from '../lib/boards';
import { formatTime, timeAgo } from '../lib/util';
import type { Aspect, BoardStyleId, Page, VideoMeta } from '../types';
import { Play } from 'lucide-react';

/** A button that opens a floating panel; closes on outside click or Escape. */
export function Popover({
  button,
  children,
  placement = 'bottom-start',
  className = '',
}: {
  button: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: 'bottom-start' | 'bottom-end' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="pop-anchor" ref={ref}>
      {button({ open, toggle: () => setOpen((o) => !o) })}
      {open && <div className={`popover ${placement} ${className}`}>{typeof children === 'function' ? children(close) : children}</div>}
    </div>
  );
}

export function PageThumb({ page, styleId, aspect, height = 56 }: { page: Page; styleId: BoardStyleId; aspect: Aspect; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [W, H] = STAGE_SIZE[aspect];
  const width = Math.round((height * W) / H);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const c = ref.current;
    if (c) renderThumb(c, page, styleId, W, H, () => setTick((t) => t + 1));
  }, [page.items, page.bg, styleId, W, H, tick, page]);
  return <canvas ref={ref} width={width * 2} height={height * 2} style={{ width, height }} className="thumb-canvas" />;
}

export function VideoCard({ video, onOpen }: { video: VideoMeta; onOpen: () => void }) {
  return (
    <button className="video-card" onClick={onOpen}>
      <div className="video-thumb">
        {video.thumb ? <img src={video.thumb} alt="" /> : <div className="video-thumb-empty" />}
        <span className="video-play">
          <Play size={18} fill="currentColor" />
        </span>
        {video.durationMs > 0 && <span className="video-dur">{formatTime(video.durationMs)}</span>}
      </div>
      <div className="video-title">{video.title}</div>
      <div className="video-sub">{timeAgo(video.createdAt)}</div>
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
