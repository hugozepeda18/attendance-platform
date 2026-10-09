// Phone-size check (Phase 19b): opens every screen at iPhone width (390 px) in headless Chrome and
// reports anything wider than the screen and any tap target shorter than 44 px. Screenshots go to
// scripts/phone-shots/. No dependencies: Chrome's DevTools protocol over Node's built-in WebSocket.
//
// Needs the dev backend + frontend running and the seed data:
//   node scripts/phone-check.mjs            (CHROME=/path/to/chrome to override)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCHOOL = 'http://norte.localhost:5173';
const ADMIN = 'http://admin.localhost:5173';
const PASSWORD = 'dev-password-123';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const SHOTS = new URL('./phone-shots/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'phone-check-'))}`,
  '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let ws;
let seq = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
async function goto(url) {
  await send('Page.navigate', { url });
  await sleep(1500);
}
async function clickText(text, selector = 'button, a, summary, tr, li, label') {
  const ok = await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => e.offsetParent !== null && e.textContent.trim().includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!ok) throw new Error(`nothing to tap with text "${text}"`);
  await sleep(1200);
}
async function type(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(1200);
}

// Elements past the right edge, and tap targets under 44 px (a checkbox counts its whole label).
const CHECK = `(() => {
  const W = window.innerWidth;
  const name = (el) => (el.tagName.toLowerCase() + ' "' + (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().slice(0, 40) + '"');
  const shown = (el) => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && el.getClientRects().length > 0; };
  const wide = [], small = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > W + 1 || r.left < -1) && !el.closest('svg')) wide.push(name(el) + ' right=' + Math.round(r.right));
    if (el.matches('button, a[href], input:not([type=hidden]), select, textarea, summary')) {
      const target = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') ?? el : el;
      const h = target.getBoundingClientRect().height;
      if (h < 44 && !el.closest('[aria-hidden=true]')) small.push(name(el) + ' h=' + Math.round(h));
    }
  }
  return { wide: [...new Set(wide)].slice(0, 10), small: [...new Set(small)].slice(0, 10), pageWidth: document.documentElement.scrollWidth };
})()`;

const problems = [];
async function check(screen) {
  const r = await evaluate(CHECK);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(SHOTS, `${screen}.png`), Buffer.from(shot.data, 'base64'));
  const ok = !r.wide.length && !r.small.length && r.pageWidth <= 390;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${screen}${ok ? '' : `  (page width ${r.pageWidth})`}`);
  for (const w of r.wide) console.log(`       too wide: ${w}`);
  for (const s of r.small) console.log(`       too small: ${s}`);
  if (!ok) problems.push(screen);
}

async function signIn(base, email) {
  await goto(base);
  await evaluate('sessionStorage.clear(); localStorage.clear()');
  await goto(base);
  await type('input[type=email]', email);
  await type('input[type=password]', PASSWORD);
  await clickText('Entrar', 'button');
  await sleep(1500);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null);
  }
  if (!target) throw new Error(`Chrome did not start (${CHROME})`);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });

  await goto(SCHOOL);
  await check('sign-in');

  await signIn(SCHOOL, 'principal@norte.test');
  await check('group');
  await clickText('Ver gráficas', 'summary');
  await check('group-charts');
  await clickText('Grados', 'nav button');
  await check('grade');
  await clickText('Solicitudes', 'nav button');
  await check('requests');
  await clickText('Calendario', 'nav button');
  await check('calendar');
  await clickText('Alumnos', 'nav button');
  await check('students');
  await clickText('Agregar alumno', 'button');
  await check('students-form');
  await clickText('Personal', 'nav button');
  await check('staff');

  // Staff: search → student (1 tap) → "Justificar falta" (2) → reason (3) → save (4)
  await signIn(SCHOOL, 'staff@norte.test');
  await clickText('Grupos', 'nav button');
  await type('input[type=text]', '1-A');
  await clickText('1-A', 'ul button');
  await clickText('Historial', 'summary')
    .then(() => evaluate(`document.querySelector('details[open]').scrollIntoView({ block: 'center' })`))
    .catch(() => console.log('     (no record history to open)'));
  await check('student-modal');
  await clickText('Justificar falta', 'button');
  await clickText('Cita médica', 'button');
  await check('excuse-form');
  const saveReady = await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Guardar justificante') && !b.disabled)`);
  console.log(`${saveReady ? 'ok  ' : 'FAIL'} excuse in 4 taps after search (save button ready, not pressed)`);
  if (!saveReady) problems.push('excuse-taps');
  await clickText('Cambiar estado', 'button').catch(() => clickText('Solicitar cambio', 'button'));
  await check('change-sheet');

  await signIn(ADMIN, 'owner@platform.test');
  await check('admin-schools');
  await clickText('Secundaria Demo Norte', 'button');
  await check('admin-school');
  await clickText('Todas las escuelas', 'button');
  await clickText('Nueva escuela', 'button');
  await check('admin-new-school');

  console.log(problems.length ? `\n${problems.length} screen(s) need work: ${problems.join(', ')}` : '\nAll screens fit a 390 px phone.');
  console.log(`Screenshots: ${SHOTS}`);
  return problems.length ? 1 : 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => { ws?.close(); chrome.kill(); });
