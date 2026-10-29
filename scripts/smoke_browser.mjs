/* Browser-level smoke check for the judging path.
 *
 * Drives headless Chrome over CDP (no extra dependencies; Node 21+ for
 * global fetch/WebSocket) through the full journey against a running
 * frontend + backend pair:
 *
 *   Predict -> Build -> Reality Check -> R1 -> R2 -> R4 -> Solo -> Finale
 *
 * Verifies React rendering, API wiring, lazy chunk loading, and button
 * interactions. Exits nonzero on any failure.
 *
 * Usage (backend on :5000, frontend dev server running):
 *   node scripts/smoke_browser.mjs
 *
 * Environment:
 *   BASE         frontend origin (default http://localhost:5173)
 *   CHROME       Chrome binary (default macOS Google Chrome)
 *   CDP_PORT     remote-debugging port (default 9333)
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? '9333')
const CDP = `http://127.0.0.1:${CDP_PORT}`
const lazyChunks = new Set()
const fails = []
let ws
let msgId = 0
const pending = new Map()
const askRequestIds = []
let chrome = null

async function waitForCdp(timeoutMs = 20000) {
  const t0 = Date.now()
  for (;;) {
    try {
      const res = await fetch(`${CDP}/json/version`)
      if (res.ok) return
    } catch {
      /* still starting */
    }
    if (Date.now() - t0 > timeoutMs) throw new Error('Chrome CDP never came up')
    await new Promise((r) => setTimeout(r, 250))
  }
}

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`)
  if (!cond) fails.push(name)
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function ev(expression) {
  const res = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  })
  if (res.exceptionDetails) throw new Error('eval failed: ' + res.exceptionDetails.text)
  return res.result.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, what, timeout = 15000) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t0 > timeout) throw new Error('timeout waiting: ' + what)
    await sleep(250)
  }
}

async function clickButton(text) {
  const ok = await ev(`(() => {
    const els = [...document.querySelectorAll('button')];
    const b = els.find((e) => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled);
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  })()`)
  if (!ok) throw new Error('button not found: ' + text)
}

async function clickButtonStarts(prefix) {
  const ok = await ev(`(() => {
    const els = [...document.querySelectorAll('button')];
    const b = els.find((e) => e.textContent.trim().startsWith(${JSON.stringify(prefix)}) && !e.disabled);
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return b.textContent.trim();
  })()`)
  if (!ok) throw new Error('button starting with not found: ' + prefix)
  return ok
}

async function fillInput(id, value) {
  const ok = await ev(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  if (!ok) throw new Error('input not found: ' + id)
}

async function hasText(t) {
  return ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
}

async function handleCenter(nodeId, terminal) {
  return ev(`(() => {
    const el = document.querySelector('[data-nodeid="${nodeId}"][data-handleid="${terminal}"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.bottom > 0 && r.top < 900 };
  })()`)
}

async function edgeList() {
  return ev(`[...document.querySelectorAll('[data-testid^="rf__edge-"]')].map((e) => ({
    id: e.getAttribute('data-testid'), label: e.getAttribute('aria-label'),
  }))`)
}

async function ensureCanvasVisible() {
  await ev(`(() => {
    const c = document.querySelector('[aria-label="Circuit canvas"]');
    if (c) c.scrollIntoView({ block: 'center' });
  })()`)
  await sleep(400)
}

async function drag(from, to) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 12; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: from.x + ((to.x - from.x) * i) / 12,
      y: from.y + ((to.y - from.y) * i) / 12, button: 'left',
    })
    await sleep(30)
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 })
}

async function wire(nodeA, termA, nodeB, termB) {
  await ensureCanvasVisible()
  const want = [`Edge from ${nodeA} to ${nodeB}`, `Edge from ${nodeB} to ${nodeA}`]
  for (let attempt = 1; attempt <= 3; attempt++) {
    const a = await waitFor(() => handleCenter(nodeA, termA), `handle ${nodeA}.${termA}`)
    const b = await waitFor(() => handleCenter(nodeB, termB), `handle ${nodeB}.${termB}`)
    if (!a.visible || !b.visible) {
      await ensureCanvasVisible()
      continue
    }
    const before = new Set((await edgeList()).map((e) => e.id))
    await drag(a, b)
    await sleep(600)
    const added = (await edgeList()).filter((e) => !before.has(e.id))
    if (added.some((e) => want.includes(e.label))) return
  }
  throw new Error(`wire failed: ${nodeA}.${termA} -> ${nodeB}.${termB}`)
}

async function removeDir(path) {
  for (let i = 0; i < 6; i++) {
    try {
      rmSync(path, { recursive: true, force: true })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  console.log('note: smoke profile left at ' + path)
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'verityn-smoke-'))
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' })
  try {
    await waitForCdp()
    await drive()
  } finally {
    try { chrome.kill() } catch { /* ignore */ }
    await removeDir(profile)
  }
}

async function drive() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    } else if (msg.method === 'Network.responseReceived') {
      const url = msg.params.response.url
      if (url.includes('/api/coach/ask')) {
        askRequestIds.push(msg.params.requestId)
      }
      if (url.includes('SnapBuildLab') || url.includes('RealityLens')) {
        lazyChunks.add(url)
      }
    }
  }
  await new Promise((resolve) => { ws.onopen = resolve })
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: BASE + '/' })
  await waitFor(() => hasText('Start with a diagram'), 'hub')
  check('hero headline', await hasText('Learn by predicting, testing, and explaining.'))
  check('hero transformation', await hasText('Meta interpretation') && await hasText('Solver evidence'))
  check('hero CTAs', await hasText('Start with a diagram') && await hasText('Learn through the guided circuit lab') && await hasText('Watch the guided demo'))
  check('method strip', await hasText('Try independently'))
  check('tech strip', await hasText('Meta Muse Spark') && await hasText('Verityn Solver'))
  check('planned subjects honest', await hasText('Planned') && await hasText('Active demo'))
  await clickButton('Learn through the guided circuit lab')

  await waitFor(() => hasText('open gap'), 'l1 predict')
  const micLabel = await ev(`document.querySelector('#predict-why + button')?.getAttribute('aria-label') ?? 'missing'`)
  check('mic button renders with honest state', micLabel === 'Dictate your reason' || micLabel === 'Voice input not supported', micLabel)
  await clickButton('No')
  await fillInput('predict-why', 'gap breaks the loop')
  await clickButton('Continue to fix it')
  await waitFor(() => handleCenter('B1', 'b'), 'l1 canvas')
  await wire('B1', 'b', 'L1', 'b')
  await waitFor(() => hasText('Continue to Reality Check'), 'l1 gate', 25000)

  check('Your original prediction header', await hasText('Your original prediction'))
  check('initial copy (stay dark)', await hasText('Your initial prediction was that the open circuit would stay dark.'))
  check('Repair verified header', await hasText('Repair verified'))
  check('repair numbers', await hasText('Your completed circuit produces 0.6 A and 3.6 W.'))
  check('3-section card', await hasText('What the simulator observed'))
  check('simulator ready badge', await hasText('Simulator ready'))
  await clickButtonStarts('Continue to Reality Check')

  await waitFor(() => hasText('switch is open'), 'reality predict')
  await clickButton('Yes')
  await fillInput('predict-why', 'complete loop lights')
  await clickButtonStarts('Continue')
  await waitFor(() => hasText('Ask the coach'), 'coach', 25000)
  await clickButton('Ask the coach')
  await waitFor(() => hasText('Fallback coach'), 'r1', 20000)
  await clickButton('Show me the evidence (R2)')
  await waitFor(() => hasText('Evidence pointer'), 'r2', 20000)
  check('listen button on coach card', await hasText('Listen'))

  // Demo excursion mid-ladder: the served R1/R2 cards must survive the
  // verdict flip, and R4 must still be the next rung after undo.
  await clickButton('Show me')
  await waitFor(() => hasText('Consistent with the model'), 'demo apply flips verdict', 25000)
  check('demo apply shows fresh lit reading', await hasText('3.6 W'))
  check('undo offered at canvas', await hasText('Undo demonstration'))
  await clickButton('Undo demonstration')
  await waitFor(() => hasText('Contradicted by the model'), 'demo undo restores', 25000)
  check('undo restores dark reading', await hasText('0.0 W'))
  await clickButton('Confirm before solo (R4)')
  await waitFor(() => hasText('Confirmation check'), 'r4', 20000)

  check('3 coach/ask responses captured', askRequestIds.length === 3, `got ${askRequestIds.length}`)
  const bodies = []
  for (const reqId of askRequestIds) {
    const { body } = await send('Network.getResponseBody', { requestId: reqId })
    bodies.push(JSON.parse(body))
  }
  const rungs = bodies.map((b) => b.rung)
  check('rungs served R1,R2,R4', JSON.stringify(rungs) === JSON.stringify(['R1', 'R2', 'R4']), rungs.join(','))
  const r2 = bodies.find((b) => b.rung === 'R2')
  check('R2 eligible', r2?.eligible === true)
  check('R2 provider deterministic', r2?.provider === 'deterministic', String(r2?.provider))
  check('R2 cites 0.0 A discrepancy', typeof r2?.text === 'string' && r2.text.includes('0.0 A') && r2.text.includes('S1'))
  console.log('R2 text:', JSON.stringify(r2?.text))
  check('R2 carries validated actions', Array.isArray(r2?.actions) && r2.actions.some((a) => a.type === 'set_switch_state' && a.componentId === 'S1' && a.closed === true), JSON.stringify(r2?.actions))

  const coachCallsBeforeSolo = askRequestIds.length
  await clickButtonStarts('Continue to solo')
  await waitFor(() => hasText('Solo mode'), 'solo predict')
  check('no coach in solo', !(await hasText('Ask the coach')))
  await clickButton('Yes')
  await fillInput('predict-why', 'parallel bulb lights')
  await clickButton('Continue to wire it')
  await waitFor(() => handleCenter('L2', 'b'), 'solo canvas')
  await wire('L2', 'b', 'L1', 'b')
  await waitFor(() => hasText('See your journey'), 'solo gate', 25000)
  check('solo made zero coach calls', askRequestIds.length === coachCallsBeforeSolo,
    `before ${coachCallsBeforeSolo}, after ${askRequestIds.length}`)
  await clickButtonStarts('See your journey')
  await waitFor(() => hasText('Replay journey'), 'finale')
  check('finale capstone', await hasText('You did not memorize the answer. You tested it, explained it, and proved it.'))
  const hasDemoTitle = await hasText('DEMONSTRATION')
  const hasObserved = await hasText('Solver observed')
  const hasUndone = await hasText('Restored the pre-demonstration circuit.')
  check('demo timeline recorded', hasDemoTitle && hasObserved && hasUndone, `title=${hasDemoTitle} observed=${hasObserved} undone=${hasUndone}`)
  check('served rungs survive the demo excursion', !(await hasText('you have not asked the coach yet')))
  if (!hasDemoTitle || !hasObserved || !hasUndone) {
    const context = await ev(`(() => {
      const text = document.body.innerText;
      const i = text.indexOf('REALITY CHECK');
      return JSON.stringify(text.slice(Math.max(0, i - 200), i + 3000));
    })()`)
    console.log('REALITY FINALE CONTEXT:', context)
  }
  check('reality check story node', await hasText('REALITY CHECK EVIDENCE'))
  const proofCount = await ev('document.querySelector(\'[aria-label="Evidence summary"]\')?.children.length ?? 0')
  check('evidence summary cards', proofCount === 3, `got ${proofCount}`)
  await clickButton('Explore Reality Lens')
  // innerText reflects the CSS uppercase transform on the eyebrow.
  await waitFor(() => hasText('META VISION WORKSPACE'), 'lens page')
  check('lens page heading', await hasText('Reality Lens'))
  check('lens back button', await hasText('← Back to guided journey'))
  await waitFor(() => hasText('Snap & Build'), 'lens lab', 20000)
  check('lazy lab chunk loaded', lazyChunks.size > 0, [...lazyChunks].join(', '))
  await clickButton('← Back to guided journey')
  await waitFor(() => hasText('Replay journey'), 'back to finale')
  await ev(`(() => {
    const s = document.querySelector('#lab-tools > summary');
    if (!s) return false;
    s.scrollIntoView({ block: 'center' });
    s.click();
    return true;
  })()`)
  await sleep(500)
  check('presenter drawer label', await hasText('Presenter & developer controls'))
  check('auto control in drawer', await hasText('Auto-advance chapters'))
  check('benches hidden by default', !(await hasText('Try a circuit')) && !(await hasText('Check a prediction')))

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url: BASE + '/' })
  await waitFor(() => hasText('Start with a diagram'), 'mobile hub')
  const overflow = await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  check('mobile homepage fits 390px', overflow <= 1, `overflow ${overflow}px`)
  await clickButton('Learn through the guided circuit lab')
  await waitFor(() => hasText('open gap'), 'mobile predict')
  await send('Page.navigate', { url: BASE + '/' })
  await waitFor(() => hasText('Start with a diagram'), 'mobile rehub')
  await clickButton('Start with a diagram')
  await waitFor(() => hasText('META VISION WORKSPACE'), 'mobile lens')
  await waitFor(() => hasText('Snap & Build'), 'mobile lens lab', 20000)
  const lensOverflow = await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  check('mobile lens page fits 390px', lensOverflow <= 1, `overflow ${lensOverflow}px`)

  console.log(fails.length === 0 ? 'BROWSER SMOKE PASSED' : `FAILURES: ${fails.join(', ')}`)
  ws.close()
  // Return (don't process.exit): main's finally must run to kill Chrome.
  process.exitCode = fails.length === 0 ? 0 : 1
}

main().catch(async (err) => {
  console.error('DRIVER ERROR:', err.message)
  try {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync('smoke_fail.png', Buffer.from(shot.data, 'base64'))
    console.error('screenshot: smoke_fail.png')
  } catch { /* ignore */ }
  try { ws.close() } catch { /* ignore */ }
  try { chrome.kill() } catch { /* ignore */ }
  process.exit(2)
})
