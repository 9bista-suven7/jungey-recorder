// Trimming: ffmpeg in the main process when available (fast, exact). Otherwise the clip is
// played back in real time and re-recorded, which works everywhere but takes as long as the clip.
import { bridge, mediaUrl } from '../platform';
import { StreamRecorder } from './recorder';
import type { VideoMeta } from '../types';

const once = (el: EventTarget, ev: string) => new Promise((r) => el.addEventListener(ev, r, { once: true }));

async function trimByPlayback(v: VideoMeta, start: number, end: number, title: string, onProgress: (p: number) => void) {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.src = mediaUrl(v);
  video.preload = 'auto';
  await once(video, 'loadedmetadata');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || v.width || 1920;
  canvas.height = video.videoHeight || v.height || 1080;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  ac.createMediaElementSource(video).connect(dest);
  await ac.resume();

  video.currentTime = start;
  await once(video, 'seeked');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const frames = canvas.captureStream(30);
  const rec = new StreamRecorder();
  await rec.start(new MediaStream([...frames.getVideoTracks(), ...dest.stream.getAudioTracks()]));
  await new Promise<void>((resolve) => {
    const draw = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress(Math.min(1, (video.currentTime - start) / (end - start)));
      if (video.currentTime >= end || video.ended) return resolve();
      video.requestVideoFrameCallback(draw);
    };
    video.requestVideoFrameCallback(draw);
    video.addEventListener('ended', () => resolve(), { once: true });
    void video.play();
  });
  video.pause();
  const durationMs = await rec.stop();
  frames.getTracks().forEach((t) => t.stop());
  void ac.close();
  return bridge.rec.finish(rec.id, { ...v, title, createdAt: Date.now(), durationMs: Math.round(durationMs) });
}

export async function trimVideo(v: VideoMeta, start: number, end: number, onProgress: (p: number) => void): Promise<VideoMeta> {
  const title = `${v.title} (trimmed)`;
  const info = await bridge.info();
  if (info.hasFfmpeg) {
    const off = bridge.onProgress((p) => p.id === `trim-${v.id}` && onProgress(p.progress));
    try {
      return await bridge.videos.trim({ id: v.id, start, end, title });
    } finally {
      off();
    }
  }
  return trimByPlayback(v, start, end, title, onProgress);
}
