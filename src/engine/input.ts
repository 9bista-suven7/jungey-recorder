// Pointer input on the stage canvas: drawing, shapes, eraser, laser, text placement, pan and zoom.
import { actions, activeColor, currentPage, SIZES, useStore } from '../store';
import { compositor } from './compositor';
import { toWorld, zoomAt } from './layout';
import { constrainShape, hitItem } from './items';
import { uid } from '../lib/util';
import type { ShapeItem, StrokeItem, TextItem } from '../types';
import { selectDoubleClick, selectDown, selectHover, selectMove, selectUp } from '../diagram/interact';

/** Held keys that change what the pointer does. */
export const keys = { space: false };

type Mode = 'draw' | 'shape' | 'erase' | 'laser' | 'pan' | 'text' | 'select' | null;

export function attachStageInput(canvas: HTMLCanvasElement) {
  let mode: Mode = null;
  let pid = -1;
  let penSeen = false;
  let pan = { x: 0, y: 0, vx: 0, vy: 0 };
  let textAt = { x: 0, y: 0 };

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
  };
  const toPage = (e: { clientX: number; clientY: number }) => {
    const p = toCanvas(e);
    return toWorld(compositor.xform, p.x, p.y);
  };
  const pressure = (e: PointerEvent) => (e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 0.5);
  const events = (e: PointerEvent) => {
    const list = e.getCoalescedEvents?.() ?? [];
    return list.length ? list : [e];
  };

  let lastErase: { x: number; y: number } | null = null;

  /** Erase along the path since the last event, so a quick swipe can't skip over a stroke. */
  function eraseTo(e: { clientX: number; clientY: number }) {
    const page = currentPage();
    if (!page) return;
    const to = toPage(e);
    const from = lastErase ?? to;
    lastErase = to;
    const r = SIZES.eraser[useStore.getState().sizeIndex] / 2 / compositor.xform.scale;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (r * 0.75)));
    let hit = false;
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      for (const it of page.items) {
        if (!compositor.erasing.has(it.id) && hitItem(it, x, y, r)) {
          compositor.erasing.add(it.id);
          hit = true;
        }
      }
    }
    if (hit) compositor.erasingVersion++;
  }

  const down = (e: PointerEvent) => {
    if (mode) return;
    if (e.pointerType === 'pen') penSeen = true;
    if (penSeen && e.pointerType === 'touch') return; // palm rejection once a stylus has been used
    if (e.button !== 0 && e.button !== 1) return;
    const s = useStore.getState();
    if (!s.project) return;
    if (s.textDraft) {
      actions.commitText();
      if (s.tool === 'text') return; // first click just finishes the text
    }
    const tool = keys.space || e.button === 1 ? 'hand' : s.tool;
    const w = toPage(e);
    compositor.fast = true;
    // Sizes are what you see on screen, whatever the layout or zoom.
    const k = 1 / compositor.xform.scale;
    canvas.setPointerCapture(e.pointerId);
    pid = e.pointerId;

    switch (tool) {
      case 'select':
        // While presenting, a click just moves on to the next step.
        if (s.presenting) {
          canvas.releasePointerCapture(e.pointerId);
          pid = -1;
          compositor.fast = false;
          actions.nextStep();
          return;
        }
        mode = 'select';
        selectDown(w, e.shiftKey);
        break;
      case 'pen':
      case 'highlighter': {
        mode = 'draw';
        const stroke: StrokeItem = {
          id: uid(), kind: 'stroke', pen: tool, color: activeColor(s), size: SIZES[tool][s.sizeIndex] * k,
          points: [w.x, w.y, pressure(e)], pressure: e.pointerType === 'pen',
        };
        compositor.live = stroke;
        break;
      }
      case 'shape': {
        mode = 'shape';
        const shape: ShapeItem = { id: uid(), kind: 'shape', shape: s.shape, color: activeColor(s), size: SIZES.shape[s.sizeIndex] * k, x1: w.x, y1: w.y, x2: w.x, y2: w.y };
        compositor.live = shape;
        break;
      }
      case 'eraser':
        mode = 'erase';
        lastErase = null;
        eraseTo(e);
        break;
      case 'laser': {
        mode = 'laser';
        const p = toCanvas(e);
        compositor.addLaser(p.x, p.y);
        break;
      }
      case 'hand': {
        mode = 'pan';
        const p = toCanvas(e);
        const v = currentPage(s)!.view;
        pan = { x: p.x, y: p.y, vx: v.x, vy: v.y };
        canvas.classList.add('panning');
        break;
      }
      case 'text':
        mode = 'text';
        textAt = w;
        break;
    }
  };

  const move = (e: PointerEvent) => {
    const s = useStore.getState();
    if (!mode) {
      // The laser follows the mouse even without pressing.
      if (s.tool === 'laser' && e.pointerType === 'mouse' && !keys.space) {
        const p = toCanvas(e);
        compositor.addLaser(p.x, p.y);
      }
      if (s.tool === 'select' && !s.presenting && e.pointerType !== 'touch') selectHover(toPage(e));
      return;
    }
    if (e.pointerId !== pid) return;
    switch (mode) {
      case 'select':
        selectMove(toPage(e), e.shiftKey);
        break;
      case 'draw': {
        const live = compositor.live as StrokeItem;
        const minGap = 0.6 / compositor.xform.scale;
        for (const ev of events(e)) {
          const w = toPage(ev);
          const n = live.points.length;
          if (Math.hypot(w.x - live.points[n - 3], w.y - live.points[n - 2]) < minGap) continue;
          live.points.push(w.x, w.y, pressure(ev));
        }
        break;
      }
      case 'shape': {
        const live = compositor.live as ShapeItem;
        let w = toPage(e);
        if (e.shiftKey) w = constrainShape(live, w.x, w.y);
        compositor.live = { ...live, x2: w.x, y2: w.y };
        break;
      }
      case 'erase':
        for (const ev of events(e)) eraseTo(ev);
        break;
      case 'laser':
        for (const ev of events(e)) {
          const p = toCanvas(ev);
          compositor.addLaser(p.x, p.y);
        }
        break;
      case 'pan': {
        const p = toCanvas(e);
        const page = currentPage(s)!;
        const k = compositor.xform.scale;
        actions.setView({ ...page.view, x: pan.vx - (p.x - pan.x) / k, y: pan.vy - (p.y - pan.y) / k });
        break;
      }
    }
  };

  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId !== pid) return;
    const s = useStore.getState();
    switch (mode) {
      case 'select':
        selectUp(toPage(e), cancelled);
        break;
      case 'draw':
        if (!cancelled && compositor.live) actions.addItem(compositor.live);
        compositor.live = null;
        break;
      case 'shape': {
        const l = compositor.live as ShapeItem | null;
        if (!cancelled && l && Math.hypot(l.x2 - l.x1, l.y2 - l.y1) * compositor.xform.scale > 6) actions.addItem(l);
        compositor.live = null;
        break;
      }
      case 'erase':
        if (!cancelled) actions.removeItems(new Set(compositor.erasing));
        compositor.erasing.clear();
        compositor.erasingVersion++;
        break;
      case 'pan':
        canvas.classList.remove('panning');
        break;
      case 'text': {
        if (cancelled) break;
        const page = currentPage(s);
        const hit = page?.items.findLast((it) => it.kind === 'text' && hitItem(it, textAt.x, textAt.y, 4)) as TextItem | undefined;
        const size = SIZES.text[s.sizeIndex] / compositor.xform.scale;
        actions.startText(
          hit
            ? { x: hit.x, y: hit.y, text: hit.text, color: hit.color, size: hit.size, replaceId: hit.id }
            : { x: textAt.x, y: textAt.y - size * 0.6, text: '', color: activeColor(s), size },
        );
        break;
      }
    }
    mode = null;
    pid = -1;
    compositor.fast = false;
  };

  const up = (e: PointerEvent) => finish(e, false);
  const cancel = (e: PointerEvent) => finish(e, true);

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const page = currentPage();
    const L = compositor.layout;
    if (!page || !L) return;
    const p = toCanvas(e);
    const r = canvas.getBoundingClientRect();
    const k = (canvas.width / r.width) * (e.deltaMode === 1 ? 32 : 1);
    if (e.ctrlKey || e.metaKey) {
      actions.setView(zoomAt(page.view, L.region, compositor.W, compositor.H, p.x, p.y, Math.exp(-e.deltaY * 0.0025)));
    } else {
      const sc = compositor.xform.scale;
      actions.setView({ ...page.view, x: page.view.x + (e.deltaX * k) / sc, y: page.view.y + (e.deltaY * k) / sc });
    }
  };

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  const dblclick = (e: MouseEvent) => {
    const s = useStore.getState();
    if (s.tool === 'select' && !s.presenting) selectDoubleClick(toPage(e));
  };

  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('dblclick', dblclick);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return () => {
    canvas.removeEventListener('dblclick', dblclick);
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('wheel', wheel);
  };
}
