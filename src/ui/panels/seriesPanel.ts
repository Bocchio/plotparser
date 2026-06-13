import type { AppContext } from '../context';
import type { NodeMode, Series } from '../../state/types';
import { makePanel } from '../panel';
import { el, help } from '../../util/dom';
import { icon } from '../icons';
import { stepper } from '../controls';
import { recomputeHandles } from '../../model/bezier';

export function seriesPanel(ctx: AppContext): HTMLElement {
  const { store, stage } = ctx;
  const panel = makePanel({ step: '2', title: 'Curves' });

  function row(s: Series): HTMLElement {
    const active = s.id === store.ui.activeSeriesId;

    const color = el('input', { type: 'color', value: s.color }) as HTMLInputElement;
    color.addEventListener('focus', () => store.history.begin());
    color.addEventListener('input', () => { s.color = color.value; store.emitRender(); });
    color.addEventListener('blur', () => store.history.commit());

    const name = el('input', { class: 'name', type: 'text', value: s.name }) as HTMLInputElement;
    name.addEventListener('focus', () => store.history.begin());
    name.addEventListener('input', () => { s.name = name.value; store.emitRender(); });
    name.addEventListener('blur', () => store.history.commit());

    const vis = el('button', { class: 'icon', title: s.visible ? 'Hide curve' : 'Show curve' }, [icon(s.visible ? 'eye' : 'eyeOff')]);
    vis.addEventListener('click', (e) => {
      e.stopPropagation();
      store.history.run(() => { s.visible = !s.visible; });
      store.emitStructure();
    });

    const del = el('button', { class: 'icon danger', title: 'Delete series' }, [icon('trash')]);
    del.addEventListener('click', (e) => { e.stopPropagation(); store.removeSeries(s.id); });

    const item = el('div', { class: 'series-item' + (active ? ' active' : '') }, [
      color,
      name,
      el('span', { class: 'count' }, [`${s.trace.anchors.length} pts`]),
      vis,
      del,
    ]);
    item.addEventListener('click', () => {
      if (!active) { store.ui.activeSeriesId = s.id; store.emitStructure(); }
    });
    if (active) item.classList.add('active');
    return item;
  }

  function nodeEditor(mode: NodeMode, index: number, total: number): HTMLElement {
    const modeBtn = (m: NodeMode, label: string, title: string): HTMLElement => {
      const b = el('button', { class: mode === m ? 'active' : '', title }, [label]);
      b.addEventListener('click', () => stage.setSelectedNodeMode(m));
      return b;
    };
    const del = el('button', { class: 'danger' }, [icon('trash'), 'Delete node']);
    del.addEventListener('click', () => stage.deleteSelected());
    return el('div', { class: 'node-edit' }, [
      el('div', { class: 'node-title' }, [`Selected node — ${index + 1} / ${total}`]),
      el('div', { class: 'seg' }, [
        modeBtn('auto', '● Auto', 'Handles follow the neighbouring nodes'),
        modeBtn('smooth', '◆ Smooth', 'Symmetric, mirrored handles'),
        modeBtn('corner', '■ Corner', 'Independent handles (sharp cusp)'),
      ]),
      del,
      el('div', { class: 'hint' }, ['Shortcut: ', el('b', {}, ['A']), ' / ', el('b', {}, ['S']), ' / ',
        el('b', {}, ['C']), ' to switch · ', el('b', {}, ['Delete']), ' to remove.']),
    ]);
  }

  function render(): void {
    const active = store.activeSeries();
    panel.setDone(!!active && active.trace.anchors.length >= 2);
    panel.renderBody(() => {
      const out: (Node | string | false)[] = [];

      const add = el('button', {}, [icon('plus'), 'Add series']);
      add.addEventListener('click', () => store.addSeries());
      out.push(el('div', { class: 'row' }, [add]));

      if (store.state.series.length === 0) {
        out.push(el('div', { class: 'hint' }, ['No curves yet.']));
        return out;
      }

      out.push(...store.state.series.map(row));

      if (active) {
        // line width for the active series
        out.push(stepper({
          label: 'Line width', unit: 'px', value: active.width || 2,
          min: 0.5, max: 8, step: 0.5, defaultValue: 2,
          onBegin: () => store.history.begin(),
          onInput: (v) => { active.width = v; store.emitRender(); },
          onCommit: () => store.history.commit(),
        }));

        // per-node editor when a node of this series is selected
        const sel = store.ui.selection;
        if (sel?.kind === 'anchor' && sel.seriesId === active.id && active.trace.anchors[sel.index]) {
          out.push(nodeEditor(active.trace.anchors[sel.index].mode, sel.index, active.trace.anchors.length));
        }

        const clear = el('button', { class: 'danger' }, ['Clear points']);
        clear.addEventListener('click', () => {
          store.history.run(() => { active.trace.anchors = []; });
          store.ui.selection = null;
          store.emitStructure();
        });
        const resmooth = el('button', { title: 'Reset all nodes to auto-smoothed' }, [icon('reset'), 'Re-smooth']);
        resmooth.addEventListener('click', () => {
          store.history.run(() => {
            active.trace.anchors.forEach((a) => (a.mode = 'auto'));
            recomputeHandles(active.trace.anchors);
          });
          store.emitStructure();
        });
        out.push(el('div', { class: 'row' }, [resmooth, clear]));
        out.push(el('div', { class: 'ctl' }, [
          el('span', { class: 'ctl-label' }, [
            'Editing ', el('b', { style: { color: active.color } }, [active.name]),
          ]),
          help(
            'Trace tool: click empty space to append a node; click on the line to insert one. ' +
            'Click a node to select it. Drag nodes/handles to refine (Alt-drag a handle to break symmetry). ' +
            'Delete a node: Ctrl-click it (or Alt/Shift-click), or select + Delete / the button above. ' +
            'Node type — A/S/C or the buttons. Arrows nudge the selection.',
          ),
        ]));
      }
      return out;
    });
  }

  store.onStructure(render);
  render();
  return panel.root;
}
