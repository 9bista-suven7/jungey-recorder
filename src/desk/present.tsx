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

/** Ink layer, face bubble and controls over the shared screen. Returns what is being shared. */
async function startDesk(): Promise<'screen' | 'window' | null> {
  if (useDesk.getState().on) return 'screen';
  const target = await bridge.desk?.begin().catch(() => null);
  if (target?.kind !== 'screen' || !target.bounds) return target?.kind ?? null;
  useDesk.setState({ on: true, tool: 'mouse', marks: [], nextBadge: 1, clearing: 0, camOnScreen: false, bounds: target.bounds });
  openChild('jungey-ink', <InkLayer />, { title: 'Jungey ink', css: INK_CSS });
  syncBubble();
  openMiniControls();
  return 'screen';
}

/** Your face on the screen whenever the camera is on (it may start a moment after sharing). */
function syncBubble() {
  const { on, bounds, camOnScreen } = useDesk.getState();
  const want = on && !!bounds && useStore.getState().cam === 'on';
  if (want && !camOnScreen) {
    openChild('jungey-cam', <CamBubble />, { title: 'Jungey camera', css: BUBBLE_CSS, features: bubbleFeatures(bounds!) });
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
export function closePresenter() {
  closeMiniControls();
  closeChild('jungey-ink');
  closeChild('jungey-cam');
  const was = useDesk.getState().on;
  useDesk.setState({ on: false, tool: 'mouse', marks: [], clearing: 0, camOnScreen: false, bounds: null });
  if (was) void bridge.desk?.end();
}

// Sharing stopped (from the system's own controls, say) while not recording: come back.
useStore.subscribe((s, prev) => {
  if (prev.screen === 'on' && s.screen !== 'on' && s.rec === 'idle' && useDesk.getState().on) closePresenter();
  else if (s.cam !== prev.cam) syncBubble();
});
