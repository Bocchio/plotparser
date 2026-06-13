// Capture the magnifier mid-drag to confirm it centres on the dragged node
// and renders the curve inside it.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.argv[2] || 'http://localhost:5173/';
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9335', '--window-size=1400,860', 'about:blank']);
let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => { const i = ++id; return new Promise((r) => { pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: 1, clickCount: 1 });
async function connect() { for (let i = 0; i < 40; i++) { try { const t = await (await fetch('http://localhost:9335/json')).json(); const p = t.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }

async function main() {
  ws = new WebSocket(await connect());
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL }); await sleep(1800);
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Try sample')).click(); true`);
  await sleep(1400);
  // trace a few points
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Trace')).click(); true`);
  const r = await evl(`(()=>{const b=document.querySelector('#stage').getBoundingClientRect();return{x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  for (const [fx, fy] of [[0.30, 0.55], [0.50, 0.40], [0.70, 0.45]]) { await mouse('mousePressed', r.x + r.w * fx, r.y + r.h * fy); await mouse('mouseReleased', r.x + r.w * fx, r.y + r.h * fy); await sleep(100); }
  // grab the middle node and start dragging it
  const node = await evl(`(()=>{const cs=[...document.querySelectorAll('#stage-svg circle')].filter(c=>/cursor:move/.test(c.getAttribute('style')||''));const c=cs[1]||cs[0];if(!c)return null;const b=c.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  if (!node) throw new Error('no node found');
  await mouse('mousePressed', node.x, node.y);
  await mouse('mouseMoved', node.x + 24, node.y - 30);
  await sleep(250); // hold mid-drag
  const loupeShown = await evl(`!document.querySelector('#loupe').hidden`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('verify/app-loupe.png', Buffer.from(shot.result.data, 'base64'));
  await mouse('mouseReleased', node.x + 24, node.y - 30);
  console.log(JSON.stringify({ loupeShown }));
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
