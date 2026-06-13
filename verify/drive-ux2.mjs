// Verify: icon buttons (no emoji), stepper +/- + wheel, node delete cursor +
// visibility, minor/clip grid toggles, image opacity → 0, export ⟂ visibility, fonts.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.argv[2] || 'http://localhost:5173/';
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--hide-scrollbars', '--remote-debugging-port=9340', '--window-size=1500,900', 'about:blank']);
let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => { const i = ++id; return new Promise((r) => { pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1 }); };
async function connect() { for (let i = 0; i < 40; i++) { try { const t = await (await fetch('http://localhost:9340/json')).json(); const p = t.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const setNum = (b, i, v) => evl(`(()=>{const x=document.querySelectorAll('.axis-block')[${b}].querySelectorAll('input[type=number]:not(.stepper)')[${i}];x.focus();x.value='${v}';x.dispatchEvent(new Event('input',{bubbles:true}));x.blur();return true})()`);

async function main() {
  ws = new WebSocket(await connect());
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL }); await sleep(1800);
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Try sample')).click(); true`);
  await sleep(1400);
  await evl(`(()=>{document.querySelectorAll('.axis-block').forEach(b=>{[...b.querySelectorAll('.seg button')].find(x=>x.textContent==='Log').click();});return true})()`);
  await setNum(0, 0, 1); await setNum(0, 1, 100); await setNum(1, 0, 50); await setNum(1, 1, 500); await sleep(120);
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('Trace')).click(); true`);
  const r = await evl(`(()=>{const b=document.querySelector('#stage').getBoundingClientRect();return{x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  for (const [fx, fy] of [[0.30, 0.55], [0.45, 0.42], [0.60, 0.40], [0.72, 0.48]]) { await click(r.x + r.w * fx, r.y + r.h * fy); await sleep(80); }

  const bodyFont = await evl(`parseFloat(getComputedStyle(document.body).fontSize)`);
  const toolbarSvgs = await evl(`document.querySelectorAll('#toolbar svg.icon-svg').length`);
  const emojiInButtons = await evl(`[...document.querySelectorAll('#toolbar button, #sidebar button')].some(b=>/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2700}-\\u{27BF}\\u2702\\u270f]/u.test(b.textContent))`);

  // stepper: custom buttons + wheel
  const stepBtns = await evl(`document.querySelectorAll('.step-btn').length`);
  const widthBefore = await evl(`(()=>{const row=[...document.querySelectorAll('.stepper-row')].find(x=>/Line width/.test(x.textContent));return row.querySelector('input.stepper').value})()`);
  await evl(`(()=>{const row=[...document.querySelectorAll('.stepper-row')].find(x=>/Line width/.test(x.textContent));row.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));return true})()`);
  await sleep(80);
  const widthAfterWheel = await evl(`(()=>{const row=[...document.querySelectorAll('.stepper-row')].find(x=>/Line width/.test(x.textContent));return row.querySelector('input.stepper').value})()`);

  // nodes: glyphs + delete cursor while modifier held
  const nodeGlyphs = await evl(`document.querySelectorAll('#stage-svg .node-glyph').length`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
  await sleep(80);
  const nodeCursor = await evl(`(()=>{const n=document.querySelector('#stage-svg .node-glyph');return n?getComputedStyle(n).cursor:'?'})()`);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });

  // grid toggles
  await evl(`(()=>{const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Display . verify/.test(x.textContent));const m=[...p.querySelectorAll('label')].find(l=>/Minor lines/.test(l.textContent)).querySelector('input');m.click();return true})()`);
  await sleep(60);
  const minorGrid = await evl(`window.plotparser.store.state.overlay.minorGrid`);
  await evl(`(()=>{const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Display . verify/.test(x.textContent));const m=[...p.querySelectorAll('label')].find(l=>/inside plot area/.test(l.textContent)).querySelector('input');m.click();return true})()`);
  await sleep(60);
  const gridClip = await evl(`window.plotparser.store.state.overlay.gridClip`);

  // image opacity to 0
  await evl(`(()=>{const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Display . verify/.test(x.textContent));const rng=p.querySelector('input[type=range]');rng.value='0';rng.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await sleep(60);
  const imgOpacity = await evl(`window.plotparser.store.state.overlay.imageOpacity`);

  // export decoupled from visibility: hide the series, then export still has it
  await evl(`(()=>{const it=document.querySelector('.series-item');const b=[...it.querySelectorAll('button.icon')][0];b.click();return true})()`); // hide
  await sleep(100);
  const seriesVisible = await evl(`window.plotparser.store.state.series[0].visible`);
  await evl(`(()=>{const h=[...document.querySelectorAll('.panel-head')].find(x=>/Export data/.test(x.textContent));if(h.parentElement.classList.contains('collapsed'))h.click();return true})()`);
  await sleep(150);
  await evl(`(()=>{const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Export data/.test(x.textContent));const cb=[...p.querySelectorAll('input[type=checkbox]')].find(c=>/sample points/i.test(c.parentElement.textContent));cb.click();return true})()`);
  await sleep(150);
  const exportMarksWhileHidden = await evl(`window.plotparser.store.exportMarks.length`);
  const exportRowsWhileHidden = await evl(`(()=>{const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Export data/.test(x.textContent));return p.querySelectorAll('table.preview tbody tr').length})()`);

  await send('Page.bringToFront', {});
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('verify/app-ux2.png', Buffer.from(shot.result.data, 'base64'));

  console.log(JSON.stringify({
    bodyFont, toolbarSvgs, emojiInButtons, stepBtns, widthBefore, widthAfterWheel,
    nodeGlyphs, nodeCursor: String(nodeCursor).slice(0, 24), minorGrid, gridClip, imgOpacity,
    seriesVisible, exportMarksWhileHidden, exportRowsWhileHidden,
  }, null, 2));
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
