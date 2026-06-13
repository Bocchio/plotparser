import { el } from '../util/dom';
import { icon } from './icons';

export interface StepperOpts {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
  /** history hooks (optional — overlay/display settings aren't undoable) */
  onBegin?: () => void;
  onInput: (v: number) => void;
  onCommit?: () => void;
}

/**
 * Compact numeric stepper: a value field flanked by custom −/+ buttons, a reset
 * button, and mouse-wheel support while hovering. No native spin arrows.
 */
export function stepper(o: StepperOpts): HTMLElement {
  const decimals = (String(o.step).split('.')[1] || '').length;
  const fmt = (v: number) => (decimals ? v.toFixed(decimals) : String(v));

  const input = el('input', {
    class: 'stepper', type: 'number',
    min: String(o.min), max: String(o.max), step: String(o.step), value: fmt(o.value),
  }) as HTMLInputElement;

  const clamp = (v: number) => Math.max(o.min, Math.min(o.max, v));
  let committing = false;
  const set = (v: number, commit = false) => {
    const nv = clamp(parseFloat(v.toFixed(6)));
    input.value = fmt(nv);
    o.onInput(nv);
    if (commit && !committing) o.onCommit?.();
  };
  const nudge = (dir: number) => {
    o.onBegin?.();
    set((parseFloat(input.value) || o.defaultValue) + dir * o.step, true);
  };

  input.addEventListener('focus', () => { committing = true; o.onBegin?.(); });
  input.addEventListener('input', () => { const v = parseFloat(input.value); if (Number.isFinite(v)) o.onInput(clamp(v)); });
  input.addEventListener('blur', () => { committing = false; const v = parseFloat(input.value); set(Number.isFinite(v) ? v : o.defaultValue, true); });

  const minus = el('button', { class: 'step-btn', title: `−${o.step}`, tabindex: '-1' }, [icon('minus', 14)]);
  const plus = el('button', { class: 'step-btn', title: `+${o.step}`, tabindex: '-1' }, [icon('plus', 14)]);
  minus.addEventListener('click', () => nudge(-1));
  plus.addEventListener('click', () => nudge(1));

  const reset = el('button', { class: 'step-btn', title: `Reset to ${fmt(o.defaultValue)}${o.unit ? ' ' + o.unit : ''}`, tabindex: '-1' }, [icon('reset', 14)]);
  reset.addEventListener('click', () => { o.onBegin?.(); set(o.defaultValue, true); });

  const box = el('div', { class: 'stepper-box' }, [minus, input, plus]);
  const row = el('div', { class: 'ctl stepper-row' }, [
    el('span', { class: 'ctl-label' }, [o.unit ? `${o.label} (${o.unit})` : o.label]),
    box,
    reset,
  ]);

  // wheel anywhere over the control adjusts the value
  row.addEventListener('wheel', (e) => {
    e.preventDefault();
    o.onBegin?.();
    set((parseFloat(input.value) || o.defaultValue) - Math.sign(e.deltaY) * o.step, true);
  }, { passive: false });

  return row;
}
