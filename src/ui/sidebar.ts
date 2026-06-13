import type { AppContext } from './context';
import { el } from '../util/dom';
import { calibrationPanel } from './panels/calibrationPanel';
import { seriesPanel } from './panels/seriesPanel';
import { overlayPanel } from './panels/overlayPanel';
import { probesPanel } from './panels/probesPanel';
import { exportPanel } from './panels/exportPanel';

const WIDTH_KEY = 'plotparser.sidebarWidth';
const MIN_W = 280;
const MAX_W = 940;

export function setupSidebar(root: HTMLElement, ctx: AppContext): void {
  // Restore a previously chosen width.
  const saved = parseInt(localStorage.getItem(WIDTH_KEY) || '', 10);
  if (Number.isFinite(saved) && saved >= MIN_W && saved <= MAX_W) {
    document.documentElement.style.setProperty('--sidebar-w', `${saved}px`);
  }

  // Draggable divider between the stage and the sidebar.
  const resizer = el('div', { id: 'sidebar-resizer', title: 'Drag to resize — widen for multiple columns' });
  root.parentElement?.insertBefore(resizer, root);
  setupResize(resizer);

  // Panels flow into a multi-column layout: widening the sidebar packs them into
  // 2–3 columns (less vertical scrolling); narrow stays single-column/compact.
  const cols = el('div', { class: 'sidebar-cols' }, [
    calibrationPanel(ctx),
    seriesPanel(ctx),
    overlayPanel(ctx),
    probesPanel(ctx),
    exportPanel(ctx),
  ]);
  root.append(cols);
}

function currentWidth(): number {
  const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10);
  return Number.isFinite(v) ? v : 384;
}

function setupResize(resizer: HTMLElement): void {
  let startX = 0;
  let startW = 0;
  let dragging = false;

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const w = Math.max(MIN_W, Math.min(MAX_W, startW + (startX - e.clientX))); // drag left widens
    document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.classList.remove('col-resizing');
    localStorage.setItem(WIDTH_KEY, String(currentWidth()));
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };

  resizer.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = currentWidth();
    resizer.classList.add('dragging');
    document.body.classList.add('col-resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  });
}
