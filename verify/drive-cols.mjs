// Verify the panel reflow: widening the sidebar packs panels into more columns
// and reduces vertical scroll height. Also checks steppers + de-cluttering.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.argv[2] || 'http://localhost:5173/';
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--hide-scrollbars', '--remote-debugging-port=9339', '--window-size=1600,900', 'about:blank']);
let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => { const i = ++id; return new Promise((r) => { pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1 }); };
async function connect() { for (let i = 0; i < 40; i++) { try { const t = await (await fetch('http://localhost:9339/json')).json(); const p = t.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const setW = (w) => evl(`document.documentElement.style.setProperty('--sidebar-w','${w}px'); true`);
const metrics = () => evl(`(()=>{const sb=document.querySelector('#sidebar');const cols=[...document.querySelectorAll('.sidebar-cols .panel')];const lefts=new Set(cols.map(p=>Math.round(p.offsetLeft)));return{scrollH:sb.scrollHeight,clientH:sb.clientHeight,columns:lefts.size}})()`);

async function main() {
  ws = new WebSocket(await connect());
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL }); await sleep(1800);
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Try sample')).click(); true`);
  await sleep(1400);
  // trace a couple of points so the Curves panel has the node editor etc.
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('Trace')).click(); true`);
  const r = await evl(`(()=>{const b=document.querySelector('#stage').getBoundingClientRect();return{x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  for (const [fx, fy] of [[0.35, 0.5], [0.55, 0.42], [0.7, 0.48]]) { await click(r.x + r.w * fx, r.y + r.h * fy); await sleep(80); }
  // expand the export panel so there's plenty of content
  await evl(`(()=>{const h=[...document.querySelectorAll('.panel-head')].find(x=>/Export data/.test(x.textContent));if(h&&h.parentElement.classList.contains('collapsed'))h.click();return true})()`);
  await sleep(200);

  await setW(360); await sleep(200);
  const narrow = await metrics();
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('verify/app-cols-narrow.png', Buffer.from(shot.result.data, 'base64'));

  await setW(820); await sleep(250);
  const wide = await metrics();
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('verify/app-cols-wide.png', Buffer.from(shot.result.data, 'base64'));

  // steppers + de-clutter checks
  const steppers = await evl(`document.querySelectorAll('input.stepper').length`);
  const resets = await evl(`[...document.querySelectorAll('#sidebar button.icon')].filter(b=>b.textContent==='↺').length`);
  const calibInstruction = await evl(`/Drag each guide line/.test(document.querySelector('#sidebar').textContent)`);

  console.log(JSON.stringify({
    narrow, wide,
    scrollReduced: wide.scrollH < narrow.scrollH,
    steppers, resets, calibInstruction,
  }, null, 2));
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
