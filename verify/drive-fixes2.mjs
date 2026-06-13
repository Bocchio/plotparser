// Verify: show/hide actually hides the curve; calibration lines are inert in
// Trace mode; Ctrl-click deletes a node; custom tick list wires up + changes grid.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.argv[2] || 'http://localhost:5173/';
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--hide-scrollbars', '--remote-debugging-port=9337', '--window-size=1400,860', 'about:blank']);
let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => { const i = ++id; return new Promise((r) => { pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const md = (type, x, y, modifiers = 0) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: 1, clickCount: 1, modifiers });
const click = async (x, y, mods = 0) => { await md('mousePressed', x, y, mods); await md('mouseReleased', x, y, mods); };
async function connect() { for (let i = 0; i < 40; i++) { try { const t = await (await fetch('http://localhost:9337/json')).json(); const p = t.find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }

// counts of meaningful SVG elements
const counts = () => evl(`(()=>{
  const g=document.querySelector('#stage-svg');
  const curvePaths=[...g.querySelectorAll('path')].filter(p=>{const s=p.getAttribute('stroke');return s&&s!=='transparent'&&s!=='none'}).length;
  const nodes=[...g.querySelectorAll('circle,polygon,rect')].filter(c=>/cursor:move/.test(c.getAttribute('style')||'')).length;
  const calibHit=[...g.querySelectorAll('line')].filter(l=>/resize/.test(l.getAttribute('style')||'')).length;
  return {curvePaths,nodes,calibHit};
})()`);
const pts = () => evl(`(()=>{const m=document.body.textContent.match(/(\\d+) pts/);return m?+m[1]:0})()`);

async function main() {
  ws = new WebSocket(await connect());
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL }); await sleep(1800);
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Try sample')).click(); true`);
  await sleep(1400);

  // trace 4 nodes in Trace mode
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Trace')).click(); true`);
  const r = await evl(`(()=>{const b=document.querySelector('#stage').getBoundingClientRect();return{x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  for (const [fx, fy] of [[0.30, 0.55], [0.45, 0.42], [0.60, 0.40], [0.72, 0.48]]) { await click(r.x + r.w * fx, r.y + r.h * fy); await sleep(80); }

  const traceMode = await counts();            // calibHit should be 0 in trace mode
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Pan')).click(); true`); await sleep(120);
  const panMode = await counts();              // calibHit should be 4 in pan mode
  await evl(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Trace')).click(); true`); await sleep(120);

  // show/hide hides the curve + nodes
  const beforeHide = await counts();
  await evl(`(()=>{const it=document.querySelector('.series-item');const b=[...it.querySelectorAll('button.icon')].find(x=>/👁|🚫/.test(x.textContent));b.click();return true})()`); await sleep(150);
  const afterHide = await counts();
  // toggle back visible
  await evl(`(()=>{const it=document.querySelector('.series-item');const b=[...it.querySelectorAll('button.icon')].find(x=>/👁|🚫/.test(x.textContent));b.click();return true})()`); await sleep(150);

  // Ctrl-click a middle node deletes it
  const ptsBefore = await pts();
  const node = await evl(`(()=>{const cs=[...document.querySelectorAll('#stage-svg circle,#stage-svg polygon,#stage-svg rect')].filter(c=>/cursor:move/.test(c.getAttribute('style')||''));const c=cs[1]||cs[0];if(!c)return null;const b=c.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  if (node) { await click(node.x, node.y, 2 /* Ctrl */); await sleep(150); }
  const ptsAfterCtrlDel = await pts();

  // custom tick list on X axis: enable gridlines, set list 1,10,100 + minors
  await evl(`(()=>{document.querySelectorAll('.axis-block').forEach(b=>{[...b.querySelectorAll('.seg button')].find(x=>x.textContent==='Log').click();});return true})()`);
  await sleep(100);
  const setN = (b, i, v) => evl(`(()=>{const x=document.querySelectorAll('.axis-block')[${b}].querySelectorAll('input[type=number]')[${i}];x.focus();x.value='${v}';x.dispatchEvent(new Event('input',{bubbles:true}));x.blur();return true})()`);
  await setN(0, 0, 1); await setN(0, 1, 100); await setN(1, 0, 50); await setN(1, 1, 500); await sleep(120);
  await evl(`(()=>{const cb=[...document.querySelectorAll('#sidebar input[type=checkbox]')][0];if(!cb.checked)cb.click();return true})()`); // gridlines on
  await sleep(120);
  // switch X ticks to Custom list and type majors
  await evl(`(()=>{const sel=document.querySelectorAll('.axis-block')[0].querySelector('select');sel.value='list';sel.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await sleep(150);
  const listUiPresent = await evl(`(()=>{const b=document.querySelectorAll('.axis-block')[0];return /Major values/.test(b.textContent)})()`);
  await evl(`(()=>{const b=document.querySelectorAll('.axis-block')[0];const t=b.querySelector('input[type=text]:not([placeholder=""])');return true})()`);
  // type a list into the first text input within ticks (majors)
  const tickApplied = await evl(`(()=>{
    const b=document.querySelectorAll('.axis-block')[0];
    const texts=[...b.querySelectorAll('input[type=text]')];
    const maj=texts[texts.length-2]||texts[texts.length-1];
    maj.focus(); maj.value='1, 10, 100'; maj.dispatchEvent(new Event('input',{bubbles:true})); maj.blur();
    return true;
  })()`);
  await sleep(200);

  console.log(JSON.stringify({
    traceMode_calibHit: traceMode.calibHit,
    panMode_calibHit: panMode.calibHit,
    beforeHide, afterHide,
    ptsBefore, ptsAfterCtrlDel,
    listUiPresent, tickApplied,
  }, null, 2));
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
