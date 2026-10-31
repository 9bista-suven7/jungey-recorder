// Presenting your screen ("Screen + me"). Share your whole screen and this window steps aside:
// you use your computer as usual, with floating controls to draw on top of anything and to
// record. Your face bubble sits on the screen too. Sharing just a window keeps the old way:
// it shows inside the stage, and the floating controls appear only while recording.
import { actions, useStore } from '../store';
import { media } from '../engine/media';
import { bridge } from '../platform';
import { closeChild, openChild } from '../lib/childWindow';
import { closeMiniControls, openMiniControls } from '../components/MiniControls';
import { BUBBLE_CSS, CamBubble, bubbleFeatures } from './CamBubble';
import { INK_CSS, InkLayer } from './InkLayer';
import { useDesk } from './state';

/** What the captured track says about itself, for when the picker was the system's own. */
function screenHint() {
  const track = (media.screenVideo.srcObject as MediaStream | null)?.getVideoTracks()[0];
  const st = track?.getSettings() as (MediaTrackSettings & { displaySurface?: string }) | undefined;
  return { surface: st?.displaySurface, width: st?.width, height: st?.height };
}

const sameBounds = (a: { x: number; y: number; width: number; height: number } | null, b: typeof a) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Ink layer, face bubble and controls over the shared screen. Returns what is being shared. */
async function startDesk(): Promise<'screen' | 'window' | null> {
  let target = await bridge.desk?.begin(screenHint()).catch(() => null);
  const cur = useDesk.getState();
  if (cur.on) {
    // Already presenting: a different screen (or a window now) means starting over.
    if (target?.kind === 'screen' && sameBounds(cur.bounds, target.bounds)) return 'screen';
    await closePresenter();
    if (target?.kind === 'screen') target = await bridge.desk?.begin(screenHint()).catch(() => null);
  }
  if (target?.kind !== 'screen' || !target.bounds) return target?.kind ?? null;
  useDesk.setState({ on: true, tool: 'mouse', marks: [], nextBadge: 1, clearing: 0, camOnScreen: false, bounds: target.bounds, offset: { x: 0, y: 0 }, area: null });
  // Closing the layer by hand (Alt+F4 while drawing) ends presenting; the controls and bubble go with it.
  openChild('jungey-ink', <InkLayer />, { title: 'Jungey ink', css: INK_CSS, onClosed: () => void closePresenter() });
  syncBubble();
  openMiniControls();
  return 'screen';
}

/** Your face on the screen whenever the camera is on (it may start a moment after sharing). */
function syncBubble() {
  const { on, bounds, camOnScreen } = useDesk.getState();
  const want = on && !!bounds && useStore.getState().cam === 'on';
  if (want && !camOnScreen) {
    openChild('jungey-cam', <CamBubble />, {
      title: 'Jungey camera', css: BUBBLE_CSS, features: bubbleFeatures(bounds!),
      // Closed by hand: the recording draws the camera in its corner again.
      onClosed: () => useDesk.setState({ camOnScreen: false }),
    });
    useDesk.setState({ camOnScreen: true });
  } else if (!want && camOnScreen) {
    closeChild('jungey-cam');
    useDesk.setState({ camOnScreen: false });
  }
}

/** Choose what to share. A whole screen goes straight into presenting. */
export async function shareScreen() {
  const ok = await media.startScreen();
  if (ok && useStore.getState().project?.settings.layout === 'screen-cam') await startDesk();
  return ok;
}

/** Recording "Screen + me": present the shared screen, or float the controls over a shared window. */
export async function openPresenter() {
  const kind = await startDesk();
  if (kind === 'screen') return;
  if (kind === 'window') actions.toast('Tip: share your whole screen to draw on top of it while you record.');
  openMiniControls();
}

/** Back to this window: closes the floating windows (the screen stays shared). */
export async function closePresenter() {
  closeMiniControls();
  closeChild('jungey-ink');
  closeChild('jungey-cam');
  const was = useDesk.getState().on;
  useDesk.setState({ on: false, tool: 'mouse', marks: [], clearing: 0, camOnScreen: false, bounds: null });
  if (was) await bridge.desk?.end().catch(() => {});
}

// Sharing really stopped (from the system's own controls, say) while not recording: come back.
// 'pending' is just the picker opening for "Change screen", and the old share is still live.
// Deferred a tick: the store can change in the middle of a React commit (leaving the studio).
useStore.subscribe((s, prev) => {
  if (prev.screen === 'on' && s.screen === 'off' && s.rec === 'idle' && useDesk.getState().on) queueMicrotask(() => void closePresenter());
  else if (s.cam !== prev.cam) queueMicrotask(syncBubble);
});
