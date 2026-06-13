import type { AppContext } from './context';
import { clear, el } from '../util/dom';
import { fmt, isAxisValid, isCalibrated, pixelToData } from '../model/calibration';

export function setupStatusbar(root: HTMLElement, ctx: AppContext): void {
  const { store, stage } = ctx;
  const coord = el('span', { class: 'coord' });
  const status = el('span', {});
  const dims = el('span', {});

  function refreshStatic(): void {
    clear(status);
    clear(dims);
    const img = store.state.image;
    if (img.naturalWidth) {
      dims.textContent = `${img.name ? img.name + '  ·  ' : ''}${img.naturalWidth}×${img.naturalHeight}px`;
    }
    if (!store.hasImage()) return;
    const cal = store.state.calibration;
    const xOk = isAxisValid(cal.x);
    const yOk = isAxisValid(cal.y);
    if (isCalibrated(cal)) {
      status.appendChild(el('span', { class: 'badge ok' }, ['calibrated']));
    } else {
      const what = !xOk && !yOk ? 'X & Y' : !xOk ? 'X' : 'Y';
      status.appendChild(el('span', { class: 'badge warn' }, [`set ${what} axis`]));
    }
  }

  stage.onCursor = (imgPt) => {
    clear(coord);
    if (!imgPt) return;
    const cal = store.state.calibration;
    if (isCalibrated(cal)) {
      const d = pixelToData(cal, imgPt);
      coord.append(
        document.createTextNode(`${cal.xLabel}: `),
        el('b', {}, [fmt(d.x)]),
        document.createTextNode(`   ${cal.yLabel}: `),
        el('b', {}, [fmt(d.y)]),
      );
    } else {
      coord.textContent = `px: ${imgPt.x.toFixed(0)}, ${imgPt.y.toFixed(0)}`;
    }
  };

  root.append(coord, el('span', { class: 'grow' }), status, dims);
  store.onStructure(refreshStatic);
  refreshStatic();
}
