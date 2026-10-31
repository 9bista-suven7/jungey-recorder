// Runs the scroll tracker off the main thread, so following the page never slows the recording.
import { ScrollTracker, type Rect } from './track';

const tracker = new ScrollTracker();

self.onmessage = (e: MessageEvent<{ reset?: boolean; frame?: ImageBitmap; screenW: number; screenH: number; region: Rect }>) => {
  const m = e.data;
  if (m.reset) {
    tracker.reset();
    return;
  }
  if (!m.frame) return;
  const shift = tracker.update(m.frame, m.screenW, m.screenH, m.region);
  m.frame.close();
  self.postMessage({ shift, last: tracker.last });
};
