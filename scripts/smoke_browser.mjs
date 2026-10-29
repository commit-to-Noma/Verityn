/* Browser-level smoke check for the judging path.
 *
 * Drives headless Chrome over CDP (no extra dependencies; Node 21+ for
 * global fetch/WebSocket) through the full journey against a running
 * frontend + backend pair:
 *
 *   Predict -> Build -> Reality Check -> R1 -> R2 -> R4 -> Solo -> Finale
 *     -> Reality Lens stubbed upload (needs_review) -> unsupported refusal
 *     -> Guided demo full run (pause/resume, replay, manual takeover)
 *
 * Verifies React rendering, API wiring, lazy chunk loading, and button
 * interactions. The lens proposals are stubbed at the network layer from
 * captured fixtures: no live Meta call is ever made by this script.
 * Exits nonzero on any failure.
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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? '9333')
const CDP = `http://127.0.0.1:${CDP_PORT}`
const HERE = dirname(fileURLToPath(import.meta.url))
const switchFixture = JSON.parse(
  readFileSync(join(HERE, '..', 'tests', 'fixtures', 'vision_live', '06_textbook_switch.proposal.json'), 'utf8'),
)
const switchImage = join(HERE, '..', 'tests', 'fixtures', 'sam_spike', '06_textbook_switch.jpeg')
const visionStubs = []
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

async function uploadLensFile(absPath) {
  const doc = await send('DOM.getDocument', { depth: 0 })
  const { nodeId } = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' })
  if (!nodeId) throw new Error('lens file input missing')
  await send('DOM.setFileInputFiles', { nodeId, files: [absPath] })
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
    } else if (msg.method === 'Fetch.requestPaused') {
      const { requestId, request } = msg.params
      const stub = request.url.includes('/api/vision/propose') ? visionStubs.shift() : undefined
      if (stub !== undefined) {
        send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(stub).toString('base64'),
        }).catch(() => {})
      } else {
        send('Fetch.continueRequest', { requestId }).catch(() => {})
      }
    }
  }
  await new Promise((resolve) => { ws.onopen = resolve })
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: BASE + '/' })
  await waitFor(() => hasText('Enter the guided lab'), 'hub')
  check('tab title', await ev('document.title') === 'Verityn Laboratory — Make a prediction. Meet reality.', await ev('document.title'))
  const iconHref = await ev(`document.querySelector('link[rel="icon"]')?.getAttribute('href') ?? 'missing'`)
  check('brand icon linked', iconHref === '/brand/verityn-logo.png', iconHref)
  const iconRes = await fetch(BASE + iconHref)
  const iconBytes = Number(iconRes.headers.get('content-length') ?? '0')
  check('brand icon served and bounded', iconRes.ok && iconBytes > 0 && iconBytes < 100 * 1024, `${iconRes.status} ${iconBytes}B`)
  check('hero headline', await hasText('Make a prediction. Meet reality.'))
  check('lab identity', await hasText('Verityn Laboratory'))
  check('hero entries', await hasText('Enter the guided lab') && await hasText('Open Reality Lens') && await hasText('Watch the guided demo'))
  check('live example card', await hasText('ENGINEERING LAB 01') && await hasText('Circuit Reality Check'))
  check('capabilities', await hasText('What Verityn can do') && await hasText('Independent transfer'))
  check('diagram example', await hasText('bringing a circuit diagram to life'))
  check('tech strip', await hasText('Meta Muse Spark') && await hasText('Verityn Solver'))
  check('planned subjects honest', await hasText('Planned') && await hasText('Active demo'))
  check('shell nav', await hasText('Guided Lab') && await hasText('Reality Lens') && await hasText('Experiment'))
  const navCurrent = await ev(`document.querySelector('nav[aria-label="Laboratory"] button[aria-current="page"]')?.textContent.trim() ?? 'none'`)
  check('hub is current location', navCurrent === 'Hub', navCurrent)
  const expDisabled = await ev(`(() => {
    const b = [...document.querySelectorAll('nav[aria-label="Laboratory"] button')].find((e) => e.textContent.includes('Experiment'));
    return b ? b.disabled === true && b.textContent.includes('Next') : 'missing';
  })()`)
  check('experiment announced but disabled', expDisabled === true, String(expDisabled))
  await clickButton('Enter the guided lab')

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
  await clickButton('Hub')
  await waitFor(() => hasText('Make a prediction. Meet reality.'), 'nav hub')
  await clickButton('Guided Lab')
  await waitFor(() => handleCenter('B1', 'b'), 'nav lab restores build', 25000)
  check('prediction stands after hub exit', await hasText('Your prediction:'))
  check('gate cleared until rebuild', !(await hasText('Continue to Reality Check')))
  await wire('B1', 'b', 'L1', 'b')
  await waitFor(() => hasText('Continue to Reality Check'), 'gate re-earned by rebuild', 25000)
  check('evidence returns with the gate', await hasText('Repair verified'))
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
  await waitFor(() => hasText('Your diagram'), 'lens lab', 20000)
  check('upload panel first', await hasText('Choose an image'))
  check('samples below upload', await hasText('Verified samples'))
  // Stub the proposal at the network layer: no live Meta call in smoke.
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/vision/propose*' }] })
  visionStubs.push(JSON.stringify({ proposal: switchFixture.proposal, assumptions: [], provider: 'fixture-stub' }))
  await uploadLensFile(switchImage)
  await waitFor(() => hasText('Interpret with Meta Spark'), 'lens selected')
  check('preview visible', await ev(`!!document.querySelector('img[alt="Uploaded schematic"]')`))
  check('chooser persists after select', await ev(`!!document.querySelector('input[type="file"]')`))
  await clickButton('Interpret with Meta Spark')
  await waitFor(() => hasText('Original diagram'), 'lens review', 20000)
  check('review defaults to Compare', await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Compare');
    return b?.getAttribute('aria-pressed') === 'true';
  })()`))
  check('replica beside original', await hasText('Interactive circuit replica'))
  check('detected evidence list', await hasText('Detected evidence') && await hasText('switch_1'))
  check('proposal counts from data', await hasText('1 battery, 1 switch, 1 bulb'))
  check('needs-review copy', await hasText('Some connections need your review'))
  // The replica (and its lock notice) mounts on the reveal beat after the panels.
  await waitFor(() => hasText('Confirm the model below before testing'), 'lens lock', 20000)
  check('confirm gate visible', await hasText('Confirm the model below before testing it against the simulator.'))
  check('no proof before confirm', !(await hasText('Confirmed circuit tested')))
  await clickButton('Confirm model')
  await waitFor(() => hasText('Verityn Solver will test'), 'lens confirmed')
  await waitFor(() => hasText('Confirmed circuit tested'), 'lens proof', 25000)
  check('proof cites open-switch reading', await hasText('Bulb dark') && await hasText('0.0 A'))
  check('proof attribution', await hasText('Measured by Verityn Solver'))
  await clickButton('Try another image')
  await waitFor(() => hasText('Choose an image'), 'lens reset')
  visionStubs.push(JSON.stringify({
    proposal: { status: 'unsupported', components: [], connections: [] },
    assumptions: [],
    provider: 'fixture-stub',
  }))
  await uploadLensFile(switchImage)
  await waitFor(() => hasText('Interpret with Meta Spark'), 'lens reselect')
  await clickButton('Interpret with Meta Spark')
  await waitFor(() => hasText('does not look like a supported circuit'), 'lens unsupported', 20000)
  check('unsupported guidance', await hasText('Try a schematic or photo'))
  check('no fake replica', !(await hasText('Interactive circuit replica')))
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
  await waitFor(() => hasText('Enter the guided lab'), 'mobile hub')
  const overflow = await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  check('mobile homepage fits 390px', overflow <= 1, `overflow ${overflow}px`)
  await clickButton('Enter the guided lab')
  await waitFor(() => hasText('open gap'), 'mobile predict')
  await send('Page.navigate', { url: BASE + '/' })
  await waitFor(() => hasText('Enter the guided lab'), 'mobile rehub')
  await clickButton('Reality Lens')
  await waitFor(() => hasText('META VISION WORKSPACE'), 'mobile lens')
  await waitFor(() => hasText('Your diagram'), 'mobile lens lab', 20000)
  const lensOverflow = await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  check('mobile lens page fits 390px', lensOverflow <= 1, `overflow ${lensOverflow}px`)

  // ---- Guided demo: a separate clean run that performs itself. ----
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: BASE + '/' })
  await waitFor(() => hasText('Watch the guided demo'), 'demo hub')
  await clickButton('Watch the guided demo')
  await waitFor(() => hasText('Demo playing'), 'demo starts')
  check('demo step 1', await hasText('Step 1 of 7'))
  await clickButton('Pause demo')
  await waitFor(() => hasText('Demo paused'), 'demo paused')
  await sleep(3500)
  check('pause holds prediction', await ev(`!!document.getElementById('predict-why')`))
  await clickButton('Resume demo')
  await waitFor(() => hasText('Demo playing'), 'demo resumed')
  await waitFor(() => ev(`(() => {
    const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'No');
    return b?.getAttribute('aria-pressed') === 'true';
  })()`), 'demo scripted choice', 30000)
  await waitFor(() => ev(`document.getElementById('predict-why')?.value === 'The open gap breaks the loop.'`), 'demo scripted why', 30000)
  await waitFor(() => hasText('Connect the two glowing terminal dots'), 'demo l1 build', 30000)
  check('demo step 2', await hasText('Step 2 of 7'))
  check('demo repair notice', await hasText('Demo: repairing the open connection'))
  await waitFor(() => hasText('Repair verified'), 'demo l1 solved', 30000)
  check('demo measured numbers', await hasText('Your completed circuit produces 0.6 A and 3.6 W.'))
  await waitFor(() => hasText('switch is open'), 'demo reality predict', 30000)
  await waitFor(() => hasText('Ask the coach'), 'demo coach invited', 45000)
  await waitFor(() => hasText('Fallback coach'), 'demo r1', 30000)
  await waitFor(() => hasText('Evidence pointer'), 'demo r2', 30000)
  await waitFor(() => hasText('Undo demonstration'), 'demo applied', 30000)
  await waitFor(() => hasText('Consistent with the model'), 'demo verdict flips', 30000)
  await waitFor(() => hasText('Contradicted by the model'), 'demo undone', 30000)
  await waitFor(() => hasText('Confirmation check'), 'demo r4', 30000)
  const demoCoachBeforeSolo = askRequestIds.length
  await waitFor(() => hasText('Solo mode'), 'demo solo', 30000)
  check('demo solo coach off', !(await hasText('Ask the coach')))
  await waitFor(() => hasText('See your journey'), 'demo solo gate', 60000)
  check('demo solo zero coach calls', askRequestIds.length === demoCoachBeforeSolo,
    `before ${demoCoachBeforeSolo}, after ${askRequestIds.length}`)
  await clickButtonStarts('See your journey')
  await waitFor(() => hasText('Demo complete'), 'demo finale')
  check('demo step 7', await hasText('Step 7 of 7'))
  await clickButton('Replay demo')
  await waitFor(() => hasText('Step 1 of 7'), 'demo replay')
  await waitFor(() => ev(`(document.getElementById('predict-why')?.value ?? '') !== ''`), 'replay scripted why', 30000)
  await fillInput('predict-why', 'manual takeover')
  await sleep(300)
  check('takeover exits demo', !(await hasText('Demo playing')) && !(await hasText('Demo paused')))
  check('takeover keeps input', await ev(`document.getElementById('predict-why')?.value === 'manual takeover'`))

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
