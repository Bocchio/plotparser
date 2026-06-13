// Verify the UX pass: resizable sidebar, image opacity + backdrop, gridline
// colour, tick-edit auto-shows grid, export sampling modes + scatter marks,
// and the delete-modifier cursor.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.argv[2] || 'http://localhost:5173/';
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--hide-scrollbars', '--remote-debugging-port=9338', '--window-size=1500,900', 'about:blank']);
let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => { const i = ++id; return new Promise((r) => { pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: 1, clickCount: 1 });
const click = async (x, y) => { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
async function connect() { for (let i = 0; i < 40; i++) { try { const t = await (await fetch('http://localhost:9338/json')).json(); const p = t.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const setNum = (b, i, v) => evl(`(()=>{const x=document.querySelectorAll('.axis-block')[${b}].querySelectorAll('input[type=number]')[${i}];x.focus();x.value='${v}';x.dispatchEvent(new Event('input',{bubbles:true}));x.blur();return true})()`);

async function main() {
  ws = new WebSocket(await connect());
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL }); await sleep(1800);
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Try sample')).click(); true`);
  await sleep(1400);

  // calibrate (log)
  await evl(`(()=>{document.querySelectorAll('.axis-block').forEach(b=>{[...b.querySelectorAll('.seg button')].find(x=>x.textContent==='Log').click();});return true})()`);
  await sleep(120);
  await setNum(0, 0, 1); await setNum(0, 1, 100); await setNum(1, 0, 50); await setNum(1, 1, 500); await sleep(150);

  // trace a curve
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('Trace')).click(); true`);
  const r = await evl(`(()=>{const b=document.querySelector('#stage').getBoundingClientRect();return{x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  for (const [fx, fy] of [[0.30, 0.55], [0.45, 0.42], [0.60, 0.40], [0.72, 0.48]]) { await click(r.x + r.w * fx, r.y + r.h * fy); await sleep(80); }

  // 1) sidebar resize (drag the divider left -> wider)
  const wBefore = await evl(`getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim()`);
  const rz = await evl(`(()=>{const e=document.querySelector('#sidebar-resizer');const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rz.x, y: rz.y, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rz.x - 120, y: rz.y, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rz.x - 120, y: rz.y, button: 'left', buttons: 1 });
  await sleep(150);
  const wAfter = await evl(`getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim()`);

  // 2) image opacity slider (first range in the Display panel)
  await evl(`(()=>{const p=document.querySelectorAll('#sidebar .panel')[3];const rng=p.querySelector('input[type=range]');rng.value='0.35';rng.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await sleep(120);
  const imgOpacity = await evl(`window.plotparser.store.state.overlay.imageOpacity`);

  // 3) gridline colour change
  await evl(`(()=>{const p=document.querySelectorAll('#sidebar .panel')[3];const cols=p.querySelectorAll('input[type=color]');const grid=cols[cols.length-1];grid.value='#ff3b30';grid.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await sleep(100);
  const gridColor = await evl(`window.plotparser.store.state.overlay.gridColor`);

  // 4) custom tick list on X -> should auto-enable gridlines (majors input is the
  // first text field *after* the axis Label, i.e. index 1 in list mode)
  await evl(`(()=>{const sel=document.querySelectorAll('.axis-block')[0].querySelector('select');sel.value='list';sel.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await sleep(150);
  await evl(`(()=>{const b=document.querySelectorAll('.axis-block')[0];const maj=b.querySelectorAll('input[type=text]')[1];maj.focus();maj.value='1, 10, 100';maj.dispatchEvent(new Event('input',{bubbles:true}));maj.blur();return true})()`);
  await sleep(150);
  const gridlinesOn = await evl(`window.plotparser.store.state.overlay.gridlines`);
  const tickMajors = await evl(`window.plotparser.store.state.calibration.x.ticks.majors`);
  // reset X ticks to auto so the xticks export below has many positions
  await evl(`(()=>{const sel=document.querySelectorAll('.axis-block')[0].querySelector('select');sel.value='auto';sel.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await sleep(120);

  // 5) export: grid mode marks (within curve extent) + xticks row count
  await evl(`(()=>{const heads=[...document.querySelectorAll('.panel-head')];const h=heads.find(x=>/Export data/.test(x.textContent));if(h&&h.parentElement.classList.contains('collapsed'))h.click();return true})()`);
  await sleep(200);
  await evl(`(()=>{const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Export data/.test(x.textContent));const cb=[...p.querySelectorAll('input[type=checkbox]')].find(c=>/sample points/i.test(c.parentElement.textContent));cb.click();return true})()`);
  await sleep(200);
  const marksGrid = await evl(`window.plotparser.store.exportMarks.length`);
  await evl(`(()=>{const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Export data/.test(x.textContent));const sel=p.querySelector('select');sel.value='xticks';sel.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await sleep(200);
  const exportMarks = await evl(`window.plotparser.store.exportMarks.length`);
  const exportRows = await evl(`(()=>{const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Export data/.test(x.textContent));return p.querySelectorAll('table.preview tbody tr').length})()`);

  // 6) delete-modifier cursor in trace mode
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('Trace')).click(); true`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
  await sleep(80);
  const modDeleteOn = await evl(`document.querySelector('#stage').classList.contains('mod-delete')`);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
  await sleep(80);
  const modDeleteOff = await evl(`document.querySelector('#stage').classList.contains('mod-delete')`);

  await send('Page.bringToFront', {});
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('verify/app-ux.png', Buffer.from(shot.result.data, 'base64'));

  console.log(JSON.stringify({
    wBefore, wAfter, imgOpacity, gridColor, gridlinesOn, tickMajors, marksGrid, exportMarks, exportRows, modDeleteOn, modDeleteOff,
  }, null, 2));
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
