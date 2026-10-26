import { useEffect } from 'react';
import { actions, SHAPES, useStore } from '../store';
import { BOARD_STYLES } from '../lib/boards';
import { isTypingTarget } from '../lib/util';
import { keys } from '../engine/input';
import { media } from '../engine/media';
import { importFiles, isImportable } from '../engine/importer';
import { cancelCountdown, isRecording, startRecording, stopRecording, togglePause } from '../engine/session';
import { TopBar } from './TopBar';
import { ToolDock } from './ToolDock';
import { Stage } from './Stage';
import { PagesBar } from './PagesBar';
import { LibraryPanel } from './LibraryPanel';
import { TemplatePicker } from './TemplatePicker';
import { ChartEditor } from './ChartEditor';
import { clearSelection, useDiagramUI } from '../diagram/ui';
import { copySelection, deleteSelection, duplicateSelection, editNode, nudge, paste as pasteDiagram, selectAll } from '../diagram/interact';

export function toggleRecord() {
  const rec = useStore.getState().rec;
  if (rec === 'idle') void startRecording();
  else if (rec === 'countdown') cancelCountdown();
  else void stopRecording();
}

function useShortcuts() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.altKey) return;
      const s = useStore.getState();
      if (s.reviewId || s.helpOpen || useDiagramUI.getState().templatesOpen || useDiagramUI.getState().chartEditing) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const ui = useDiagramUI.getState();
      const selecting = s.tool === 'select' && ui.selected.length > 0;
      if (e.key === ' ') {
        e.preventDefault();
        if (!keys.space) {
          keys.space = true;
          document.body.classList.add('space-pan');
        }
        return;
      }
      if (mod) {
        if (k === 'z') (e.preventDefault(), e.shiftKey ? actions.redo() : actions.undo());
        else if (k === 'y') (e.preventDefault(), actions.redo());
        else if (k === 'd' && selecting) (e.preventDefault(), duplicateSelection());
        else if (k === 'c' && selecting) copySelection();
        else if (k === 'v' && s.tool === 'select' && pasteDiagram()) e.preventDefault();
        else if (k === 'a' && s.tool === 'select') (e.preventDefault(), selectAll());
        return;
      }
      // Presenting: → / ← (and clicker keys) move through steps, then pages.
      if (s.presenting && ['arrowright', 'pagedown', 'enter', 'arrowdown'].includes(k)) return void (e.preventDefault(), actions.nextStep());
      if (s.presenting && ['arrowleft', 'pageup', 'arrowup'].includes(k)) return void (e.preventDefault(), actions.prevStep());
      if (s.presenting && k === 'escape' && s.rec === 'idle') return void actions.stopPresenting();
      if (selecting) {
        const big = e.shiftKey ? 50 : 10;
        const moves: Record<string, [number, number]> = { arrowleft: [-big, 0], arrowright: [big, 0], arrowup: [0, -big], arrowdown: [0, big] };
        if (moves[k]) return void (e.preventDefault(), nudge(...moves[k]));
        if (k === 'delete' || k === 'backspace') return void (e.preventDefault(), deleteSelection());
        if (k === 'enter' && ui.selected.length === 1) return void (e.preventDefault(), editNode(ui.selected[0]));
      }
      if (k === 'escape') {
        if (ui.ordering !== null) return void useDiagramUI.setState({ ordering: null });
        if (ui.selected.length) return clearSelection();
      }
      const project = s.project!;
      switch (e.key === '?' ? '?' : k) {
        case 'v': actions.setTool('select'); break;
        case 'a': useDiagramUI.setState({ panel: ui.panel ? null : 'add' }); break;
        case 'p': actions.setTool('pen'); break;
        case 'h': actions.setTool('highlighter'); break;
        case 'e': actions.setTool('eraser'); break;
        case 't': actions.setTool('text'); break;
        case 'l': actions.setTool('laser'); break;
        case 's': actions.setShape(s.tool === 'shape' ? SHAPES[(SHAPES.indexOf(s.shape) + 1) % SHAPES.length] : s.shape); break;
        case 'r': toggleRecord(); break;
        case 'k': togglePause(); break;
        case 'c': s.cam === 'on' ? media.stopCamera() : void media.startCamera(); break;
        case 'n': actions.addPage(); break;
        case 'arrowright': case 'pagedown': actions.goToPage(s.pageIndex + 1); break;
        case 'arrowleft': case 'pageup': actions.goToPage(s.pageIndex - 1); break;
        case '[': actions.setSize(s.sizeIndex - 1); break;
        case ']': actions.setSize(s.sizeIndex + 1); break;
        case 'b': {
          const i = BOARD_STYLES.findIndex((b) => b.id === project.settings.boardStyle);
          actions.updateSettings({ boardStyle: BOARD_STYLES[(i + 1) % BOARD_STYLES.length].id });
          break;
        }
        case '?': useStore.setState({ helpOpen: true }); break;
        default:
          if (/^[1-6]$/.test(k)) actions.setColor(Number(k) - 1);
          else return;
      }
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        keys.space = false;
        document.body.classList.remove('space-pan');
        if (!isTypingTarget(e)) e.preventDefault();
      }
    };
    const paste = (e: ClipboardEvent) => {
      if (isTypingTarget(e)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(isImportable);
      if (files.length) {
        e.preventDefault();
        void importFiles(files);
      }
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording()) e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('paste', paste);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('paste', paste);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
}

export function Studio() {
  useShortcuts();
  useEffect(() => {
    void media.startCamAndMic();
    return () => media.stopEverything();
  }, []);
  // Selection belongs to the Select tool and the current page.
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if ((s.tool !== prev.tool && s.tool !== 'select') || s.pageIndex !== prev.pageIndex || s.project?.id !== prev.project?.id) {
          useDiagramUI.setState({ selected: [], hover: null, editing: null });
        }
      }),
    [],
  );
  return (
    <div className="studio">
      <TopBar />
      <div className="studio-main">
        <ToolDock />
        <Stage />
        <LibraryPanel />
      </div>
      <PagesBar />
      <TemplatePicker />
      <ChartEditor />
    </div>
  );
}
