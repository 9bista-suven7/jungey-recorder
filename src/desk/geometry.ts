// Where the marks are on the screen.
import type { DeskMark } from './state';
import type { Rect } from './track';

/** Bounding box of the marks, in screen px (page space plus the page's scroll offset). */
export function marksRegion(marks: DeskMark[], offset: { x: number; y: number }): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  };
  for (const m of marks) {
    if (m.kind === 'stroke') for (let i = 0; i < m.points.length; i += 3) take(m.points[i], m.points[i + 1]);
    else if (m.kind === 'shape') {
      take(m.x1, m.y1);
      take(m.x2, m.y2);
    } else {
      take(m.x - m.size / 2, m.y - m.size / 2);
      take(m.x + m.size / 2, m.y + m.size / 2);
    }
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0 + offset.x, y: y0 + offset.y, w: x1 - x0, h: y1 - y0 };
}
