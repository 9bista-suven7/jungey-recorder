// Recording flow: countdown → record → pause/resume → stop → save → review.
import { actions, useStore } from '../store';
import { compositor } from './compositor';
import { media } from './media';
import { StreamRecorder } from './recorder';
import { bridge } from '../platform';
import { closePresenter, openPresenter, shareScreen } from '../desk/present';
import { useDesk } from '../desk/state';
import { useDiagramUI } from '../diagram/ui';

let recorder: StreamRecorder | null = null;
let frameStream: MediaStream | null = null;
let countdownTimer: number | undefined;

export const getElapsed = () => recorder?.elapsed ?? 0;

const set = useStore.setState;

export async function startRecording() {
  const s = useStore.getState();
  if (s.rec !== 'idle' || !s.project) return;
  if (typeof MediaRecorder === 'undefined') {
    actions.toast('Recording is not supported here.', 'error');
    return;
  }
  actions.commitText();
  void media.resumeAudio();
  if (s.project.settings.layout === 'screen-cam') {
    // Pick what to share, then straight into the countdown.
    if (s.screen !== 'on' && !(await shareScreen())) return;
    if (useStore.getState().rec !== 'idle') return;
    await openPresenter();
  }
  if (!s.countdown) return begin();
  let n = 3;
  set({ rec: 'countdown', countdownN: n });
  const step = () => {
    if (useStore.getState().rec !== 'countdown') return;
    n -= 1;
    if (n <= 0) return void begin();
    set({ countdownN: n });
    countdownTimer = window.setTimeout(step, 1000);
  };
  countdownTimer = window.setTimeout(step, 1000);
}

async function begin() {
  clearTimeout(countdownTimer);
  const s = useStore.getState();
  frameStream = compositor.canvas.captureStream(30);
  const stream = new MediaStream([...frameStream.getVideoTracks(), ...media.audioStream().getAudioTracks()]);
  recorder = new StreamRecorder();
  try {
    await recorder.start(stream);
  } catch (err) {
    console.error(err);
    recorder = null;
    frameStream.getTracks().forEach((t) => t.stop());
    set({ rec: 'idle' });
    closePresenter();
    actions.toast('Could not start recording.', 'error');
    return;
  }
  set({ rec: 'recording', promptPlaying: s.teleprompter && s.autoScroll ? true : s.promptPlaying });
  // Diagrams start hidden and reveal as you press →.
  useDiagramUI.setState({ selected: [], hover: null, editing: null, ordering: null });
  if (!s.presenting && s.project?.pages.some((pg) => pg.nodes?.length) && (s.project.settings.reveal ?? true)) actions.startPresenting();
  if (useStore.getState().presenting) actions.toast('Recording. Press → to play the next step.');
}

export function cancelCountdown() {
  clearTimeout(countdownTimer);
  set({ rec: 'idle' });
  // While presenting your screen, stay there; otherwise put the controls away.
  if (!useDesk.getState().on) closePresenter();
}

export function togglePause() {
  const s = useStore.getState();
  if (!recorder) return;
  if (s.rec === 'recording') {
    recorder.pause();
    set({ rec: 'paused', promptPlaying: false });
  } else if (s.rec === 'paused') {
    recorder.resume();
    set({ rec: 'recording', promptPlaying: s.teleprompter && s.autoScroll });
  }
}

function thumbnail(c: HTMLCanvasElement) {
  const t = document.createElement('canvas');
  t.width = 480;
  t.height = Math.round((480 * c.height) / c.width);
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.82);
}

export async function stopRecording() {
  const s = useStore.getState();
  if (!recorder || (s.rec !== 'recording' && s.rec !== 'paused')) return;
  const rec = recorder;
  recorder = null;
  set({ rec: 'saving', saveProgress: 0, promptPlaying: false });
  const thumb = thumbnail(compositor.canvas);
  const off = bridge.onProgress((p) => p.id === rec.id && set({ saveProgress: p.progress }));
  try {
    const durationMs = await rec.stop();
    // Only now: the last frames should still show your screen and drawings, not this window coming back.
    closePresenter();
    frameStream?.getTracks().forEach((t) => t.stop());
    const takes = useStore.getState().videos.filter((v) => v.projectId === s.project?.id).length;
    const video = await bridge.rec.finish(rec.id, {
      title: `${s.project?.title ?? 'Recording'} · Take ${takes + 1}`,
      createdAt: Date.now(),
      durationMs: Math.round(durationMs),
      width: compositor.W,
      height: compositor.H,
      thumb,
      projectId: s.project?.id,
    });
    set((st) => ({ rec: 'idle', videos: [video, ...st.videos], reviewId: video.id }));
    actions.stopPresenting();
  } catch (err) {
    console.error(err);
    set({ rec: 'idle' });
    actions.toast('Saving the recording failed. It will be recovered next time you open the app.', 'error');
  } finally {
    closePresenter();
    off();
    frameStream = null;
  }
}

export const isRecording = () => {
  const r = useStore.getState().rec;
  return r === 'recording' || r === 'paused' || r === 'saving';
};
