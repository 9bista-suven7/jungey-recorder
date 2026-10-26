// Turn PDFs and images into page backgrounds.
import type { PageImage } from '../types';
import { actions } from '../store';

const MAX_SIDE = 2000;
const MAX_PDF_PAGES = 120;

function canvasToPage(c: HTMLCanvasElement): PageImage {
  return { src: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
}

async function imageToPage(file: File): Promise<PageImage> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  if (file.type === 'image/png') return { src: c.toDataURL('image/png'), w: c.width, h: c.height };
  return canvasToPage(c);
}

async function pdfToPages(file: File, onPage: (n: number, total: number) => void): Promise<PageImage[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const total = Math.min(doc.numPages, MAX_PDF_PAGES);
  const out: PageImage[] = [];
  for (let i = 1; i <= total; i++) {
    onPage(i, total);
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) });
    const c = document.createElement('canvas');
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    await page.render({ canvas: c, viewport, background: '#ffffff' }).promise;
    out.push(canvasToPage(c));
    page.cleanup();
  }
  await task.destroy();
  return out;
}

export const isImportable = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || f.type.startsWith('image/');

export async function importFiles(files: File[]) {
  const usable = files.filter(isImportable);
  if (!usable.length) {
    if (files.length) actions.toast('Only PDFs and images can be added to the board.', 'error');
    return;
  }
  const pages: PageImage[] = [];
  try {
    for (const f of usable) {
      if (f.type.startsWith('image/')) pages.push(await imageToPage(f));
      else pages.push(...(await pdfToPages(f, (n, total) => n % 5 === 1 && actions.toast(`Opening ${f.name}: page ${n} of ${total}`))));
    }
  } catch (err) {
    console.error(err);
    actions.toast('That file could not be opened.', 'error');
  }
  if (pages.length) {
    actions.addImagePages(pages);
    actions.toast(pages.length === 1 ? 'Added to the board.' : `Added ${pages.length} pages.`);
  }
}
