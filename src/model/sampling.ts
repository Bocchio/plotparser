import type { Calibration, Scale, Series, Vec2 } from '../state/types';
import { pixelToData } from './calibration';
import { sampleBezier } from './bezier';

/** Sample a series' trace and map it into data space using the calibration. */
export function seriesDataPolyline(series: Series, cal: Calibration, perSeg = 28): Vec2[] {
  const pix = sampleBezier(series.trace.anchors, perSeg);
  return pix.map((p) => pixelToData(cal, p));
}

/** All y-values where the polyline crosses a vertical line at data-x = x. */
export function crossingsAtX(poly: Vec2[], x: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (x < lo || x > hi) continue;
    if (a.x === b.x) {
      out.push(a.y);
    } else {
      const t = (x - a.x) / (b.x - a.x);
      out.push(a.y + t * (b.y - a.y));
    }
  }
  return dedupe(out);
}

/** All x-values where the polyline crosses a horizontal line at data-y = y. */
export function crossingsAtY(poly: Vec2[], y: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y > hi) continue;
    if (a.y === b.y) {
      out.push(a.x);
    } else {
      const t = (y - a.y) / (b.y - a.y);
      out.push(a.x + t * (b.x - a.x));
    }
  }
  return dedupe(out);
}

function dedupe(xs: number[]): number[] {
  const out: number[] = [];
  for (const v of xs) {
    if (!out.some((u) => Math.abs(u - v) <= Math.abs(v) * 1e-9 + 1e-12)) out.push(v);
  }
  return out;
}

function projectToSegment(a: Vec2, b: Vec2, p: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Nearest point on a polyline to a target (used for probe snapping). */
export function nearestOnPolyline(poly: Vec2[], target: Vec2): { point: Vec2; dist: number } | null {
  if (poly.length === 0) return null;
  if (poly.length === 1) {
    return { point: poly[0], dist: Math.hypot(poly[0].x - target.x, poly[0].y - target.y) };
  }
  let best: { point: Vec2; d2: number } | null = null;
  for (let i = 0; i < poly.length - 1; i++) {
    const pt = projectToSegment(poly[i], poly[i + 1], target);
    const d2 = (pt.x - target.x) ** 2 + (pt.y - target.y) ** 2;
    if (!best || d2 < best.d2) best = { point: pt, d2 };
  }
  return best ? { point: best.point, dist: Math.sqrt(best.d2) } : null;
}

export interface XGridSpec {
  min: number;
  max: number;
  count: number;
  spacing: Scale;
}

export function gridValues(spec: XGridSpec): number[] {
  const { min, max, count, spacing } = spec;
  const n = Math.max(2, Math.floor(count));
  const out: number[] = [];
  if (spacing === 'log' && min > 0 && max > 0) {
    const a = Math.log10(min);
    const b = Math.log10(max);
    for (let i = 0; i < n; i++) out.push(Math.pow(10, a + ((b - a) * i) / (n - 1)));
  } else {
    for (let i = 0; i < n; i++) out.push(min + ((max - min) * i) / (n - 1));
  }
  return out;
}

/** data-x extent across the given series (for sensible export defaults). */
export function dataXExtent(series: Series[], cal: Calibration): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    if (!s.visible) continue;
    for (const p of seriesDataPolyline(s, cal)) {
      if (!Number.isFinite(p.x)) continue;
      if (p.x < min) min = p.x;
      if (p.x > max) max = p.x;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  return { min, max };
}
