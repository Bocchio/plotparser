// Exercise the new features over CDP: undo/redo, insert-node-on-curve, probes.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.argv[2] || 'http://localhost:5173/';
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=9334', '--window-size=1400,860', 'about:blank',
]);

let ws, msgId = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const id = ++msgId;
  return new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
};
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
}
async function click(x, y, modifiers = 0) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers });
}
async function key(k, code, vk, modifiers = 0) {
  await evaluate(`document.activeElement && document.activeElement.blur(); true`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
}
const ptsCount = () => evaluate(`(()=>{const m=document.body.textContent.match(/(\\d+) pts/);return m?+m[1]:0})()`);

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const t = await (await fetch('http://localhost:9334/json')).json();
      const p = t.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no CDP');
}

async function main() {
  ws = new WebSocket(await connect());
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await sleep(1800);

  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Try sample')).click(); true`);
  await sleep(1400);
  // calibrate (log, 1..100 / 50..500)
  await evaluate(`(()=>{document.querySelectorAll('.axis-block').forEach(b=>{[...b.querySelectorAll('button')].find(x=>x.textContent==='Log').click();});return true})()`);
  await sleep(120);
  const setNum = (b, i, v) => evaluate(`(()=>{const x=document.querySelectorAll('.axis-block')[${b}].querySelectorAll('input[type=number]')[${i}];x.focus();x.value='${v}';x.dispatchEvent(new Event('input',{bubbles:true}));x.blur();return true})()`);
  await setNum(0, 0, 1); await setNum(0, 1, 100); await setNum(1, 0, 50); await setNum(1, 1, 500);
  await sleep(150);

  // trace 4 points (avoid the guide lines at 15%/85% width)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Trace')).click(); true`);
  await sleep(120);
  const r = await evaluate(`(()=>{const b=document.querySelector('#stage').getBoundingClientRect();return{x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  for (const [fx, fy] of [[0.30, 0.55], [0.45, 0.40], [0.60, 0.38], [0.72, 0.46]]) {
    await click(r.x + r.w * fx, r.y + r.h * fy);
    await sleep(100);
  }
  const afterTrace = await ptsCount();

  // undo last add, then redo
  await key('z', 'KeyZ', 90, 2); await sleep(200);
  const afterUndo = await ptsCount();
  await key('Z', 'KeyZ', 90, 2 | 8); await sleep(200);
  const afterRedo = await ptsCount();

  // insert a node on the curve midpoint
  const mid = await evaluate(`(()=>{const p=document.querySelector('#stage-svg path');if(!p)return null;const L=p.getTotalLength();const pt=p.getPointAtLength(L*0.5);const sp=pt.matrixTransform(p.getScreenCTM());return{x:sp.x,y:sp.y}})()`);
  if (mid) { await click(mid.x, mid.y); await sleep(150); }
  const afterInsert = await ptsCount();

  // add a probe + snap it to the series
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('Add probe')).click(); true`);
  await sleep(200);
  const probeLabel = await evaluate(`(()=>{const t=document.querySelector('#stage-svg text');const labels=[...document.querySelectorAll('#stage-svg text')].map(t=>t.textContent);return labels.find(l=>l && l.includes('('))||''})()`);
  const probeRowText = await evaluate(`(()=>{const p=document.querySelectorAll('#sidebar .panel')[4];return p?p.textContent.replace(/\\s+/g,' ').slice(0,120):''})()`);
  // snap to first series
  await evaluate(`(()=>{const p=document.querySelectorAll('#sidebar .panel')[4];const sel=p.querySelector('select');if(sel){sel.value=sel.options[1].value;sel.dispatchEvent(new Event('change',{bubbles:true}));}return true})()`);
  await sleep(200);

  await send('Page.bringToFront', {});
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('verify/app-features.png', Buffer.from(shot.result.data, 'base64'));

  console.log(JSON.stringify({ afterTrace, afterUndo, afterRedo, afterInsert, probeLabel, probeRowText }, null, 2));
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
