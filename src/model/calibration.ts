import type { AxisCal, Calibration, TickConfig, Vec2 } from '../state/types';

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function isAxisValid(ax: AxisCal): boolean {
  if (ax.p1 === ax.p2) return false;
  if (!Number.isFinite(ax.v1) || !Number.isFinite(ax.v2)) return false;
  if (ax.v1 === ax.v2) return false;
  if (ax.scale === 'log' && (ax.v1 <= 0 || ax.v2 <= 0)) return false;
  return true;
}

export function isCalibrated(cal: Calibration): boolean {
  return isAxisValid(cal.x) && isAxisValid(cal.y);
}

/** pixel position (image space) -> data value along one axis */
export function axisPixelToValue(ax: AxisCal, p: number): number {
  const t = (p - ax.p1) / (ax.p2 - ax.p1);
  if (ax.scale === 'log') {
    return Math.pow(10, lerp(Math.log10(ax.v1), Math.log10(ax.v2), t));
  }
  return lerp(ax.v1, ax.v2, t);
}

/** data value -> pixel position (image space) along one axis */
export function axisValueToPixel(ax: AxisCal, v: number): number {
  let t: number;
  if (ax.scale === 'log') {
    if (v <= 0) return NaN;
    t = (Math.log10(v) - Math.log10(ax.v1)) / (Math.log10(ax.v2) - Math.log10(ax.v1));
  } else {
    t = (v - ax.v1) / (ax.v2 - ax.v1);
  }
  return lerp(ax.p1, ax.p2, t);
}

export function pixelToData(cal: Calibration, p: Vec2): Vec2 {
  return { x: axisPixelToValue(cal.x, p.x), y: axisPixelToValue(cal.y, p.y) };
}

export function dataToPixel(cal: Calibration, d: Vec2): Vec2 {
  return { x: axisValueToPixel(cal.x, d.x), y: axisValueToPixel(cal.y, d.y) };
}

export interface Tick {
  value: number;
  major: boolean;
}

function roundNice(v: number): number {
  // Strip floating-point noise (e.g. 0.30000000004 -> 0.3).
  return parseFloat(v.toPrecision(12));
}

const LOG_MAJOR = new Set([1, 2, 3, 5, 7]);

export function logTicks(lo: number, hi: number): Tick[] {
  const ticks: Tick[] = [];
  if (lo <= 0 || hi <= 0) return ticks;
  const startExp = Math.floor(Math.log10(lo));
  const endExp = Math.ceil(Math.log10(hi));
  for (let e = startExp; e <= endExp; e++) {
    const decade = Math.pow(10, e);
    for (let m = 1; m <= 9; m++) {
      const v = roundNice(m * decade);
      if (v < lo * 0.9999 || v > hi * 1.0001) continue;
      ticks.push({ value: v, major: LOG_MAJOR.has(m) });
    }
  }
  return ticks;
}

export function linearTicks(lo: number, hi: number): Tick[] {
  const ticks: Tick[] = [];
  const span = hi - lo;
  if (!(span > 0)) return ticks;
  const rawStep = span / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const minor = step / 5;
  const start = Math.ceil(lo / minor - 1e-9) * minor;
  for (let v = start; v <= hi + minor * 1e-6; v += minor) {
    const nv = roundNice(v);
    const isMajor = Math.abs(nv / step - Math.round(nv / step)) < 1e-6;
    ticks.push({ value: nv, major: isMajor });
  }
  return ticks;
}

export function parseTickList(s?: string): number[] {
  if (!s) return [];
  return s.split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v));
}

/** Explicit user-listed ticks (minors that coincide with a major are dropped). */
function listTicks(cfg: TickConfig): Tick[] {
  const majors = parseTickList(cfg.majors);
  const majorSet = new Set(majors.map(roundNice));
  const minors = parseTickList(cfg.minors).filter((v) => !majorSet.has(roundNice(v)));
  return [
    ...majors.map((value) => ({ value: roundNice(value), major: true })),
    ...minors.map((value) => ({ value: roundNice(value), major: false })),
  ];
}

/** Evenly-stepped ticks: a major every `majorStep`, each split into `minorDivs`. */
function stepTicks(cfg: TickConfig, lo: number, hi: number): Tick[] {
  const step = cfg.majorStep && cfg.majorStep > 0 ? cfg.majorStep : (hi - lo) / 8;
  if (!(step > 0)) return [];
  const divs = Math.max(1, Math.floor(cfg.minorDivs ?? 1));
  const minorStep = step / divs;
  if (!(minorStep > 0) || (hi - lo) / minorStep > 5000) return []; // guard runaway counts
  const ticks: Tick[] = [];
  const start = Math.ceil(lo / minorStep - 1e-9) * minorStep;
  for (let v = start; v <= hi + minorStep * 1e-6; v += minorStep) {
    const nv = roundNice(v);
    const isMajor = Math.abs(nv / step - Math.round(nv / step)) < 1e-6;
    ticks.push({ value: nv, major: isMajor });
  }
  return ticks;
}

/** Ticks within the data range spanned by an image pixel extent [0, pixelMax]. */
export function axisTicks(ax: AxisCal, pixelMax: number): Tick[] {
  const a = axisPixelToValue(ax, 0);
  const b = axisPixelToValue(ax, pixelMax);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const cfg = ax.ticks;
  if (cfg && cfg.mode === 'list') return listTicks(cfg);
  if (cfg && cfg.mode === 'step') return stepTicks(cfg, lo, hi);
  return ax.scale === 'log' ? logTicks(lo, hi) : linearTicks(lo, hi);
}

/** Human-friendly number formatting for readouts and exports. */
export function fmt(v: number, sig = 4): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 1e-4) return v.toExponential(Math.max(0, sig - 1));
  return roundNice(parseFloat(v.toPrecision(sig))).toString();
}
