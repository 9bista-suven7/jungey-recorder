// After a recording: watch it, trim the start/end, rename, save a copy, or record again.
import { useEffect, useRef, useState } from 'react';
import { Copy, FolderOpen, LoaderCircle, RotateCcw, Scissors, Trash, X } from 'lucide-react';
import { actions, useStore } from '../store';
import { bridge, isDesktop, mediaUrl } from '../platform';
import { trimVideo } from '../engine/trim';
import { formatTime } from '../lib/util';
import type { VideoMeta } from '../types';

function TrimBar({ duration, start, end, onChange, onSeek }: {
  duration: number; start: number; end: number;
  onChange: (s: number, e: number) => void; onSeek: (t: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current!;
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * duration;
      if (which === 'start') {
        const s = Math.min(t, end - 0.5);
        onChange(Math.max(0, s), end);
        onSeek(Math.max(0, s));
      } else {
        const en = Math.max(t, start + 0.5);
        onChange(start, Math.min(duration, en));
        onSeek(Math.min(duration, en));
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const a = (start / duration) * 100, b = (end / duration) * 100;
  return (
    <div className="trim" ref={ref}>
      <div className="trim-track" />
      <div className="trim-keep" style={{ left: `${a}%`, width: `${b - a}%` }} />
      <div className="trim-handle" style={{ left: `${a}%` }} onPointerDown={drag('start')} aria-label="Trim start" role="slider" aria-valuenow={start} />
      <div className="trim-handle end" style={{ left: `${b}%` }} onPointerDown={drag('end')} aria-label="Trim end" role="slider" aria-valuenow={end} />
    </div>
  );
}

function Review({ video }: { video: VideoMeta }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState(video.title);
  const [duration, setDuration] = useState(video.durationMs / 1000);
  const [range, setRange] = useState<[number, number]>([0, video.durationMs / 1000]);
  const [busy, setBusy] = useState<null | number>(null);
  const close = () => useStore.setState({ reviewId: null });

  const onMeta = () => {
    const v = videoRef.current!;
    const fix = (d: number) => {
      if (Number.isFinite(d) && d > 0) {
        setDuration(d);
        setRange(([s, e]) => [s, e > 0 && e < d ? e : d]);
      }
    };
    if (Number.isFinite(v.duration)) return fix(v.duration);
    // Some recordings don't store their length; seeking to the end makes the player find it.
    const onDur = () => {
      if (Number.isFinite(v.duration)) {
        v.removeEventListener('durationchange', onDur);
        fix(v.duration);
        v.currentTime = 0;
      }
    };
    v.addEventListener('durationchange', onDur);
    v.currentTime = 1e7;
  };

  // Playback stays inside the trimmed part.
  const onTime = () => {
    const v = videoRef.current!;
    if (v.currentTime > range[1]) {
      v.pause();
      v.currentTime = range[0];
    }
  };

  const saveTitle = async () => {
    const t = title.trim() || video.title;
    if (t === video.title) return;
    const updated = await bridge.videos.rename(video.id, t);
    if (updated) useStore.setState((s) => ({ videos: s.videos.map((v) => (v.id === video.id ? updated : v)) }));
  };

  const trimmed = range[0] > 0.05 || range[1] < duration - 0.05;

  const saveTrim = async () => {
    setBusy(0);
    try {
      const out = await trimVideo({ ...video, title: title.trim() || video.title }, range[0], range[1], (p) => setBusy(p));
      useStore.setState((s) => ({ videos: [out, ...s.videos], reviewId: out.id }));
      actions.toast('Saved the trimmed video.');
    } catch (err) {
      console.error(err);
      actions.toast(`Trimming failed: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm(`Move "${video.title}" to the trash?`)) return;
    await bridge.videos.remove(video.id);
    useStore.setState((s) => ({ videos: s.videos.filter((v) => v.id !== video.id), reviewId: null }));
  };

  const saveCopy = async () => {
    const path = await bridge.videos.saveCopy(video.id);
    if (path) actions.toast(`Saved a copy to ${path}`);
  };

  return (
    <div className="review">
      <div className="review-player">
        <video
          ref={videoRef}
          src={mediaUrl(video)}
          controls
          autoPlay
          preload="metadata"
          onLoadedMetadata={onMeta}
          onTimeUpdate={onTime}
          onPlay={(e) => {
            const v = e.currentTarget;
            if (v.currentTime < range[0] || v.currentTime >= range[1] - 0.05) v.currentTime = range[0];
          }}
        />
      </div>
      <div className="review-side">
        <div className="review-head">
          <input className="review-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Video name" />
          <button className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="review-saved">
          {isDesktop ? (
            <>
              Saved to <b>{video.file.split(/[\\/]/).slice(-2).join('/')}</b>
            </>
          ) : (
            'Saved in this session'
          )}
          {duration > 0 && <span> · {formatTime(duration * 1000)}</span>}
        </div>

        {duration > 1 && (
          <div className="review-block">
            <div className="review-label">
              <Scissors size={15} /> Trim the start and end
            </div>
            <TrimBar
              duration={duration}
              start={range[0]}
              end={range[1]}
              onChange={(s, e) => setRange([s, e])}
              onSeek={(t) => {
                const v = videoRef.current;
                if (v) {
                  v.pause();
                  v.currentTime = t;
                }
              }}
            />
            <div className="trim-times">
              <span>{formatTime(range[0] * 1000)}</span>
              <span>keeps {formatTime((range[1] - range[0]) * 1000)}</span>
              <span>{formatTime(range[1] * 1000)}</span>
            </div>
            <button className="btn primary wide" disabled={!trimmed || busy !== null} onClick={saveTrim}>
              {busy !== null ? (
                <>
                  <LoaderCircle size={16} className="spin" /> Trimming {Math.round(busy * 100)}%
                </>
              ) : (
                <>
                  <Scissors size={16} /> Save trimmed copy
                </>
              )}
            </button>
          </div>
        )}

        <div className="review-actions">
          {isDesktop && (
            <button className="btn" onClick={() => bridge.videos.reveal(video.id)}>
              <FolderOpen size={16} /> Show in folder
            </button>
          )}
          <button className="btn" onClick={saveCopy}>
            <Copy size={16} /> {isDesktop ? 'Save a copy…' : 'Download'}
          </button>
          <button className="btn" onClick={close}>
            <RotateCcw size={16} /> Record another take
          </button>
          <button className="btn danger" onClick={remove}>
            <Trash size={16} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReviewDialog() {
  const id = useStore((s) => s.reviewId);
  const video = useStore((s) => s.videos.find((v) => v.id === id));
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useStore.setState({ reviewId: null });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);
  if (!video) return null;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && useStore.setState({ reviewId: null })}>
      <div className="modal review-modal" role="dialog" aria-label="Review recording">
        <Review key={video.id} video={video} />
      </div>
    </div>
  );
}
