import { Store, emptyProject } from '../src/state/store';
import { Stage } from '../src/render/stage';
import { loadImageElement, readAsDataURL } from '../src/io/imageInput';
import { dataToPixel } from '../src/model/calibration';
import { recomputeHandles } from '../src/model/bezier';
import { seriesDataPolyline, crossingsAtX } from '../src/model/sampling';
import sampleUrl from '../src/assets/sample-plot.png';

const log = (s: string) => ((document.getElementById('log') as HTMLElement).textContent = s);

/** Find the printed axis frame (outer box) via dark-pixel column/row profiles. */
function detectFrame(img: HTMLImageElement) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const W = c.width;
  const H = c.height;
  const dark = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2] < 110 ? 1 : 0;
  };
  const colDark = new Array<number>(W).fill(0);
  const rowDark = new Array<number>(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = dark(x, y);
    colDark[x] += d;
    rowDark[y] += d;
  }
  let left = -1, right = -1, top = -1, bottom = -1;
  for (let x = 0; x < W; x++) if (colDark[x] > 0.6 * H) { if (left < 0) left = x; right = x; }
  for (let y = 0; y < H; y++) if (rowDark[y] > 0.6 * W) { if (top < 0) top = y; bottom = y; }
  return { left, right, top, bottom, W, H };
}

async function run() {
  const store = new Store(emptyProject());
  const stage = new Stage(store, {
    stage: document.getElementById('stage') as HTMLElement,
    canvas: document.getElementById('stage-canvas') as HTMLCanvasElement,
    svg: document.getElementById('stage-svg') as unknown as SVGSVGElement,
    loupe: document.getElementById('loupe') as HTMLCanvasElement,
  });

  const res = await fetch(sampleUrl);
  const dataUrl = await readAsDataURL(await res.blob());
  const img = await loadImageElement(dataUrl);

  store.state.image = { dataUrl, name: 'sample', naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
  const f = detectFrame(img);

  // Sample plot: frame edges correspond to x∈[1,100] log, y∈[50,500] log.
  const cal = store.state.calibration;
  cal.xLabel = 'Ic'; cal.yLabel = 'hFE';
  cal.x = { p1: f.left, v1: 1, p2: f.right, v2: 100, scale: 'log' };
  cal.y = { p1: f.bottom, v1: 50, p2: f.top, v2: 500, scale: 'log' };

  // Recreate the curve from eyeballed (x, hFE) readings -> place anchors in pixel space.
  const readings: [number, number][] = [
    [1, 85], [2, 150], [4, 205], [10, 290], [22, 315], [50, 285], [100, 205],
  ];
  const s = store.addSeries('hFE');
  s.color = '#ff3b30';
  s.trace.anchors = readings.map(([x, y]) => {
    const px = dataToPixel(cal, { x, y });
    return { x: px.x, y: px.y, mode: 'auto' as const };
  });
  recomputeHandles(s.trace.anchors);

  store.state.overlay = { gridlines: true, reconstruction: true, opacity: 0.95 };

  stage.setImage(img);
  store.emitStructure();

  // sanity readout: y at x=10 should be ~290
  const poly = seriesDataPolyline(s, cal);
  const yAt10 = crossingsAtX(poly, 10)[0];
  log(
    `frame L${f.left} R${f.right} T${f.top} B${f.bottom} (${f.W}x${f.H})\n` +
    `y@x=10 = ${yAt10?.toFixed(1)}  (expect ~290)`,
  );
  (window as any).__verify = { frame: f, yAt10 };
  document.title = 'verify-ready';
}

run().catch((e) => log('ERROR: ' + (e?.message ?? e)));
