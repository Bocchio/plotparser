import type { AppContext } from '../context';
import type { ProbePoint } from '../../state/types';
import { makePanel } from '../panel';
import { el, help } from '../../util/dom';
import { fmt, isCalibrated, pixelToData } from '../../model/calibration';
import { sampleBezier } from '../../model/bezier';
import { nearestOnPolyline } from '../../model/sampling';

export function probesPanel(ctx: AppContext): HTMLElement {
  const { store, stage } = ctx;
  const panel = makePanel({ step: '4', title: 'Probe points', collapsed: false });
  const readouts = new Map<string, HTMLElement>();

  function readoutText(p: ProbePoint): string {
    const cal = store.state.calibration;
    if (isCalibrated(cal)) {
      const d = pixelToData(cal, p);
      return `${cal.xLabel} ${fmt(d.x, 5)},  ${cal.yLabel} ${fmt(d.y, 5)}`;
    }
    return `${p.x.toFixed(0)}, ${p.y.toFixed(0)} px`;
  }

  function refreshReadouts(): void {
    for (const p of store.state.probes) {
      const span = readouts.get(p.id);
      if (span) span.textContent = readoutText(p);
    }
  }

  function row(p: ProbePoint, idx: number): HTMLElement {
    const readout = el('span', { class: 'grow coord' });
    readouts.set(p.id, readout);

    const snap = el('select', { title: 'Snap onto a curve' }) as HTMLSelectElement;
    snap.appendChild(el('option', { value: '' }, ['Free']) as Node);
    for (const s of store.state.series) {
      const opt = el('option', { value: s.id }, [s.name]) as HTMLOptionElement;
      if (p.snapSeriesId === s.id) opt.selected = true;
      snap.appendChild(opt);
    }
    snap.addEventListener('change', () => {
      store.history.run(() => {
        p.snapSeriesId = snap.value || null;
        if (p.snapSeriesId) {
          const s = store.seriesById(p.snapSeriesId);
          const near = s ? nearestOnPolyline(sampleBezier(s.trace.anchors), p) : null;
          if (near) { p.x = near.point.x; p.y = near.point.y; }
        }
      });
      store.emitStructure();
    });

    const del = el('button', { class: 'icon danger', title: 'Delete point' }, ['🗑']);
    del.addEventListener('click', () => store.removeProbe(p.id));

    const item = el('div', { class: 'series-item' + (isSel(p) ? ' active' : '') }, [
      el('span', { class: 'count' }, [`P${idx + 1}`]),
      readout,
      snap,
      del,
    ]);
    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'SELECT') return;
      store.ui.selection = { kind: 'probe', id: p.id };
      store.emitStructure();
    });
    return item;
  }

  function isSel(p: ProbePoint): boolean {
    return store.ui.selection?.kind === 'probe' && store.ui.selection.id === p.id;
  }

  function render(): void {
    readouts.clear();
    panel.renderBody(() => {
      const add = el('button', {}, ['＋ Add probe']);
      add.addEventListener('click', () => {
        if (!store.hasImage()) { ctx.toast('Load an image first'); return; }
        stage.addProbeAtCenter();
      });
      const out: (Node | string | false)[] = [
        el('div', { class: 'row' }, [
          add,
          help('Drag pins to read the (x, y) the app sees. Set Snap to make a pin ride a curve — e.g. slide it to where the line meets an axis.'),
        ]),
      ];
      out.push(...store.state.probes.map(row));
      if (store.state.probes.length === 0) {
        out.push(el('div', { class: 'hint' }, ['No probe points yet.']));
      }
      return out;
    });
    refreshReadouts();
  }

  store.onStructure(render);
  store.onRender(refreshReadouts);
  render();
  return panel.root;
}
