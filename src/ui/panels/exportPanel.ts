import type { AppContext } from '../context';
import type { Scale, Series } from '../../state/types';
import { makePanel } from '../panel';
import { clear, el, help } from '../../util/dom';
import { icon } from '../icons';
import { stepper } from '../controls';
import { axisTicks, dataToPixel, fmt, isCalibrated, parseTickList } from '../../model/calibration';
import {
  crossingsAtX,
  crossingsAtY,
  dataXExtent,
  gridValues,
  seriesDataPolyline,
} from '../../model/sampling';
import { tableToCSV, tableToTSV, type Table } from '../../io/csv';
import { downloadText } from '../../io/download';
import { copyText } from '../../io/clipboard';

type Mode = 'grid' | 'xticks' | 'yticks' | 'manual' | 'raw';
interface Mark { x: number; y: number; color: string }

interface ExportState {
  mode: Mode;
  min: number | null;
  max: number | null;
  count: number;
  spacing: Scale;
  spacingInit: boolean;
  manualX: string;
}

const MODE_LABELS: Record<Mode, string> = {
  grid: 'Even X grid',
  xticks: 'X-axis ticks (calibration)',
  yticks: 'Y-axis ticks (calibration)',
  manual: 'Manual X values',
  raw: 'Raw curve samples',
};

