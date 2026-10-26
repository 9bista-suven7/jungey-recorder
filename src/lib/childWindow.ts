// Small always-on-top windows (recording controls, the ink layer over a shared screen, the face
// bubble) are child windows of this page, rendered by this same React app, so they share its state.
// The main process gives each one its look and place by name.
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

const open = new Map<string, { win: Window; root: Root }>();

function copyStyles(doc: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = doc.createElement('style');
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      doc.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        doc.head.appendChild(link);
      }
    }
  }
}

export interface ChildOptions {
  title: string;
  /** Window size and place, as window.open features ("left=0,top=0,width=200,height=200"). */
  features?: string;
  /** Use the app's own styles (controls), or just this CSS (see-through windows). */
  copyStyles?: boolean;
  css?: string;
  bodyClass?: string;
}

export function openChild(name: string, node: ReactNode, opts: ChildOptions): Window | null {
  const cur = open.get(name);
  if (cur && !cur.win.closed) return cur.win;
  const w = window.open('', name, opts.features ?? '');
  if (!w) return null;
  const doc = w.document;
  doc.title = opts.title;
  if (opts.copyStyles) copyStyles(doc);
  if (opts.css) {
    const style = doc.createElement('style');
    style.textContent = opts.css;
    doc.head.appendChild(style);
  }
  if (opts.bodyClass) doc.body.className = opts.bodyClass;
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const root = createRoot(host);
  root.render(node);
  open.set(name, { win: w, root });
  w.addEventListener('pagehide', () => {
    root.unmount();
    if (open.get(name)?.win === w) open.delete(name);
  });
  return w;
}

export function closeChild(name: string) {
  const c = open.get(name);
  if (!c) return;
  open.delete(name);
  c.root.unmount();
  c.win.close();
}

export const childWindow = (name: string) => {
  const c = open.get(name);
  return c && !c.win.closed ? c.win : null;
};
