import type { Store } from '../state/store';
import {
  axisTicks,
  axisValueToPixel,
  fmt,
  isCalibrated,
} from '../model/calibration';
import { sampleBezier } from '../model/bezier';
import { crossingsAtX, seriesDataPolyline } from '../model/sampling';

/**
 * Computed gridlines from the calibration, drawn over the image. When the
 * calibration is correct these land on the plot's printed gridlines.
 */
export function drawGridlines(ctx: CanvasRenderingContext2D, store: Store, invScale: number): void {
  const { calibration: cal, image, overlay } = store.state;
  if (!isCalibrated(cal)) return;
  const W = image.naturalWidth;
  const H = image.naturalHeight;

  const xTicks = axisTicks(cal.x, W);
  const yTicks = axisTicks(cal.y, H);
  const gw = overlay.gridWidth || 1;
  const col = overlay.gridColor || '#00e5ff';
  const showMinor = overlay.minorGrid !== false;

  // optionally confine gridlines to the calibrated plot rectangle
  const clip = overlay.gridClip;
  const x0 = Math.min(cal.x.p1, cal.x.p2), x1 = Math.max(cal.x.p1, cal.x.p2);
  const y0 = Math.min(cal.y.p1, cal.y.p2), y1 = Math.max(cal.y.p1, cal.y.p2);
  if (clip) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
  }

  for (const t of xTicks) {
    if (!t.major && !showMinor) continue;
    const px = axisValueToPixel(cal.x, t.value);
    if (!Number.isFinite(px)) continue;
    strokeLine(ctx, px, 0, px, H, t.major, invScale, gw, col);
  }
  for (const t of yTicks) {
    if (!t.major && !showMinor) continue;
    const py = axisValueToPixel(cal.y, t.value);
    if (!Number.isFinite(py)) continue;
    strokeLine(ctx, 0, py, W, py, t.major, invScale, gw, col);
  }

  if (clip) ctx.restore();
}

/** #rrggbb -> rgba() with the given alpha. */
function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  major: boolean,
  invScale: number,
  widthMul: number,
  color: string,
): void {
  ctx.strokeStyle = rgba(color, major ? 0.95 : 0.4);
  ctx.lineWidth = (major ? 1.4 : 0.7) * widthMul * invScale;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Scatter the configured export sample points (image-pixel space) on the plot. */
export function drawExportMarks(ctx: CanvasRenderingContext2D, store: Store, invScale: number): void {
  const r = 3.4 * invScale;
  ctx.lineWidth = 1.4 * invScale;
  for (const m of store.exportMarks) {
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
    ctx.fillStyle = m.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
}

/**
 * "Recreation" overlay: redraw each visible series' curve from its data, plus
 * dots + value readouts where the curve crosses each major X tick. Lets the
 * user confirm the app reads the same plot.
 */
export function drawReconstruction(ctx: CanvasRenderingContext2D, store: Store, invScale: number): void {
  const { calibration: cal, image, series } = store.state;
  const calibrated = isCalibrated(cal);
  const xTicks = calibrated ? axisTicks(cal.x, image.naturalWidth).filter((t) => t.major) : [];
  const fontPx = 12 * invScale;

  for (const s of series) {
    if (!s.visible || s.trace.anchors.length < 2) continue;

    // curve (dashed so it reads distinctly from the printed line)
    const pix = sampleBezier(s.trace.anchors);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.2 * invScale;
    ctx.setLineDash([7 * invScale, 5 * invScale]);
    ctx.beginPath();
    pix.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);

    if (!calibrated) continue;

    // data readout dots at major X ticks
    const dataPoly = seriesDataPolyline(s, cal);
    ctx.fillStyle = s.color;
    ctx.font = `${fontPx}px system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    for (const t of xTicks) {
      for (const y of crossingsAtX(dataPoly, t.value)) {
        const px = axisValueToPixel(cal.x, t.value);
        const py = axisValueToPixel(cal.y, y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        ctx.beginPath();
        ctx.arc(px, py, 3.2 * invScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(fmt(y, 3), px + 5 * invScale, py - 3 * invScale);
      }
    }
  }
}
