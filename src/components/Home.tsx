import { useEffect } from 'react';
import { FolderOpen, Trash, ArrowRight } from 'lucide-react';
import { actions, useStore } from '../store';
import { PRESETS, type Preset } from '../presets';
import { PresetArt } from './PresetArt';
import { Logo } from './icons';
import { PageThumb, VideoCard } from './ui';
import { media } from '../engine/media';
import { importFiles } from '../engine/importer';
import { projectsDb } from '../engine/db';
import { bridge, isDesktop } from '../platform';
import { pickFiles, timeAgo } from '../lib/util';
import { useDiagramUI } from '../diagram/ui';

function start(preset: Preset) {
  // Anything that needs the click (screen picker, file picker) starts before the studio opens.
  if (preset.action === 'screen') void media.startScreen();
  if (preset.action === 'import') {
    void pickFiles('application/pdf,image/*').then(importFiles);
  }
  actions.newProject(preset);
  if (preset.action === 'flow') useDiagramUI.setState({ templatesOpen: true, panel: 'add' });
}

export function Home() {
  const projects = useStore((s) => s.projects);
  const videos = useStore((s) => s.videos);

  useEffect(() => {
    projectsDb.all().then((projects) => useStore.setState({ projects })).catch(() => {});
  }, []);

  const removeProject = async (id: string, title: string) => {
    if (!confirm(`Delete the board "${title}"? Your recorded videos are kept.`)) return;
    await projectsDb.remove(id);
    useStore.setState((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  };

  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <Logo size={32} />
          <span>
            Jungey <b>Recorder</b>
          </span>
        </div>
        {isDesktop && (
          <button className="btn ghost" onClick={() => bridge.videos.openFolder()}>
            <FolderOpen size={16} /> Videos folder
          </button>
        )}
      </header>

      <section className="home-hero">
        <h1>What do you want to make?</h1>
        <p>Pick one and you're ready to record: board, camera and mic are set up for you.</p>
      </section>

      <section className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p.id} className="preset-card" onClick={() => start(p)}>
            <div className="preset-art">
              <PresetArt id={p.id} />
            </div>
            <div className="preset-text">
              <div className="preset-title">
                {p.title} <ArrowRight size={16} className="preset-go" />
              </div>
              <div className="preset-blurb">{p.blurb}</div>
            </div>
          </button>
        ))}
      </section>

      {projects.length > 0 && (
        <section className="home-section">
          <h2>Continue a board</h2>
          <div className="board-row">
            {projects.slice(0, 12).map((p) => (
              <div key={p.id} className="board-card">
                <button className="board-open" onClick={() => actions.openProject(p)}>
                  <PageThumb page={p.pages[0]} styleId={p.settings.boardStyle} aspect={p.settings.aspect} height={96} />
                  <div className="board-meta">
                    <div className="board-title">{p.title}</div>
                    <div className="board-sub">
                      {p.pages.length} {p.pages.length === 1 ? 'page' : 'pages'} · {timeAgo(p.updatedAt)}
                    </div>
                  </div>
                </button>
                <button className="icon-btn small board-del" title="Delete board" onClick={() => removeProject(p.id, p.title)}>
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="home-section">
          <h2>Your videos</h2>
          <div className="video-grid">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} onOpen={() => useStore.setState({ reviewId: v.id })} />
            ))}
          </div>
        </section>
      )}

      <footer className="home-foot">Everything stays on this computer. Nothing is uploaded.</footer>
    </div>
  );
}
