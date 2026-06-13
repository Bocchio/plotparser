import type { AppContext } from './context';
import type { Tool } from '../state/types';
import { el } from '../util/dom';
import { icon } from './icons';

export function setupToolbar(root: HTMLElement, ctx: AppContext): void {
  const { store, stage } = ctx;
  const stageEl = document.getElementById('stage')!;

  const brand = el('span', { class: 'brand' }, [
    el('span', { class: 'logo' }, [icon('chart', 18)]),
    'PlotParser',
  ]);

  // tool toggle
  const panBtn = el('button', { title: 'Pan / select (V)' }, [icon('pan'), 'Pan']);
  const traceBtn = el('button', { title: 'Trace: click to add points (B)' }, [icon('trace'), 'Trace']);
  const seg = el('div', { class: 'seg' }, [panBtn, traceBtn]);

  function setTool(t: Tool): void {
    store.ui.tool = t;
    panBtn.classList.toggle('active', t === 'pan');
    traceBtn.classList.toggle('active', t === 'trace');
    stageEl.classList.toggle('tool-pan', t === 'pan');
    stageEl.classList.toggle('tool-trace', t === 'trace');
    store.emitStructure();
  }
  panBtn.addEventListener('click', () => setTool('pan'));
  traceBtn.addEventListener('click', () => setTool('trace'));

  const fitBtn = el('button', { class: 'icon', title: 'Fit image to view (F)' }, [icon('fit'), 'Fit']);
  fitBtn.addEventListener('click', () => stage.zoomToFit());

  const undoBtn = el('button', { class: 'icon', title: 'Undo (Ctrl/⌘+Z)' }, [icon('undo')]);
  undoBtn.addEventListener('click', () => { store.history.undo(); });
  const redoBtn = el('button', { class: 'icon', title: 'Redo (Ctrl/⌘+Shift+Z)' }, [icon('redo')]);
  redoBtn.addEventListener('click', () => { store.history.redo(); });

  const openImg = el('button', {}, [icon('image'), 'Open image']);
  openImg.addEventListener('click', () => ctx.pickImage());

  const openProj = el('button', {}, [icon('folder'), 'Load project']);
  openProj.addEventListener('click', () => ctx.pickProject());

  const saveProj = el('button', { class: 'primary' }, [icon('save'), 'Save project']);
  saveProj.addEventListener('click', () => ctx.saveProject(true));

  const saveCfg = el('button', { title: 'Save config without the embedded image' }, ['Save config']);
  saveCfg.addEventListener('click', () => ctx.saveProject(false));

  root.append(
    brand,
    seg,
    fitBtn,
    el('div', { class: 'seg' }, [undoBtn, redoBtn]),
    el('span', { class: 'spacer' }),
    openImg,
    openProj,
    saveProj,
    saveCfg,
  );

  setTool('pan');

  // keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return; // let inputs keep native undo/typing

    // undo / redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) store.history.redo();
      else store.history.undo();
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      store.history.redo();
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey) return; // don't shadow other browser shortcuts

    if (e.key === 'v' || e.key === 'V') setTool('pan');
    else if (e.key === 'b' || e.key === 'B') setTool('trace');
    else if (e.key === 'f' || e.key === 'F') stage.zoomToFit();
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (stage.deleteSelected()) e.preventDefault();
    } else if (e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 10 : 1;
      const map: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = map[e.key];
      if (d && (store.ui.selection?.kind === 'anchor' || store.ui.selection?.kind === 'probe')) {
        stage.nudgeSelected(d[0], d[1]);
        e.preventDefault();
      }
    } else if (e.key === 's' || e.key === 'S') {
      if (stage.setSelectedNodeMode('smooth')) e.preventDefault();
    } else if (e.key === 'c' || e.key === 'C') {
      if (stage.setSelectedNodeMode('corner')) e.preventDefault();
    } else if (e.key === 'a' || e.key === 'A') {
      if (stage.setSelectedNodeMode('auto')) e.preventDefault();
    }
  });
}

function isTyping(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
}
