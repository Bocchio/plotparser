// Standalone correctness checks for the numeric core. Run via esbuild + node.
import {
  axisPixelToValue,
  axisValueToPixel,
  pixelToData,
  dataToPixel,
  logTicks,
  linearTicks,
} from '../src/model/calibration';
import { sampleBezier, recomputeHandles } from '../src/model/bezier';
import { crossingsAtX, crossingsAtY, gridValues } from '../src/model/sampling';
import type { AxisCal, Calibration, BezierAnchor } from '../src/state/types';

let failures = 0;
function ok(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * (1 + Math.abs(b));

// ---- log axis: pixel <-> value ----
const xLog: AxisCal = { p1: 100, v1: 1, p2: 700, v2: 100, scale: 'log' };
ok('log midpoint -> geo mean', near(axisPixelToValue(xLog, 400), 10), `got ${axisPixelToValue(xLog, 400)}`);
ok('log value->pixel(10) = mid', near(axisValueToPixel(xLog, 10), 400), `got ${axisValueToPixel(xLog, 10)}`);
ok('log endpoints', near(axisPixelToValue(xLog, 100), 1) && near(axisPixelToValue(xLog, 700), 100));
ok('log roundtrip', near(axisValueToPixel(xLog, axisPixelToValue(xLog, 555)), 555));

// y log, inverted pixels (image y grows downward)
const yLog: AxisCal = { p1: 500, v1: 50, p2: 50, v2: 500, scale: 'log' };
ok('y log mid -> geo mean(50,500)', near(axisPixelToValue(yLog, 275), Math.sqrt(50 * 500)), `got ${axisPixelToValue(yLog, 275)}`);

// ---- linear axis ----
const xLin: AxisCal = { p1: 0, v1: 0, p2: 200, v2: 10, scale: 'linear' };
ok('linear mid', near(axisPixelToValue(xLin, 100), 5));
ok('linear value->pixel', near(axisValueToPixel(xLin, 7.5), 150));

// ---- combined pixel<->data roundtrip ----
const cal: Calibration = { x: xLog, y: yLog, xLabel: 'Ic', yLabel: 'hFE' };
const d = pixelToData(cal, { x: 400, y: 275 });
ok('pixelToData x', near(d.x, 10));
const p = dataToPixel(cal, d);
ok('dataToPixel roundtrip', near(p.x, 400) && near(p.y, 275));

// ---- ticks ----
const lt = logTicks(1, 100);
ok('logTicks count (1..100)', lt.length === 19, `got ${lt.length}`); // 1..9,10..90,100
ok('logTicks majors', lt.filter((t) => t.major).map((t) => t.value).join(',') === '1,2,3,5,7,10,20,30,50,70,100');
const lin = linearTicks(0, 10);
ok('linearTicks spans range', lin[0].value <= 0 + 1e-9 && lin[lin.length - 1].value >= 10 - 1e-9);

// ---- gridValues ----
const gv = gridValues({ min: 1, max: 100, count: 3, spacing: 'log' });
ok('gridValues log', near(gv[0], 1) && near(gv[1], 10) && near(gv[2], 100), gv.join(','));
const gvl = gridValues({ min: 0, max: 10, count: 5, spacing: 'linear' });
ok('gridValues linear', gvl.join(',') === '0,2.5,5,7.5,10');

// ---- bezier sampling + crossings ----
const anchors: BezierAnchor[] = [
  { x: 0, y: 0, mode: 'auto' },
  { x: 100, y: 100, mode: 'auto' },
  { x: 200, y: 0, mode: 'auto' },
];
recomputeHandles(anchors);
const poly = sampleBezier(anchors, 40);
ok('sampleBezier endpoints', near(poly[0].x, 0) && near(poly[poly.length - 1].x, 200));
const cx = crossingsAtX(poly, 100);
ok('crossingsAtX peak ~100', cx.length >= 1 && cx[0] > 80, `y=${cx[0]}`);
const cy = crossingsAtY(poly, 50);
ok('crossingsAtY two crossings', cy.length === 2, `xs=${cy.join(',')}`);

console.log(failures === 0 ? '\nALL MATH TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
