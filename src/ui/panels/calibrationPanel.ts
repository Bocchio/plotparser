import type { AppContext } from '../context';
import type { AxisCal, Scale, TickConfig } from '../../state/types';
import { makePanel } from '../panel';
import { el, help } from '../../util/dom';
import { stepper } from '../controls';
import { isAxisValid, isCalibrated } from '../../model/calibration';

export function calibrationPanel(ctx: AppContext): HTMLElement {
  const { store } = ctx;
  const panel = makePanel({ step: '1', title: 'Calibration' });

  function axisBlock(axis: 'x' | 'y'): HTMLElement {
    const cal = store.state.calibration;
    const ax: AxisCal = cal[axis];
    const o = store.state.overlay;
    const colorKey = axis === 'x' ? 'xAxisColor' : 'yAxisColor';
    const color = o[colorKey];
    const labelKey = axis === 'x' ? 'xLabel' : 'yLabel';

    const lineColor = el('input', { class: 'mini', type: 'color', value: color, title: 'Guide-line colour' }) as HTMLInputElement;
    lineColor.addEventListener('input', () => { o[colorKey] = lineColor.value; store.emitRender(); });

    const labelInput = el('input', {
      type: 'text', value: cal[labelKey], placeholder: axis === 'x' ? 'x' : 'y',
    }) as HTMLInputElement;
    labelInput.addEventListener('focus', () => store.history.begin());
    labelInput.addEventListener('input', () => {
      cal[labelKey] = labelInput.value || axis;
      store.emitRender();
    });
    labelInput.addEventListener('blur', () => store.history.commit());

    // scale toggle
    const linBtn = el('button', { class: ax.scale === 'linear' ? 'active' : '' }, ['Linear']);
    const logBtn = el('button', { class: ax.scale === 'log' ? 'active' : '' }, ['Log']);
    const setScale = (s: Scale) => {
      store.history.run(() => { ax.scale = s; });
      render();
      store.emitStructure();
    };
    linBtn.addEventListener('click', () => setScale('linear'));
    logBtn.addEventListener('click', () => setScale('log'));

    const v1 = numInput(ax.v1, (v) => { ax.v1 = v; store.emitStructure(); });
    const v2 = numInput(ax.v2, (v) => { ax.v2 = v; store.emitStructure(); });
    for (const inp of [v1, v2]) {
      inp.addEventListener('focus', () => store.history.begin());
      inp.addEventListener('blur', () => store.history.commit());
    }

    const warn = ax.scale === 'log' && (ax.v1 <= 0 || ax.v2 <= 0)
      ? el('span', { class: 'badge warn' }, ['log needs > 0'])
      : !isAxisValid(ax)
      ? el('span', { class: 'badge warn' }, ['incomplete'])
      : el('span', { class: 'badge ok' }, ['ok']);

    const dot1 = el('span', { class: 'swatch', style: { background: color } });
    const dot2 = el('span', { class: 'swatch', style: { background: color } });

    return el('div', { class: 'axis-block' }, [
      el('div', { class: 'axis-title' }, [
        lineColor,
        `${axis.toUpperCase()} axis`,
        warn,
      ]),
      el('div', { class: 'field' }, [el('label', {}, ['Label']), labelInput]),
      el('div', { class: 'field' }, [
        el('label', {}, ['Scale']),
        el('div', { class: 'seg' }, [linBtn, logBtn]),
      ]),
      el('div', { class: 'row' }, [
        el('div', { class: 'field grow' }, [el('label', {}, [dot1, ` ${axis}1 value`]), v1]),
        el('div', { class: 'field grow' }, [el('label', {}, [dot2, ` ${axis}2 value`]), v2]),
      ]),
      ...tickRows(axis, ax),
    ]);
  }

  /** Tick-generation controls for one axis (gridline/readout placement). */
  function tickRows(axis: 'x' | 'y', ax: AxisCal): HTMLElement[] {
    const cfg: TickConfig = ax.ticks ?? { mode: 'auto' };

    const opt = (v: TickConfig['mode'], label: string): HTMLOptionElement => {
      const o = el('option', { value: v }, [label]) as HTMLOptionElement;
      if (cfg.mode === v) o.selected = true;
      return o;
    };
    const modeSel = el('select', {}, [
      opt('auto', 'Auto'),
      opt('step', 'Even step'),
      opt('list', 'Custom list'),
    ]) as HTMLSelectElement;
    modeSel.addEventListener('change', () => {
      const m = modeSel.value as TickConfig['mode'];
      store.history.run(() => {
        ax.ticks = m === 'auto' ? { mode: 'auto' } : { ...cfg, mode: m };
        if (m !== 'auto') store.state.overlay.gridlines = true; // show the effect
      });
      modeSel.blur(); // let the panel rebuild past the focus guard
      render();
      store.emitStructure();
    });

    const rows: HTMLElement[] = [
      el('div', { class: 'ctl' }, [
        el('span', { class: 'ctl-label' }, ['Ticks']),
        modeSel,
        help('How gridlines & readout ticks are placed. Auto: decade/nice-step. Even step: a major every N units split into M minors. Custom list: type the values. Editing turns on the gridline overlay so you can see the change.'),
      ]),
    ];

    // live field that writes into ax.ticks (creating it if needed)
    const writeField = (
      type: 'number' | 'text', value: string, placeholder: string,
      apply: (cfg: TickConfig, raw: string) => void,
    ): HTMLInputElement => {
      const inp = el('input', { type, value, placeholder, step: type === 'number' ? 'any' : undefined }) as HTMLInputElement;
      inp.addEventListener('focus', () => store.history.begin());
      inp.addEventListener('input', () => {
        if (!ax.ticks || ax.ticks.mode === 'auto') ax.ticks = { mode: cfg.mode };
        apply(ax.ticks, inp.value);
        store.state.overlay.gridlines = true; // ensure the change is visible
        store.emitRender();
      });
      inp.addEventListener('blur', () => store.history.commit());
      return inp;
    };

    if (cfg.mode === 'step') {
      const stepIn = writeField('number', cfg.majorStep != null ? String(cfg.majorStep) : '', 'major step, e.g. 10',
        (c, raw) => { const v = parseFloat(raw); c.majorStep = Number.isFinite(v) ? v : undefined; });
      const divIn = writeField('number', cfg.minorDivs != null ? String(cfg.minorDivs) : '', 'minor ÷, e.g. 5',
        (c, raw) => { const v = parseInt(raw, 10); c.minorDivs = Number.isFinite(v) ? v : undefined; });
      rows.push(el('div', { class: 'row' }, [
        el('div', { class: 'field grow' }, [el('label', {}, ['Major step']), stepIn]),
        el('div', { class: 'field grow' }, [el('label', {}, ['Minor ÷']), divIn]),
      ]));
    } else if (cfg.mode === 'list') {
      const majIn = writeField('text', cfg.majors ?? '', 'majors, e.g. 1, 2, 5, 10',
        (c, raw) => { c.majors = raw; });
      const minIn = writeField('text', cfg.minors ?? '', 'minors, e.g. 3, 4, 6, 7, 8, 9',
        (c, raw) => { c.minors = raw; });
      rows.push(el('div', { class: 'field' }, [el('label', {}, ['Major values']), majIn]));
      rows.push(el('div', { class: 'field' }, [el('label', {}, ['Minor values']), minIn]));
    }
    return rows;
  }

  function render(): void {
    panel.setDone(isCalibrated(store.state.calibration));
    panel.renderBody(() => {
      if (!store.hasImage()) {
        return [el('div', { class: 'hint' }, ['Load an image first.'])];
      }
      const o = store.state.overlay;
      return [
        axisBlock('x'),
        axisBlock('y'),
        stepper({
          label: 'Axis line thickness', unit: '×', value: o.refWidth || 1,
          min: 0.5, max: 4, step: 0.25, defaultValue: 1,
          onInput: (v) => { o.refWidth = v; store.emitRender(); },
        }),
      ];
    });
  }

  store.onStructure(render);
  render();
  return panel.root;
}

function numInput(value: number, onChange: (v: number) => void): HTMLInputElement {
  const input = el('input', {
    type: 'number', value: Number.isFinite(value) ? String(value) : '', step: 'any',
    placeholder: 'tick value',
  }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) onChange(v);
  });
  return input;
}
