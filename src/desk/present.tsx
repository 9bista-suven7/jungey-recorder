// Presenting your screen while recording ("Screen + me"): the floating controls, and when you
// share your whole screen, the ink layer over it and your face bubble on it.
import { actions, useStore } from '../store';
import { media } from '../engine/media';
import { bridge } from '../platform';
import { closeChild, openChild } from '../lib/childWindow';
import { closeMiniControls, openMiniControls } from '../components/MiniControls';
import { BUBBLE_CSS, CamBubble, bubbleFeatures } from './CamBubble';
import { INK_CSS, InkLayer } from './InkLayer';
import { useDesk } from './state';

export async function openPresenter() {
  const target = await bridge.desk?.begin().catch(() => null);
  if (target?.kind === 'screen' && target.bounds) {
    useDesk.setState({ on: true, tool: 'mouse', marks: [], nextBadge: 1, clearing: 0, camOnScreen: false });
    openChild('jungey-ink', <InkLayer />, { title: 'Jungey ink', css: INK_CSS });
    if (useStore.getState().cam === 'on' && media.camReady) {
      openChild('jungey-cam', <CamBubble />, { title: 'Jungey camera', css: BUBBLE_CSS, features: bubbleFeatures(target.bounds) });
      useDesk.setState({ camOnScreen: true });
    }
  } else if (target?.kind === 'window') {
    actions.toast('Tip: share your whole screen to draw on top of it while you record.');
  }
  openMiniControls();
}

export function closePresenter() {
  closeMiniControls();
  closeChild('jungey-ink');
  closeChild('jungey-cam');
  const was = useDesk.getState().on;
  useDesk.setState({ on: false, tool: 'mouse', marks: [], clearing: 0, camOnScreen: false });
  if (was) void bridge.desk?.end();
}
