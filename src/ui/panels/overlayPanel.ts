import type { AppContext } from '../context';
import { makePanel } from '../panel';
import { el, help } from '../../util/dom';
import { stepper } from '../controls';

export function overlayPanel(ctx: AppContext): HTMLElement {
  const { store } = ctx;
  const panel = makePanel({ step: '3', title: 'Display & verify', collapsed: false });

  const checkbox = (checked: boolean, onChange: (v: boolean) => void): HTMLInputElement => {
    const cb = el('input', { type: 'checkbox', checked }) as HTMLInputElement;
    cb.addEventListener('change', () => { onChange(cb.checked); store.emitRender(); });
    return cb;
  };
  const color = (value: string, onChange: (v: string) => void): HTMLInputElement => {
    const c = el('input', { class: 'mini', type: 'color', value }) as HTMLInputElement;
    c.addEventListener('input', () => { onChange(c.value); store.emitRender(); });
    return c;
  };
  const slider = (
    label: string, value: number, min: string, max: string, step: string,
    unit: (v: number) => string, onChange: (v: number) => void,
  ): HTMLElement => {
    const lab = el('span', { class: 'ctl-label' }, [`${label} — ${unit(value)}`]);
    const r = el('input', { type: 'range', min, max, step, value: String(value) }) as HTMLInputElement;
    r.addEventListener('input', () => {
      const v = parseFloat(r.value);
      lab.textContent = `${label} — ${unit(v)}`;
      onChange(v);
      store.emitRender();
    });
    return el('div', { class: 'ctl' }, [lab, r]);
  };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const hr = () => el('hr', { style: { border: 'none', borderTop: '1px solid var(--line)', width: '100%', margin: '2px 0' } });
  const toggleRow = (cb: HTMLInputElement, text: string, ...trailing: (Node | string)[]) =>
    el('div', { class: 'ctl' }, [
      el('label', { class: 'row', style: { flex: '1', color: 'var(--text)' } }, [cb, ` ${text}`]),
      ...trailing,
    ]);

  function render(): void {
    panel.renderBody(() => {
      const o = store.state.overlay;
      const sub = (cb: HTMLInputElement, text: string) =>
        el('label', { class: 'row', style: { color: 'var(--text)', marginLeft: '20px' } }, [cb, ` ${text}`]);

      return [
        slider('Image opacity', o.imageOpacity, '0', '1', '0.05', pct, (v) => (o.imageOpacity = v)),
        el('div', { class: 'ctl' }, [
          el('span', { class: 'ctl-label' }, ['Backdrop']),
          color(o.backdrop, (v) => (o.backdrop = v)),
          help('Solid colour drawn behind the image, so lowering image opacity fades to this instead of the checkerboard.'),
        ]),
        hr(),
        toggleRow(
          checkbox(o.gridlines, (v) => (o.gridlines = v)),
          'Calibration gridlines',
          color(o.gridColor, (v) => (o.gridColor = v)),
        ),
        sub(checkbox(o.minorGrid, (v) => (o.minorGrid = v)), 'Minor lines'),
        sub(checkbox(o.gridClip, (v) => (o.gridClip = v)), 'Only inside plot area'),
        stepper({
          label: 'Grid thickness', unit: '×', value: o.gridWidth || 1,
          min: 0.5, max: 4, step: 0.25, defaultValue: 1,
          onInput: (v) => { o.gridWidth = v; store.emitRender(); },
        }),
        toggleRow(
          checkbox(o.reconstruction, (v) => (o.reconstruction = v)),
          'Recreated curve + readouts',
        ),
        slider('Overlay opacity', o.opacity, '0', '1', '0.05', pct, (v) => (o.opacity = v)),
      ];
    });
  }

  store.onStructure(render);
  render();
  return panel.root;
}
