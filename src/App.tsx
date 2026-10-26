import { useEffect } from 'react';
import { useStore } from './store';
import { Home } from './components/Home';
import { Studio, toggleRecord } from './components/Studio';
import { ReviewDialog } from './components/ReviewDialog';
import { LibraryDrawer, ScreenPicker, ShortcutsDialog, Toast } from './components/Overlays';
import { projectsDb } from './engine/db';
import { togglePause } from './engine/session';
import { bridge } from './platform';
import type { Project } from './types';

/** Boards save themselves a moment after every change. */
function useAutosave() {
  useEffect(() => {
    let timer: number | undefined;
    let pending: Project | null = null;
    const flush = () => {
      clearTimeout(timer);
      if (pending) void projectsDb.put(pending).catch((e) => console.error('autosave', e));
      pending = null;
    };
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project && s.project !== prev.project) {
        pending = s.project;
        clearTimeout(timer);
        timer = window.setTimeout(flush, 800);
      }
      if (s.screenView === 'home' && prev.screenView === 'studio') {
        flush();
        void projectsDb.all().then((projects) => useStore.setState({ projects }));
      }
    });
    window.addEventListener('beforeunload', flush);
    return () => {
      unsub();
      window.removeEventListener('beforeunload', flush);
    };
  }, []);
}

export default function App() {
  const view = useStore((s) => s.screenView);
  useAutosave();

  useEffect(() => {
    void bridge.videos.list().then((videos) => useStore.setState({ videos }));
    return bridge.onShortcut((name) => {
      if (useStore.getState().screenView !== 'studio') return;
      if (name === 'record') toggleRecord();
      else togglePause();
    });
  }, []);

  return (
    <>
      {view === 'home' ? <Home /> : <Studio />}
      <LibraryDrawer />
      <ReviewDialog />
      <ScreenPicker />
      <ShortcutsDialog />
      <Toast />
    </>
  );
}
