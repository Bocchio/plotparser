import type { BezierAnchor, Vec2 } from '../state/types';

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

export function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  return { x: cubic(p0.x, p1.x, p2.x, p3.x, t), y: cubic(p0.y, p1.y, p2.y, p3.y, t) };
}

/**
 * Catmull-Rom auto-smoothing: recompute handles for 'auto' nodes (undefined mode
 * counts as auto) so dropping a few points yields a smooth curve without tweaking.
 */
export function recomputeHandles(anchors: BezierAnchor[], tension = 1 / 6): void {
  const n = anchors.length;
  for (let i = 0; i < n; i++) {
    const a = anchors[i];
    if (a.mode && a.mode !== 'auto') continue;
    const prev = anchors[i - 1] ?? a;
    const next = anchors[i + 1] ?? a;
    const tx = (next.x - prev.x) * tension;
    const ty = (next.y - prev.y) * tension;
    a.hOut = { x: tx, y: ty };
    a.hIn = { x: -tx, y: -ty };
  }
}

const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/**
 * Insert a node on the segment between anchors[i] and anchors[i+1] at parameter
 * t, preserving the curve shape (de Casteljau split). The three affected nodes
 * become 'corner' so their computed handles stick. Returns the new node index.
 */
export function insertNodeOnSegment(anchors: BezierAnchor[], i: number, t: number): number {
  const A = anchors[i];
  const B = anchors[i + 1];
  const p0 = { x: A.x, y: A.y };
  const p1 = anchorOut(A);
  const p2 = anchorIn(B);
  const p3 = { x: B.x, y: B.y };

  const a = lerp2(p0, p1, t);
  const b = lerp2(p1, p2, t);
  const c = lerp2(p2, p3, t);
  const d = lerp2(a, b, t);
  const e = lerp2(b, c, t);
  const m = lerp2(d, e, t); // new node position

  A.hOut = { x: a.x - A.x, y: a.y - A.y };
  A.mode = 'corner';
  B.hIn = { x: c.x - B.x, y: c.y - B.y };
  B.mode = 'corner';
  const node: BezierAnchor = {
    x: m.x,
    y: m.y,
    hIn: { x: d.x - m.x, y: d.y - m.y },
    hOut: { x: e.x - m.x, y: e.y - m.y },
    mode: 'smooth',
  };
  anchors.splice(i + 1, 0, node);
  return i + 1;
}

export function anchorOut(a: BezierAnchor): Vec2 {
  return { x: a.x + (a.hOut?.x ?? 0), y: a.y + (a.hOut?.y ?? 0) };
}
export function anchorIn(a: BezierAnchor): Vec2 {
  return { x: a.x + (a.hIn?.x ?? 0), y: a.y + (a.hIn?.y ?? 0) };
}

/** Flatten the polybezier into a pixel-space polyline (segments * perSeg points). */
export function sampleBezier(anchors: BezierAnchor[], perSeg = 28): Vec2[] {
  if (anchors.length === 0) return [];
  if (anchors.length === 1) return [{ x: anchors[0].x, y: anchors[0].y }];
  const pts: Vec2[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const p0 = { x: a.x, y: a.y };
    const p1 = anchorOut(a);
    const p2 = anchorIn(b);
    const p3 = { x: b.x, y: b.y };
    for (let s = i === 0 ? 0 : 1; s <= perSeg; s++) {
      pts.push(cubicPoint(p0, p1, p2, p3, s / perSeg));
    }
  }
  return pts;
}

/** Nearest point on the curve to a target (image space) -> which segment + local t. */
export function nearestOnBezier(
  anchors: BezierAnchor[],
  target: Vec2,
  perSeg = 24,
): { seg: number; t: number; point: Vec2; dist: number } | null {
  if (anchors.length < 2) return null;
  let best: { seg: number; t: number; point: Vec2; d2: number } | null = null;
  for (let i = 0; i < anchors.length - 1; i++) {
    const A = anchors[i];
    const B = anchors[i + 1];
    const p0 = { x: A.x, y: A.y };
    const p1 = anchorOut(A);
    const p2 = anchorIn(B);
    const p3 = { x: B.x, y: B.y };
    for (let s = 0; s <= perSeg; s++) {
      const t = s / perSeg;
      const pt = cubicPoint(p0, p1, p2, p3, t);
      const d2 = (pt.x - target.x) ** 2 + (pt.y - target.y) ** 2;
      if (!best || d2 < best.d2) best = { seg: i, t, point: pt, d2 };
    }
  }
  return best ? { seg: best.seg, t: best.t, point: best.point, dist: Math.sqrt(best.d2) } : null;
}

/** SVG path data for the polybezier (image-space coordinates). */
export function bezierPath(anchors: BezierAnchor[]): string {
  if (anchors.length === 0) return '';
  let d = `M ${anchors[0].x} ${anchors[0].y}`;
  for (let i = 0; i < anchors.length - 1; i++) {
    const o = anchorOut(anchors[i]);
    const inn = anchorIn(anchors[i + 1]);
    const b = anchors[i + 1];
    d += ` C ${o.x} ${o.y} ${inn.x} ${inn.y} ${b.x} ${b.y}`;
  }
  return d;
}
