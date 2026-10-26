// Pre-rendered soft shadows and glows. Canvas shadowBlur costs ~100× a plain fill, and it was
// being paid for every card, glow and dot on every frame; these are blurred once and reused.

const cache = new Map<string, { img: HTMLCanvasElement; pad: number }>();

/**
 * A blurred copy of the outline drawn by `outline` (in a w×h box at 0,0), in `color`.
 * Draw it at (x - pad, y - pad) under the same transform as the shape.
 */
export function blurSprite(key: string, w: number, h: number, blur: number, color: string, outline: (ctx: CanvasRenderingContext2D) => void) {
  const k = `${key}|${Math.round(w)}x${Math.round(h)}|${blur}|${color}`;
  let s = cache.get(k);
  if (!s) {
    const pad = Math.ceil(blur * 1.5);
    const c = document.createElement('canvas');
    c.width = Math.ceil(w + pad * 2);
    c.height = Math.ceil(h + pad * 2);
    const ctx = c.getContext('2d')!;
    ctx.filter = `blur(${blur / 2}px)`;
    ctx.translate(pad, pad);
    ctx.beginPath();
    outline(ctx);
    ctx.fillStyle = color;
    ctx.fill();
    s = { img: c, pad };
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(k, s);
  }
  return s;
}

/** A round glowing dot (for data flowing along arrows and the laser pointer). */
export function glowDot(color: string, r: number) {
  return blurSprite(`dot${r}`, r * 2, r * 2, r * 2.4, color, (ctx) => ctx.arc(r, r, r, 0, Math.PI * 2)).img;
}
