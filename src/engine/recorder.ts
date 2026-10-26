// MediaRecorder wrapper that streams each chunk straight to disk, so long recordings
// never pile up in memory and a crash still leaves the video on disk.
import { bridge } from '../platform';
import { uid } from '../lib/util';

const CANDIDATES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/**
 * avc3 keeps H.264 settings inside the stream, so it survives the encoder restarting mid-recording.
 * Only use it when ffmpeg will rewrite the file as a standard avc1 MP4 afterwards.
 */
export function pickMime(inband: boolean) {
  const list = inband ? ['video/mp4;codecs=avc3,opus', ...CANDIDATES] : CANDIDATES;
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export class StreamRecorder {
  readonly id = uid();
  private rec: MediaRecorder | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private failed: unknown = null;
  private startedAt = 0;
  private pausedAt = 0;
  private pausedTotal = 0;
  ext: 'mp4' | 'webm' = 'webm';

  async start(stream: MediaStream) {
    const mimeType = pickMime((await bridge.info()).hasFfmpeg);
    this.ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    await bridge.rec.begin(this.id, this.ext);
    const rec = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      // Chunks are written strictly in order.
      this.queue = this.queue
        .then(() => e.data.arrayBuffer())
        .then((buf) => bridge.rec.chunk(this.id, buf))
        .catch((err) => (this.failed = err));
    };
    this.rec = rec;
    rec.start(1000);
    this.startedAt = performance.now();
  }

  get elapsed() {
    if (!this.startedAt) return 0;
    const end = this.pausedAt || performance.now();
    return end - this.startedAt - this.pausedTotal;
  }

  pause() {
    if (this.rec?.state !== 'recording') return;
    this.rec.pause();
    this.pausedAt = performance.now();
  }

  resume() {
    if (this.rec?.state !== 'paused') return;
    this.rec.resume();
    this.pausedTotal += performance.now() - this.pausedAt;
    this.pausedAt = 0;
  }

  /** Stops and waits until every chunk is on disk. */
  async stop(): Promise<number> {
    const rec = this.rec;
    if (!rec) return 0;
    const duration = this.elapsed;
    if (rec.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        rec.addEventListener('stop', () => resolve(), { once: true });
        rec.stop();
      });
    }
    await this.queue;
    if (this.failed) throw this.failed;
    return duration;
  }

  async abort() {
    try {
      if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
      await this.queue;
    } finally {
      await bridge.rec.abort(this.id);
    }
  }
}