export function exportPanel(ctx: AppContext): HTMLElement {
  const { store } = ctx;
  const panel = makePanel({ step: '5', title: 'Export data', collapsed: true });
  const st: ExportState = {
    mode: 'grid', min: null, max: null, count: 21, spacing: 'linear', spacingInit: false, manualX: '',
  };

  // Export reflects every traced curve regardless of its on-canvas visibility —
  // hiding a series only declutters the view, it doesn't drop its data.
  function exportableSeries(): Series[] {
    return store.state.series.filter((s) => s.trace.anchors.length >= 2);
  }

  function xSamplePositions(): number[] {
    const cal = store.state.calibration;
    if (st.mode === 'xticks') {
      return axisTicks(cal.x, store.state.image.naturalWidth).filter((t) => t.major).map((t) => t.value);
    }
    if (st.mode === 'manual') return parseTickList(st.manualX);
    if (st.min != null && st.max != null && st.max !== st.min) {
      return gridValues({ min: st.min, max: st.max, count: st.count, spacing: st.spacing });
    }
    return [];
  }
  function ySamplePositions(): number[] {
    const cal = store.state.calibration;
    return axisTicks(cal.y, store.state.image.naturalHeight).filter((t) => t.major).map((t) => t.value);
  }

  /** Build the export table and the matching scatter marks (data space). */
  function compute(): { table: Table; marks: Mark[] } {
    const cal = store.state.calibration;
    const series = exportableSeries();
    const marks: Mark[] = [];

    if (st.mode === 'raw') {
      const columns = ['series', cal.xLabel, cal.yLabel];
      const rows: (number | string)[][] = [];
      for (const s of series) {
        for (const p of seriesDataPolyline(s, cal)) {
          rows.push([s.name, p.x, p.y]);
          marks.push({ x: p.x, y: p.y, color: s.color });
        }
      }
      return { table: { columns, rows }, marks };
    }

    if (st.mode === 'yticks') {
      const ys = ySamplePositions();
      const columns = [cal.yLabel, ...series.map((s) => s.name)];
      const polys = series.map((s) => seriesDataPolyline(s, cal));
      const rows: (number | string)[][] = [];
      for (const y of ys) {
        const row: (number | string)[] = [y];
        polys.forEach((poly, i) => {
          const xs = crossingsAtY(poly, y);
          if (xs.length) { row.push(xs[0]); marks.push({ x: xs[0], y, color: series[i].color }); }
          else row.push('');
        });
        rows.push(row);
      }
      return { table: { columns, rows }, marks };
    }

    // x-driven modes: grid / xticks / manual
    const xs = xSamplePositions();
    const columns = [cal.xLabel, ...series.map((s) => s.name)];
    const polys = series.map((s) => seriesDataPolyline(s, cal));
    const rows: (number | string)[][] = [];
    for (const x of xs) {
      const row: (number | string)[] = [x];
      polys.forEach((poly, i) => {
        const ys = crossingsAtX(poly, x);
        if (ys.length) { row.push(ys[0]); marks.push({ x, y: ys[0], color: series[i].color }); }
        else row.push('');
      });
      rows.push(row);
    }
    return { table: { columns, rows }, marks };
  }

  function updateMarks(marks?: Mark[]): void {
    if (!store.state.overlay.exportPoints) { store.exportMarks = []; return; }
    const cal = store.state.calibration;
    const src = marks ?? compute().marks;
    store.exportMarks = src
      .map((m) => { const p = dataToPixel(cal, m); return { x: p.x, y: p.y, color: m.color }; })
      .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y));
  }

  function previewTable(table: Table): HTMLElement {
    const head = el('tr', {}, table.columns.map((c) => el('th', {}, [c])));
    const bodyRows = table.rows.slice(0, 12).map((r) =>
      el('tr', {}, r.map((v) => el('td', {}, [typeof v === 'number' ? fmt(v, 5) : String(v)]))),
    );
    const more = table.rows.length > 12
      ? [el('tr', {}, [el('td', { colspan: String(table.columns.length), style: { color: 'var(--muted)' } }, [`… ${table.rows.length - 12} more rows`])])]
      : [];
    return el('div', { class: 'preview-wrap' }, [
      el('table', { class: 'preview' }, [el('thead', {}, [head]), el('tbody', {}, [...bodyRows, ...more])]),
    ]);
  }

  function render(): void {
    const cal = store.state.calibration;
    const calibrated = isCalibrated(cal);
    if (!st.spacingInit && calibrated) { st.spacing = cal.x.scale; st.spacingInit = true; }

    panel.renderBody(() => {
      if (!calibrated) { store.exportMarks = []; return [el('div', { class: 'hint' }, ['Calibrate both axes to export numeric data.'])]; }
      if (exportableSeries().length === 0) { store.exportMarks = []; return [el('div', { class: 'hint' }, ['Trace at least one curve (≥ 2 points) to export.'])]; }

      const extent = dataXExtent(store.state.series, cal);
      if (st.min == null && extent) st.min = round4(extent.min);
      if (st.max == null && extent) st.max = round4(extent.max);

      const previewWrap = el('div', {});
      const refresh = () => {
        const { table, marks } = compute();
        clear(previewWrap);
        previewWrap.appendChild(previewTable(table));
        updateMarks(marks);
        store.emitRender();
      };

      // sampling mode
      const modeSel = el('select', {}, (Object.keys(MODE_LABELS) as Mode[]).map((m) => {
        const o = el('option', { value: m }, [MODE_LABELS[m]]) as HTMLOptionElement;
        if (st.mode === m) o.selected = true;
        return o;
      })) as HTMLSelectElement;
      modeSel.addEventListener('change', () => { st.mode = modeSel.value as Mode; modeSel.blur(); render(); });

      const controls: (Node | string | false)[] = [
        el('div', { class: 'ctl' }, [
          el('span', { class: 'ctl-label', style: { flex: '0 0 auto' } }, ['Sample at']),
          modeSel,
          help('Even X grid: evenly spaced X. X/Y-axis ticks: reuse the calibration tick values. Manual X: type your own X list. Raw: every point along the traced curve.'),
        ]),
      ];

      if (st.mode === 'grid') {
        const minI = num(st.min, (v) => { st.min = v; refresh(); });
        const maxI = num(st.max, (v) => { st.max = v; refresh(); });
        const linB = el('button', { class: st.spacing === 'linear' ? 'active' : '' }, ['Lin']);
        const logB = el('button', { class: st.spacing === 'log' ? 'active' : '' }, ['Log']);
        linB.addEventListener('click', () => { st.spacing = 'linear'; render(); });
        logB.addEventListener('click', () => { st.spacing = 'log'; render(); });
        controls.push(
          el('div', { class: 'row' }, [
            el('div', { class: 'field grow' }, [el('label', {}, ['min ' + cal.xLabel]), minI]),
            el('div', { class: 'field grow' }, [el('label', {}, ['max ' + cal.xLabel]), maxI]),
          ]),
          stepper({
            label: 'Points', value: st.count, min: 2, max: 1000, step: 1, defaultValue: 21,
            onInput: (v) => { st.count = Math.round(v); refresh(); },
          }),
          el('div', { class: 'ctl' }, [
            el('span', { class: 'ctl-label' }, ['Spacing']),
            el('div', { class: 'seg' }, [linB, logB]),
          ]),
        );
      } else if (st.mode === 'manual') {
        const mx = el('input', { type: 'text', value: st.manualX, placeholder: `${cal.xLabel} values, e.g. 1, 5, 10, 50` }) as HTMLInputElement;
        mx.addEventListener('input', () => { st.manualX = mx.value; refresh(); });
        controls.push(el('div', { class: 'field' }, [el('label', {}, ['Manual X values']), mx]));
      }

      // scatter overlay toggle
      const showCb = el('input', { type: 'checkbox', checked: store.state.overlay.exportPoints }) as HTMLInputElement;
      showCb.addEventListener('change', () => {
        store.state.overlay.exportPoints = showCb.checked;
        updateMarks();
        store.emitRender();
      });
      const showRow = el('label', { class: 'row', style: { color: 'var(--text)' } }, [showCb, ' Show sample points on plot']);

      refresh();

      const copyBtn = el('button', {}, [icon('copy'), 'Copy']);
      copyBtn.addEventListener('click', async () => {
        const ok = await copyText(tableToTSV(compute().table));
        ctx.toast(ok ? 'Copied to clipboard' : 'Copy failed');
      });
      const dlBtn = el('button', { class: 'primary' }, [icon('download'), 'Download CSV']);
      dlBtn.addEventListener('click', () => {
        downloadText('plotparser-data.csv', tableToCSV(compute().table), 'text/csv');
        ctx.toast('CSV downloaded');
      });

      return [
        ...controls,
        showRow,
        previewWrap,
        el('div', { class: 'row' }, [copyBtn, dlBtn]),
        el('hr', { style: { border: 'none', borderTop: '1px solid var(--line)', width: '100%' } }),
        el('div', { class: 'field' }, [el('label', {}, ['Project']), projectRow(ctx)]),
      ];
    });
  }

  store.onStructure(render);
  render();
  return panel.root;
}

function projectRow(ctx: AppContext): HTMLElement {
  const save = el('button', { class: 'primary' }, ['Save']);
  save.addEventListener('click', () => ctx.saveProject(true));
  const cfg = el('button', { title: 'Without embedded image' }, ['Config only']);
  cfg.addEventListener('click', () => ctx.saveProject(false));
  const load = el('button', {}, ['Load']);
  load.addEventListener('click', () => ctx.pickProject());
  return el('div', { class: 'row' }, [save, cfg, load]);
}

function num(value: number | null, onChange: (v: number) => void): HTMLInputElement {
  const input = el('input', { type: 'number', step: 'any', value: value == null ? '' : String(value) }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) onChange(v);
  });
  return input;
}

function round4(v: number): number {
  return parseFloat(v.toPrecision(4));
}
