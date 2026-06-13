import { clear, el } from '../util/dom';

export interface PanelHandle {
  root: HTMLElement;
  body: HTMLElement;
  /** Re-render the body unless the user is currently typing inside it. */
  renderBody(build: () => (Node | string | null | false)[]): void;
  setDone(done: boolean): void;
}

export function makePanel(opts: {
  step?: string;
  title: string;
  collapsed?: boolean;
}): PanelHandle {
  const body = el('div', { class: 'panel-body' });
  const chev = el('span', { class: 'chev' }, ['▾']);
  const stepEl = opts.step ? el('span', { class: 'step' }, [opts.step]) : null;
  const head = el('div', { class: 'panel-head' }, [
    stepEl as Node,
    el('span', {}, [opts.title]),
    chev,
  ]);
  const root = el('div', { class: 'panel' + (opts.collapsed ? ' collapsed' : '') }, [head, body]);
  head.addEventListener('click', () => root.classList.toggle('collapsed'));

  return {
    root,
    body,
    renderBody(build) {
      // Don't interrupt the user mid-edit — but only an *editable* field counts.
      // A just-clicked <button> is also document.activeElement, and bailing on it
      // would suppress the repaint that reflects the click (toggles, show/hide…).
      const ae = document.activeElement as HTMLElement | null;
      if (ae && body.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
      clear(body);
      for (const c of build()) {
        if (c == null || c === false) continue;
        body.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    },
    setDone(done) {
      root.classList.toggle('done', done);
    },
  };
}
