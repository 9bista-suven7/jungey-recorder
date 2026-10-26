// Procedural textures: chalk grain for ink, dust and vignette for boards. Seeded so they never shimmer.
import type { BoardStyle } from '../lib/boards';

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alpha speckles; used with destination-out to knock holes in chalk strokes. */
export function makeGrain(): HTMLCanvasElement {
  const size = 224;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rand = rng(11);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = rand();
    const a = r > 0.55 ? (r - 0.55) / 0.45 : 0;
    img.data[i + 3] = Math.round(a * a * 235);
  }
  ctx.putImageData(img, 0, 0);
  // A few fine horizontal drag marks, like chalk skipping over the board.
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 18; i++) {
    const y = rand() * size, x = rand() * size;
    ctx.lineWidth = 0.6 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10 + rand() * 30, y + (rand() - 0.5) * 3);
    ctx.stroke();
  }
  return c;
}

function noise(size: number, seed: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rand = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(rand() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function makeBoardTexture(style: BoardStyle, W: number, H: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const rand = rng(style.id.length * 131 + W);
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, W, H);

  if (style.chalk) {
    // Clouds of old, wiped chalk dust.
    for (let i = 0; i < 30; i++) {
      const x = rand() * W, y = rand() * H, r = (0.08 + rand() * 0.22) * Math.max(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.016 + rand() * 0.028})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Eraser swipes.
    ctx.save();
    ctx.filter = 'blur(22px)';
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const y = rand() * H, x = rand() * W * 0.7, len = W * (0.18 + rand() * 0.35);
      ctx.lineWidth = 40 + rand() * 90;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + len * 0.3, y - 25 + rand() * 50, x + len * 0.7, y - 25 + rand() * 50, x + len, y + rand() * 30);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = style.dark ? 0.045 : 0.025;
  ctx.globalCompositeOperation = style.dark ? 'screen' : 'multiply';
  ctx.fillStyle = ctx.createPattern(noise(256, 5), 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (style.dark) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  return c;
}
