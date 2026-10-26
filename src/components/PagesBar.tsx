import { useEffect, useRef } from 'react';
import { FileUp, Keyboard, Plus, X } from 'lucide-react';
import { actions, useStore } from '../store';
import { importFiles } from '../engine/importer';
import { pickFiles } from '../lib/util';
import { PageThumb } from './ui';

export function PagesBar() {
  const pages = useStore((s) => s.project!.pages);
  const styleId = useStore((s) => s.project!.settings.boardStyle);
  const aspect = useStore((s) => s.project!.settings.aspect);
  const index = useStore((s) => s.pageIndex);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [index]);

  const remove = (i: number) => {
    const p = pages[i];
    if ((p.items.length || p.bg) && !confirm(`Delete page ${i + 1}?`)) return;
    actions.deletePage(i);
  };

  return (
    <footer className="pages-bar">
      <div className="pages-scroll">
        {pages.map((p, i) => (
          <button
            key={p.id}
            ref={i === index ? activeRef : undefined}
            className={`page ${i === index ? 'on' : ''}`}
            onClick={() => actions.goToPage(i)}
            data-tip={`Page ${i + 1} (← →)`}
          >
            <PageThumb page={p} styleId={styleId} aspect={aspect} height={aspect === '9:16' ? 64 : 52} />
            <span className="page-num">{i + 1}</span>
            {pages.length > 1 && (
              <span
                className="page-del"
                role="button"
                aria-label={`Delete page ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(i);
                }}
              >
                <X size={12} />
              </span>
            )}
          </button>
        ))}
        <button className="page add" onClick={actions.addPage} data-tip="New page (N)">
          <Plus size={18} />
        </button>
      </div>
      <div className="pages-actions">
        <button className="btn ghost" onClick={() => void pickFiles('application/pdf,image/*').then(importFiles)}>
          <FileUp size={16} /> Add PDF or images
        </button>
        <button className="icon-btn" onClick={() => useStore.setState({ helpOpen: true })} data-tip="Keyboard shortcuts (?)">
          <Keyboard size={18} />
        </button>
      </div>
    </footer>
  );
}
