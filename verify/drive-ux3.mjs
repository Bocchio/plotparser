// Verify: image controls moved to drop hint, Image panel removed, status-bar
// shows the name, export "Sample at" is inline, Points stepper exists.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.argv[2] || 'http://localhost:5173/';
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--hide-scrollbars', '--remote-debugging-port=9341', '--window-size=1500,900', 'about:blank']);
let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => { const i = ++id; return new Promise((r) => { pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
async function connect() { for (let i = 0; i < 40; i++) { try { const t = await (await fetch('http://localhost:9341/json')).json(); const p = t.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }

async function main() {
  ws = new WebSocket(await connect());
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL }); await sleep(1800);

  // empty state: drop-hint actions
  const dropButtons = await evl(`[...document.querySelectorAll('#drop-hint .drop-actions button')].map(b=>b.textContent.trim())`);
  const shotEmpty = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('verify/app-empty.png', Buffer.from(shotEmpty.result.data, 'base64'));

  // load via the drop-hint "Try sample"
  await evl(`[...document.querySelectorAll('#drop-hint .drop-actions button')].find(b=>/Try sample/.test(b.textContent)).click(); true`);
  await sleep(1500);

  const panels = await evl(`[...document.querySelectorAll('#sidebar .panel .panel-head')].map(h=>h.textContent.replace(/\\s+/g,' ').trim())`);
  const firstStep = await evl(`document.querySelector('#sidebar .panel .step')?.textContent`);
  const hasImagePanel = await evl(`[...document.querySelectorAll('#sidebar .panel-head')].some(h=>/^.?\\s*Image\\b/.test(h.textContent))`);
  const statusbar = await evl(`document.querySelector('#statusbar').textContent`);

  // calibrate + trace so the export panel actually renders its controls
  await evl(`(()=>{document.querySelectorAll('.axis-block').forEach(b=>{[...b.querySelectorAll('.seg button')].find(x=>x.textContent==='Log').click();});return true})()`);
  const setNum = (b, i, v) => evl(`(()=>{const x=document.querySelectorAll('.axis-block')[${b}].querySelectorAll('input[type=number]:not(.stepper)')[${i}];x.focus();x.value='${v}';x.dispatchEvent(new Event('input',{bubbles:true}));x.blur();return true})()`);
  await setNum(0, 0, 1); await setNum(0, 1, 100); await setNum(1, 0, 50); await setNum(1, 1, 500); await sleep(120);
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('Trace')).click(); true`);
  const r = await evl(`(()=>{const b=document.querySelector('#stage').getBoundingClientRect();return{x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  for (const [fx, fy] of [[0.35, 0.5], [0.55, 0.42], [0.7, 0.48]]) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x + r.w * fx, y: r.y + r.h * fy, button: 'left', buttons: 1, clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x + r.w * fx, y: r.y + r.h * fy, button: 'left', buttons: 1, clickCount: 1 }); await sleep(80); }

  // export panel: expand, check Sample-at inline + Points stepper
  await evl(`(()=>{const h=[...document.querySelectorAll('.panel-head')].find(x=>/Export data/.test(x.textContent));if(h.parentElement.classList.contains('collapsed'))h.click();return true})()`);
  await sleep(200);
  const sampleAtInline = await evl(`(()=>{
    const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Export data/.test(x.textContent));
    const lab=[...p.querySelectorAll('.ctl-label')].find(s=>/Sample at/.test(s.textContent));
    const sel=p.querySelector('select');
    if(!lab||!sel)return null;
    const a=lab.getBoundingClientRect(), b=sel.getBoundingClientRect();
    return {sameLine: Math.abs(a.top-b.top)<6, labelLines: lab.getClientRects().length, selWidth: Math.round(b.width)};
  })()`);
  const pointsStepper = await evl(`(()=>{const p=[...document.querySelectorAll('#sidebar .panel')].find(x=>/Export data/.test(x.textContent));return [...p.querySelectorAll('.stepper-row')].some(r=>/Points/.test(r.textContent))})()`);

  await send('Page.bringToFront', {});
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('verify/app-ux3.png', Buffer.from(shot.result.data, 'base64'));

  console.log(JSON.stringify({ dropButtons, panels, firstStep, hasImagePanel, statusbarHasName: /sample-plot\.png/.test(statusbar), sampleAtInline, pointsStepper }, null, 2));
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
