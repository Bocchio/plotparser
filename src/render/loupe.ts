import type { Vec2 } from '../state/types';

/**
 * Draw a magnified circular view of the image centred on `focus` (image space).
 * `overlay` (optional) draws vector content — the curve, nodes, handles — using
 * the provided image->loupe mapping so the user sees exactly what they're aligning.
 */
export function drawLoupe(
  loupe: HTMLCanvasElement,
  img: HTMLImageElement,
  focus: Vec2,
  zoom = 7,
  overlay?: (ctx: CanvasRenderingContext2D, toLoupe: (p: Vec2) => Vec2) => void,
): void {
  const ctx = loupe.getContext('2d');
  if (!ctx) return;
  const w = loupe.width;
  const h = loupe.height;
  const srcW = w / zoom;
  const srcH = h / zoom;
  const ox = focus.x - srcW / 2;
  const oy = focus.y - srcH / 2;
  const toLoupe = (p: Vec2): Vec2 => ({ x: (p.x - ox) * zoom, y: (p.y - oy) * zoom });

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = '#0b0e12';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, ox, oy, srcW, srcH, 0, 0, w, h);

  if (overlay) overlay(ctx, toLoupe);

  // crosshair on the focus point (loupe centre)
  ctx.strokeStyle = 'rgba(76,154,255,.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.restore();
}
