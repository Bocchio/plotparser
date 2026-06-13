// Drive the real interactive app via Chrome DevTools Protocol.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.argv[2] || 'http://localhost:5173/';
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=9333', '--window-size=1400,860', 'about:blank',
]);
chrome.on('error', (e) => { console.error('spawn error', e); process.exit(1); });

let ws, msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch('http://localhost:9333/json')).json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Could not reach CDP endpoint');
}

async function main() {
  const wsUrl = await connect();
  ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).res(m); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await sleep(1800);

  // 1) Load the bundled sample
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Try sample')).click(); true`);
  await sleep(1500);
  const hasImg = await evaluate(`!!document.querySelector('#stage-canvas') && document.querySelector('#statusbar').textContent`);

  // 2) Set log scale + tick values through the calibration panel inputs (focus to mimic typing)
  await evaluate(`(()=>{const b=document.querySelectorAll('.axis-block')[0];[...b.querySelectorAll('button')].find(x=>x.textContent==='Log').click();return true})()`);
  await sleep(150);
  await evaluate(`(()=>{const b=document.querySelectorAll('.axis-block')[1];[...b.querySelectorAll('button')].find(x=>x.textContent==='Log').click();return true})()`);
  await sleep(150);
  const setNum = (block, idx, val) =>
    evaluate(`(()=>{const b=document.querySelectorAll('.axis-block')[${block}];const i=b.querySelectorAll('input[type=number]')[${idx}];i.focus();i.value='${val}';i.dispatchEvent(new Event('input',{bubbles:true}));i.blur();return true})()`);
  await setNum(0, 0, 1); await sleep(120);
  await setNum(0, 1, 100); await sleep(120);
  await setNum(1, 0, 50); await sleep(120);
  await setNum(1, 1, 500); await sleep(200);

  const status = await evaluate(`document.querySelector('#statusbar').textContent.trim()`);
  const step2done = await evaluate(`document.querySelectorAll('.panel')[1].classList.contains('done')`);

  // 3) Switch to Trace tool and click a few points on the stage to add anchors
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Trace')).click(); true`);
  await sleep(150);
  const rect = await evaluate(`(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
  const clickPts = [[0.25, 0.6], [0.45, 0.4], [0.65, 0.35], [0.85, 0.5]];
  for (const [fx, fy] of clickPts) {
    const x = rect.x + rect.w * fx;
    const y = rect.y + rect.h * fy;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(120);
  }
  const anchorCount = await evaluate(`(()=>{const m=document.body.textContent.match(/(\\d+) pts/);return m?+m[1]:0})()`);

  // 4) Turn on overlays and screenshot
  await evaluate(`[...document.querySelectorAll('#sidebar label')].forEach(l=>{if(/gridlines|Recreated/.test(l.textContent))l.querySelector('input').click()}); true`);
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('verify/app-driven.png', Buffer.from(shot.result.data, 'base64'));

  console.log(JSON.stringify({ hasImg: !!hasImg, status, step2done, anchorCount }, null, 2));
  ws.close();
  chrome.kill();
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
