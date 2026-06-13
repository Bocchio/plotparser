// Verify the panel-repaint fixes: Log/Linear toggle shows the active state,
// the series show/hide button repaints, and the selected-node editor appears.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.argv[2] || 'http://localhost:5173/';
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--hide-scrollbars', '--remote-debugging-port=9336', '--window-size=1400,860', 'about:blank']);
let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => { const i = ++id; return new Promise((r) => { pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: 1, clickCount: 1 });
const click = async (x, y) => { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
async function connect() { for (let i = 0; i < 40; i++) { try { const t = await (await fetch('http://localhost:9336/json')).json(); const p = t.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }

async function main() {
  ws = new WebSocket(await connect());
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL }); await sleep(1800);
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Try sample')).click(); true`);
  await sleep(1400);

  // --- 1. Log/Linear toggle visual feedback ---
  const before = await evl(`(()=>{const b=document.querySelectorAll('.axis-block')[0];const bs=[...b.querySelectorAll('.seg button')];return bs.map(x=>x.textContent+':'+x.classList.contains('active')).join(',')})()`);
  await evl(`(()=>{const b=document.querySelectorAll('.axis-block')[0];[...b.querySelectorAll('.seg button')].find(x=>x.textContent==='Log').click();return true})()`);
  await sleep(150);
  const afterLog = await evl(`(()=>{const b=document.querySelectorAll('.axis-block')[0];const bs=[...b.querySelectorAll('.seg button')];return bs.map(x=>x.textContent+':'+x.classList.contains('active')).join(',')})()`);

  // --- 2. series show/hide button repaints its icon ---
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Add series')).click(); true`);
  await sleep(150);
  // trace 3 pts so the series is real
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Trace')).click(); true`);
  const r = await evl(`(()=>{const b=document.querySelector('#stage').getBoundingClientRect();return{x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  for (const [fx, fy] of [[0.35, 0.55], [0.5, 0.4], [0.65, 0.45]]) { await click(r.x + r.w * fx, r.y + r.h * fy); await sleep(80); }
  const visBefore = await evl(`(()=>{const it=document.querySelector('.series-item');const b=[...it.querySelectorAll('button.icon')].find(x=>/👁|🚫/.test(x.textContent));return b?b.textContent:'?'})()`);
  await evl(`(()=>{const it=document.querySelector('.series-item');const b=[...it.querySelectorAll('button.icon')].find(x=>/👁|🚫/.test(x.textContent));b.click();return true})()`);
  await sleep(150);
  const visAfter = await evl(`(()=>{const it=document.querySelector('.series-item');const b=[...it.querySelectorAll('button.icon')].find(x=>/👁|🚫/.test(x.textContent));return b?b.textContent:'?'})()`);

  // --- 3. selected-node editor appears when a node is selected ---
  // click a node glyph (circle/polygon/rect) of the active series to select it
  const nodeEditorPresent = await evl(`(()=>{
    const g=document.querySelector('#stage-svg');
    const node=[...g.querySelectorAll('circle,polygon,rect')].find(c=>/cursor:move/.test(c.getAttribute('style')||''));
    if(!node) return 'no-node';
    const b=node.getBoundingClientRect();
    const ev=t=>node.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:b.x+b.width/2,clientY:b.y+b.height/2,button:0,buttons:1}));
    ev('pointerdown'); window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:b.x+b.width/2,clientY:b.y+b.height/2}));
    return true;
  })()`);
  await sleep(200);
  const editorText = await evl(`(()=>{const e=document.querySelector('.node-edit');return e?e.textContent.replace(/\\s+/g,' ').trim().slice(0,80):'(absent)'})()`);

  // number inputs should have no spinner (appearance textfield)
  const numAppearance = await evl(`(()=>{const i=document.querySelector('.axis-block input[type=number]');return i?getComputedStyle(i).appearance:'?'})()`);

  console.log(JSON.stringify({ before, afterLog, visBefore, visAfter, nodeEditorPresent, editorText, numAppearance }, null, 2));
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
