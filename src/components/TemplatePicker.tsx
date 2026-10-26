// Pick a ready-made diagram. One click puts it on the board with its steps already set.
import { useMemo } from 'react';
import { X } from 'lucide-react';
import { actions, currentPage, useStore, blankPage } from '../store';
import { useDiagramUI } from '../diagram/ui';
import { TEMPLATES, type Template } from '../diagram/templates';
import { boundsOf } from '../diagram/geometry';
import { compositor } from '../engine/compositor';
import { fitView } from '../engine/layout';
import { PageThumb } from './ui';

export function insertTemplate(t: Template) {
  const page = currentPage();
  if (!page) return;
  const { nodes, edges } = t.build();
  if (page.items.length || page.nodes?.length || page.bg) actions.addPage();
  actions.setDiagram(nodes, edges);
  // Templates are laid out for 16:9; on other sizes, fit them in.
  const R = compositor.layout?.region, b = boundsOf(nodes);
  if (R && b && (b.x < 0 || b.y < 0 || b.x + b.w > compositor.W || b.y + b.h > compositor.H)) {
    actions.setView(fitView(b, R, compositor.W, compositor.H, 60, 1));
  } else actions.resetView();
  useStore.setState({ tool: 'select' });
  useDiagramUI.setState({ templatesOpen: false, selected: [], panel: 'add' });
  actions.toast('Ready. Press Record, then → to reveal each step.');
}

export function TemplatePicker() {
  const open = useDiagramUI((s) => s.templatesOpen);
  const settings = useStore((s) => s.project?.settings);
  const previews = useMemo(() => TEMPLATES.map((t) => ({ t, page: { ...blankPage(), ...t.build() } })), []);
  if (!open || !settings) return null;
  const close = () => useDiagramUI.setState({ templatesOpen: false });
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal templates" role="dialog" aria-label="Templates">
        <div className="picker-head">
          <h2>Start from a template</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="template-grid">
          <button className="template-card blank" onClick={close}>
            <div className="template-blank">+</div>
            <b>Blank</b>
            <small>Build your own from the library</small>
          </button>
          {previews.map(({ t, page }) => (
            <button key={t.id} className="template-card" onClick={() => insertTemplate(t)}>
              <PageThumb page={page} styleId={settings.boardStyle} aspect="16:9" height={130} />
              <b>{t.title}</b>
              <small>{t.blurb}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
