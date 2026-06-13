import type { Store } from '../state/store';
import type { Stage } from './stage';
import { svgEl } from '../util/dom';
import { bezierPath, anchorIn, anchorOut } from '../model/bezier';
import { axisValueToPixel, fmt, isCalibrated, pixelToData } from '../model/calibration';

const X_COLOR = '#f5a623';
const Y_COLOR = '#4c9aff';
const PROBE_COLOR = '#46f08a';

export function buildHandles(store: Store, stage: Stage): SVGElement[] {
  const out: SVGElement[] = [];
  const inv = stage.invScale();
  const { calibration: cal, image, series, probes } = store.state;
  const W = image.naturalWidth;
  const H = image.naturalHeight;
  if (W === 0) return out;

  // ---- series curves (inactive first, active on top) ----
  const activeId = store.ui.activeSeriesId;
  const ordered = [...series].sort((a, b) => (a.id === activeId ? 1 : 0) - (b.id === activeId ? 1 : 0));
  for (const s of ordered) {
    if (s.visible && s.trace.anchors.length >= 2) {
      const w = s.width || 2;
      out.push(
        svgEl('path', {
          d: bezierPath(s.trace.anchors),
          fill: 'none',
          stroke: s.color,
          'stroke-width': s.id === activeId ? w : Math.max(1, w * 0.7),
          'stroke-opacity': s.id === activeId ? 1 : 0.5,
          'vector-effect': 'non-scaling-stroke',
          'pointer-events': 'none',
        }),
      );
    }
  }

  // ---- anchors + handles for the active series (only while visible) ----
  const active = store.activeSeries();
  if (active && active.visible) {
    const sel = store.ui.selection;

    // Invisible fat overlay on the curve: in Trace mode, clicking it inserts a
    // node at that spot (GIMP/Inkscape-style). Drawn before the nodes so the
    // node glyphs stay on top and win the hit-test.
    if (active.trace.anchors.length >= 2) {
      const traceMode = store.ui.tool === 'trace';
      out.push(
        svgEl('path', {
          d: bezierPath(active.trace.anchors),
          fill: 'none',
          stroke: 'transparent',
          'stroke-width': 16 * inv,
          'stroke-linecap': 'round',
          'pointer-events': traceMode ? 'stroke' : 'none',
          style: traceMode ? 'cursor:copy' : undefined,
          onpointerdown: traceMode ? (e: PointerEvent) => stage.startInsertOnCurve(e) : undefined,
        }),
      );
    }

    active.trace.anchors.forEach((a, i) => {
      const isSel =
        (sel?.kind === 'anchor' || sel?.kind === 'handle') && sel.seriesId === active.id && sel.index === i;

      if (isSel) {
        for (const side of ['in', 'out'] as const) {
          const hp = side === 'in' ? anchorIn(a) : anchorOut(a);
          out.push(
            svgEl('line', {
              x1: a.x, y1: a.y, x2: hp.x, y2: hp.y,
              stroke: active.color, 'stroke-width': 1, 'stroke-opacity': 0.7,
              'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
            }),
          );
          out.push(
            svgEl('rect', {
              x: hp.x - 4 * inv, y: hp.y - 4 * inv, width: 8 * inv, height: 8 * inv,
              fill: '#fff', stroke: active.color, 'stroke-width': 1.2,
              'vector-effect': 'non-scaling-stroke', style: 'cursor:move',
              onpointerdown: (e: PointerEvent) => stage.startHandleDrag(active.id, i, side, e),
            }),
          );
        }
      }

      // node glyph encodes its mode: square = corner (independent handles),
      // diamond = smooth (mirrored handles), circle = auto (follows neighbours).
      // Colour fill + contrasting white ring so nodes stand out from the same-
      // coloured curve; selection inverts (white fill, coloured ring).
      const common = {
        class: 'node-glyph',
        fill: isSel ? '#fff' : active.color,
        stroke: isSel ? active.color : '#fff',
        'stroke-width': isSel ? 2.5 : 2,
        'vector-effect': 'non-scaling-stroke', style: 'cursor:move',
        onpointerdown: (e: PointerEvent) => stage.startAnchorDrag(active.id, i, e),
      };
      const r = (isSel ? 6.5 : 5.5) * inv;
      if (a.mode === 'corner') {
        out.push(svgEl('rect', { x: a.x - r, y: a.y - r, width: 2 * r, height: 2 * r, ...common }));
      } else if (a.mode === 'smooth') {
        out.push(svgEl('polygon', {
          points: `${a.x},${a.y - r} ${a.x + r},${a.y} ${a.x},${a.y + r} ${a.x - r},${a.y}`,
          ...common,
        }));
      } else {
        out.push(svgEl('circle', { cx: a.x, cy: a.y, r, ...common }));
      }
    });
  }

  // ---- inactive series: small dots that select the series ----
  for (const s of series) {
    if (s.id === activeId || !s.visible) continue;
    s.trace.anchors.forEach((a) => {
      out.push(
        svgEl('circle', {
          cx: a.x, cy: a.y, r: 3.2 * inv, fill: s.color, 'fill-opacity': 0.6,
          'vector-effect': 'non-scaling-stroke', style: 'cursor:pointer',
          onpointerdown: (e: PointerEvent) => {
            e.stopPropagation();
            store.ui.activeSeriesId = s.id;
            store.emitStructure();
          },
        }),
      );
    });
  }

  // ---- probe pins ----
  const calibrated = isCalibrated(cal);
  for (const p of probes) {
    const isSel = store.ui.selection?.kind === 'probe' && store.ui.selection.id === p.id;
    if (isSel) {
      out.push(line(0, p.y, W, p.y, PROBE_COLOR, true));
      out.push(line(p.x, 0, p.x, H, PROBE_COLOR, true));
    }
    const r = 6 * inv;
    out.push(svgEl('line', { x1: p.x - r, y1: p.y, x2: p.x + r, y2: p.y, stroke: PROBE_COLOR, 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    out.push(svgEl('line', { x1: p.x, y1: p.y - r, x2: p.x, y2: p.y + r, stroke: PROBE_COLOR, 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    out.push(
      svgEl('circle', {
        cx: p.x, cy: p.y, r: 7 * inv, fill: 'transparent',
        stroke: PROBE_COLOR, 'stroke-width': isSel ? 2.4 : 1.6,
        'vector-effect': 'non-scaling-stroke', style: 'cursor:move',
        onpointerdown: (e: PointerEvent) => stage.startProbeDrag(p.id, e),
      }),
    );
    const label = svgEl('text', {
      x: p.x + 10 * inv, y: p.y - 8 * inv, fill: PROBE_COLOR,
      'font-size': 13 * inv, 'font-weight': 600, 'pointer-events': 'none',
      style: `paint-order:stroke; stroke:#000; stroke-width:${3 * inv}px;`,
    });
    if (calibrated) {
      const d = pixelToData(cal, p);
      label.textContent = `(${fmt(d.x, 4)}, ${fmt(d.y, 4)})`;
    } else {
      label.textContent = `(${p.x.toFixed(0)}, ${p.y.toFixed(0)} px)`;
    }
    out.push(label);
  }

  // ---- calibration reference lines (drawn last, on top) ----
  // Only draggable in Pan/select mode — in Trace mode they're inert so they
  // don't steal clicks meant for nodes sitting next to an axis.
  const calibInteractive = store.ui.tool !== 'trace';
  const refW = store.state.overlay.refWidth || 1;
  const xc = store.state.overlay.xAxisColor || X_COLOR;
  const yc = store.state.overlay.yAxisColor || Y_COLOR;
  out.push(calibLine(stage, 'x', 1, cal.x.p1, cal.x.v1, W, H, inv, calibInteractive, refW, xc));
  out.push(calibLine(stage, 'x', 2, cal.x.p2, cal.x.v2, W, H, inv, calibInteractive, refW, xc));
  out.push(calibLine(stage, 'y', 1, cal.y.p1, cal.y.v1, W, H, inv, calibInteractive, refW, yc));
  out.push(calibLine(stage, 'y', 2, cal.y.p2, cal.y.v2, W, H, inv, calibInteractive, refW, yc));

  return out;
}

function line(x1: number, y1: number, x2: number, y2: number, color: string, dashed: boolean): SVGElement {
  return svgEl('line', {
    x1, y1, x2, y2, stroke: color, 'stroke-width': 1.2,
    'stroke-dasharray': dashed ? '6 5' : null, 'stroke-opacity': 0.8,
    'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
  });
}

function calibLine(
  stage: Stage, axis: 'x' | 'y', which: 1 | 2,
  p: number, value: number, W: number, H: number, inv: number,
  interactive: boolean, widthMul: number, color: string,
): SVGElement {
  const x1 = axis === 'x' ? p : 0;
  const y1 = axis === 'x' ? 0 : p;
  const x2 = axis === 'x' ? p : W;
  const y2 = axis === 'x' ? H : p;
  const g = svgEl('g', {});
  g.appendChild(svgEl('line', {
    x1, y1, x2, y2, stroke: color, 'stroke-width': 1.4 * widthMul, 'stroke-dasharray': '5 4',
    'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
  }));
  if (interactive) {
    g.appendChild(svgEl('line', {
      x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 16 * inv,
      style: axis === 'x' ? 'cursor:ew-resize' : 'cursor:ns-resize',
      onpointerdown: (e: PointerEvent) => stage.startCalibDrag(axis, which, e),
    }));
  }
  const lx = axis === 'x' ? p + 4 * inv : 4 * inv;
  const ly = axis === 'x' ? 16 * inv : p - 4 * inv;
  const label = svgEl('text', {
    x: lx, y: ly, fill: color, 'font-size': 13 * inv,
    'font-weight': 600, 'pointer-events': 'none',
    style: `paint-order:stroke; stroke:#000; stroke-width:${3 * inv}px;`,
  });
  label.textContent = `${axis}${which} = ${formatLabel(value)}`;
  g.appendChild(label);
  return g;
}

function formatLabel(v: number): string {
  if (!Number.isFinite(v)) return '?';
  return parseFloat(v.toPrecision(6)).toString();
}
