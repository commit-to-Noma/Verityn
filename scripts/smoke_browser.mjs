/* Browser-level smoke check for the judging path.
 *
 * Drives headless Chrome over CDP (no extra dependencies; Node 21+ for
 * global fetch/WebSocket) through the full journey against a running
 * frontend + backend pair:
 *
 *   Predict -> Build -> Reality Check -> R1 -> R2 -> R4 -> Solo -> Finale
 *     -> Homepage turntable (rotate, keyboard, station routes)
 *     -> Reality Lens stubbed upload (needs_review) -> unsupported refusal
 *     -> Lens workbench: filmstrip continuity, review inspector selection
 *     -> Guided demo full run (pause/resume, replay, manual takeover)
 *     -> Experiment presets, manual run, stale, history, one explain call
 *     -> Overload flow: intact run, voltage edit, overload, damage latch,
 *        grounded explanation, reset restores intact
 *     -> Stress rig sweep: voltage ladder, threshold table, Rig history labels
 *     -> Missions: first light, threshold, gap, loop, demolition, redline, spectrum
 *     -> Polish: HUD overlay, active badge, friendly codes, pills, run detail,
 *        sweep lock + cancel, rig refuses shorted benches
 *
 * Verifies React rendering, API wiring, lazy chunk loading, and button
 * interactions. Coach and vision responses are stubbed at the network layer:
 * no live Meta call is made by this script.
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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE ?? 'http://localhost:5173'
// Evidence path: the suite checks readings, traces, and provider chips.
const HOME = BASE + '/?proof=1'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? '9333')
const CDP = `http://127.0.0.1:${CDP_PORT}`
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR
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
const explainRequestIds = []
let healthAttempts = 0
let simulateRequests = 0
let staleSimulateNext = false
let chrome = null
let originalViewportWidth = null

function fakeTrace(tool, output, guard, decidedBy) {
  return {
    tool,
    input: 'text',
    output,
    guard,
    decided_by: decidedBy,
    ms: 1,
    attempts: 1,
    t: new Date().toISOString(),
  }
}

function fakeCoachAsk(postData) {
  const rung = JSON.parse(postData ?? '{}').rung ?? 'R1'
  if (rung === 'R2') {
    return {
      eligible: true,
      rung,
      text: 'Evidence: L1 reads 0.0 A and 0.0 W. S1 is open with 0.0 A through it.',
      provider: 'deterministic',
      claim: { type: 'lit', component: 'L1', value: true },
      actions: [{ type: 'set_switch_state', componentId: 'S1', closed: true }],
      attempts: 1,
      trace: fakeTrace('deterministic', 'structured-hint', 'accepted', 'solver'),
    }
  }
  if (rung === 'R4') {
    return {
      eligible: true,
      rung,
      text: 'Confirmation check — in your own words, why does L1 stay dark? The evidence says S1 is open with 0.0 A.',
      provider: 'deterministic',
      claim: { type: 'lit', component: 'L1', value: true },
      actions: [],
      attempts: 1,
      trace: fakeTrace('deterministic', 'structured-hint', 'accepted', 'solver'),
    }
  }
  return {
    eligible: true,
    rung: 'R1',
    text: 'The battery still holds 6.0 V, yet L1 reads 0.0 A and 0.0 W. Which component prevents charge from making a complete loop?',
    provider: 'prototype-fake',
    claim: { type: 'lit', component: 'L1', value: true },
    actions: [],
    attempts: 1,
    trace: fakeTrace('prototype-fake', 'structured-hint', 'fallback:template', 'none'),
  }
}

function fakeCoachExplain(postData) {
  // Content-aware like the ask stub: an exploded bulb in the submitted
  // netlist is an open filament, so it reads 0.0 A and 0.0 W. Wording
  // matches the deterministic fallback; its text is covered by backend
  // explanation unit tests, while the smoke proves the UI renders it.
  let exploded = null
  try {
    const components = JSON.parse(postData ?? '{}').netlist?.components ?? []
    exploded = components.find((part) => part.type === 'bulb' && part.condition === 'exploded')?.id ?? null
    if (exploded === null) {
      // Mirror the solver's blow point: past 18 V a bulb explodes on the run
      // itself, before any latch exists in the submitted netlist.
      const totalVolts = components
        .filter((part) => part.type === 'battery')
        .reduce((sum, part) => sum + (Number(part.volts) || 0), 0)
      if (totalVolts > 18) {
        exploded = components.find((part) => part.type === 'bulb')?.id ?? null
      }
    }
  } catch {
    exploded = null
  }
  return {
    eligible: true,
    text: exploded !== null
      ? `Light 1 exploded and no longer completes the circuit: 0.0 A and 0.0 W. Reset the bench to restore an intact bulb.`
      : 'The open switch breaks the loop, so the bulb reads 0.0 A and 0.0 W.',
    provider: 'prototype-fake',
    valid: true,
    error_code: null,
    trace: fakeTrace('prototype-fake', 'structured-explanation', 'fallback:template', 'none'),
  }
}

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

/** One voice: no sentence (4+ words) may appear in two visible blocks of a stage. */
async function assertOneVoice(label) {
  const dupes = await ev(`(() => {
    const section = document.querySelector(
      'section[aria-labelledby="predict-heading"], section[aria-labelledby="canvas-heading"]',
    );
    if (!section) return 'NO-STAGE';
    const blocks = [...section.querySelectorAll('p')]
      .map((p) => p.innerText.trim())
      .filter((t) => t.length > 0);
    const seen = new Set();
    const dupes = new Set();
    for (const block of blocks) {
      const sentences = new Set(
        block
          .split(/(?<=[.!?])\\s+/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.split(/\\s+/).length >= 4),
      );
      for (const s of sentences) {
        if (seen.has(s)) dupes.add(s);
        else seen.add(s);
      }
    }
    return JSON.stringify([...dupes].slice(0, 3));
  })()`)
  check(`one voice (${label})`, dupes === '[]', dupes === '[]' ? '' : dupes)
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

async function ensureSummaryOpen(text, scope = 'details') {
  const found = await ev(`(() => {
    const summary = [...document.querySelectorAll(${JSON.stringify(scope)} + ' summary')]
      .find((e) => e.textContent.trim() === ${JSON.stringify(text)});
    if (!summary) return false;
    if (!summary.parentElement.open) summary.click();
    return true;
  })()`)
  if (!found) throw new Error('summary not found: ' + text)
}

async function captureScreenshot(name, width = 1440, scrollTo = null) {
  if (!SCREENSHOT_DIR) return
  const previous = await ev(`({ width: innerWidth, height: innerHeight, scrollY })`)
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: Math.max(previous.height, 1000),
    deviceScaleFactor: 1,
    mobile: false,
  })
  await ev('window.dispatchEvent(new Event("resize"))')
  if (scrollTo) {
    await ev(`document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView({ block: 'center' })`)
  } else {
    await ev('window.scrollTo(0, 0)')
  }
  await sleep(400)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const path = join(SCREENSHOT_DIR, `${name}.png`)
  writeFileSync(path, Buffer.from(shot.data, 'base64'))
  console.log(`SCREENSHOT ${path}`)
  await send('Emulation.setDeviceMetricsOverride', {
    width: previous.width,
    height: previous.height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await ev('window.dispatchEvent(new Event("resize"))')
  await ev(`window.scrollTo(0, ${previous.scrollY})`)
}

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

async function clickTab(text) {
  const ok = await ev(`(() => {
    const list = document.querySelector('[role="tablist"]');
    const match = list && [...list.querySelectorAll('[role="tab"]')]
      .find((e) => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled);
    if (!match) return false;
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`)
  if (!ok) throw new Error('station tab not found: ' + text)
}

async function clickPresetButton(title, label) {
  const ok = await ev(`(() => {
    const cards = [...document.querySelectorAll('section[aria-label="Starter experiments"] div.glass-panel')];
    const card = cards.find((d) => d.textContent.includes(${JSON.stringify(title)}));
    const b = card && [...card.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(label)} && !e.disabled);
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  })()`)
  if (!ok) throw new Error('preset button not found: ' + title + '/' + label)
}

async function missionDone(id) {
  return ev(`document.querySelector('[data-mission="${id}"]')?.lastElementChild?.textContent.trim() === 'Done'`)
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

async function setDockVoice(enabled) {
  const found = await ev(`(() => {
    const button = document.querySelector('[aria-label="Coach dock"] button[title="Browser voice, not Meta"]');
    if (!button) return false;
    if (button.getAttribute('aria-pressed') !== ${JSON.stringify(String(enabled))}) button.click();
    return true;
  })()`)
  if (!found) return false
  return waitFor(
    () => ev(`document.querySelector('[aria-label="Coach dock"] button[title="Browser voice, not Meta"]')?.getAttribute('aria-pressed') === ${JSON.stringify(String(enabled))}`),
    `dock voice ${enabled ? 'on' : 'off'}`,
  )
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
    const c = document.querySelector('[aria-label="Circuit canvas"], [aria-label$="starting circuit"]');
    if (c) c.scrollIntoView({ block: 'center' });
  })()`)
  await sleep(400)
}

async function assertGuidedCanvasFits(stage) {
  if (originalViewportWidth === null) {
    originalViewportWidth = await ev('window.innerWidth')
  }
  for (const width of [390, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await ev('window.dispatchEvent(new Event("resize"))')
    await sleep(650)
    const layout = await ev(`(() => {
      const canvas = document.querySelector('[aria-label="Circuit canvas"], [aria-label$="starting circuit"]');
      const flow = canvas?.closest('.react-flow') ?? canvas;
      const bounds = flow?.getBoundingClientRect();
      const nodes = [...(canvas?.querySelectorAll('.react-flow__node') ?? [])]
        .map((node) => node.getBoundingClientRect());
      return {
        present: !!canvas && !!bounds && bounds.width > 0 && bounds.height > 0,
        fits: !!bounds && bounds.left >= -1 && bounds.right <= window.innerWidth + 1
          && nodes.every((node) => node.left >= bounds.left - 1
            && node.right <= bounds.right + 1
            && node.top >= bounds.top - 1
            && node.bottom <= bounds.bottom + 1),
        pageFits: document.documentElement.scrollWidth <= window.innerWidth,
        canvas: bounds ? { left: bounds.left, right: bounds.right, width: bounds.width } : null,
        nodeBounds: nodes.map((node) => ({
          left: Math.round(node.left),
          right: Math.round(node.right),
          top: Math.round(node.top),
          bottom: Math.round(node.bottom),
        })),
        nodeCount: nodes.length,
      };
    })()`)
    check(`${stage} canvas present and fits at ${width}px`,
      layout.present && layout.fits && layout.pageFits, JSON.stringify(layout))
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: originalViewportWidth,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await sleep(250)
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
  } catch (error) {
    console.error('DRIVER ERROR:', error instanceof Error ? error.message : String(error))
    try {
      console.error('PAGE STATE:', await ev('document.body.innerText.slice(-6000)'))
    } catch { /* page may have closed */ }
    if (SCREENSHOT_DIR && ws?.readyState === WebSocket.OPEN) {
      try {
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        mkdirSync(SCREENSHOT_DIR, { recursive: true })
        const path = join(SCREENSHOT_DIR, 'smoke-fail.png')
        writeFileSync(path, Buffer.from(shot.data, 'base64'))
        console.error('screenshot:', path)
      } catch { /* preserve the original failure */ }
    }
    throw error
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
      if (url.includes('/api/coach/explain')) {
        explainRequestIds.push(msg.params.requestId)
      }
      if (url.includes('SnapBuildLab') || url.includes('RealityLens')) {
        lazyChunks.add(url)
      }
    } else if (msg.method === 'Fetch.requestPaused') {
      const { requestId, request } = msg.params
      if (request.url.includes('/api/health')) {
        healthAttempts += 1
        if (healthAttempts === 1) {
          send('Fetch.fulfillRequest', {
            requestId,
            responseCode: 503,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
            body: Buffer.from('{"status":"starting"}').toString('base64'),
          }).catch(() => {})
        } else if (healthAttempts === 2) {
          setTimeout(() => {
            send('Fetch.continueRequest', { requestId }).catch(() => {})
          }, 1500)
        } else {
          send('Fetch.continueRequest', { requestId }).catch(() => {})
        }
        return
      }
      if (request.url.includes('/api/simulate')) {
        simulateRequests += 1
        if (staleSimulateNext) {
          staleSimulateNext = false
          const stale = {
            ok: true,
            node_voltages: { p: 6, 0: 0 },
            components: { L1: { voltage: 6, current: 0.6, power: 3.6 } },
            error_code: null,
            error_message: '',
            component_ids: [],
            conditions: { L1: 'overloaded' },
            ratings: { L1: { rated_volts: 6, max_safe_watts: 6 } },
          }
          send('Fetch.fulfillRequest', {
            requestId,
            responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
            body: Buffer.from(JSON.stringify(stale)).toString('base64'),
          }).catch(() => {})
        } else {
          send('Fetch.continueRequest', { requestId }).catch(() => {})
        }
        return
      }
      if (request.url.includes('/api/coach/ask')) {
        const response = fakeCoachAsk(request.postData)
        send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(response)).toString('base64'),
        }).catch(() => {})
        return
      }
      if (request.url.includes('/api/coach/explain')) {
        const response = fakeCoachExplain(request.postData)
        send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(response)).toString('base64'),
        }).catch(() => {})
        return
      }
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
  await send('Fetch.enable', {
    patterns: [
      { urlPattern: '*/api/simulate*' },
      { urlPattern: '*/api/health*' },
      { urlPattern: '*/api/vision/propose*' },
      { urlPattern: '*/api/coach/ask*' },
      { urlPattern: '*/api/coach/explain*' },
    ],
  })
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'try { localStorage.clear(); sessionStorage.clear(); } catch {}',
  })
  await send('Page.navigate', { url: HOME })
  await waitFor(() => hasText('Start your own lab'), 'hub')
  await waitFor(
    () => hasText('Waking the simulator. First load can take up to 30 seconds.'),
    'hub waking state',
  )
  await waitFor(() => healthAttempts >= 2, 'automatic health retry')
  check(
    'hub health check retries with visible progress',
    healthAttempts >= 2 && await ev(`!!document.querySelector('[role="progressbar"][aria-label="Simulator startup"]')`),
    `attempts=${healthAttempts}`,
  )
  await waitFor(
    async () => (await hasText('Start your own lab')) && !(await hasText('Waking the simulator')),
    'hub health resolved',
  )
  check('ready pill hidden on hub', !(await hasText('Simulator ready')))
  check('guided lab purpose line removed from hero', !(await hasText('Guided Lab: predict what a circuit will do')))
  check('tab title', await ev('document.title') === 'Verityn - STEM laboratory', await ev('document.title'))
  check('trace details on via param', await ev(`document.querySelector('[aria-label="Trace details"]')?.getAttribute('aria-checked') === 'true'`))
  const iconHref = await ev(`document.querySelector('link[rel="icon"]')?.getAttribute('href') ?? 'missing'`)
  check('brand icon linked', iconHref === '/brand/verityn-logo-transparent.png', iconHref)
  const iconRes = await fetch(BASE + iconHref)
  const iconBytes = Number(iconRes.headers.get('content-length') ?? '0')
  check('brand icon served and bounded', iconRes.ok && iconBytes > 0 && iconBytes < 100 * 1024, `${iconRes.status} ${iconBytes}B`)
  check('hero headline', await hasText('Imagine it. Test it. Understand it.'))
  check('meta stack lives in the console, not a footnote', !(await hasText('Built with Meta')) && await hasText('Muse Spark'))
  check('lab identity', await hasText('Verityn Laboratory'))
  check('first-lab line honest', await hasText('Circuits are our first live Engineering module.'))
  check('hero entries', await hasText('Start your own lab') && await hasText('Watch a walkthrough'))
  check('discipline ring', await hasText('Drag the ring') && await hasText('FIRST LIVE MODULE'))
  check('lab loop', await hasText('A simple learning loop') && await hasText('Make a claim'))
  check('why matters', await hasText('Answers are everywhere. Understanding is not.'))
  await ev(`[...document.querySelectorAll('[aria-label="The laboratory loop"] button')].find((b) => b.textContent.includes('Test with the simulator'))?.click()`)
  check('loop timeline expands stops', await hasText('measured, not guessed'))
  check('why matters lists five reasons', await ev(`document.querySelectorAll('#impact-heading ~ ol > li').length`) === 5)
  await captureScreenshot('hub')
  // Tool turntable: visible stations, rotation, keyboard, and real routes.
  check('turntable visible', await hasText('Explore the laboratory') && await hasText('1 / 5 · VERITYN TOOLS'))
  await clickTab('Reality Lens')
  await waitFor(() => hasText('3 / 5 · VERITYN TOOLS'), 'turntable direct select')
  check('tab selected state', await ev(`document.getElementById('station-tab-lens')?.getAttribute('aria-selected') === 'true'`))
  check('station announcement', await hasText('Turn a circuit image into a model you can review and test.'))
  await ev(`document.getElementById('station-tab-lens').focus()`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await waitFor(() => hasText('4 / 5 · VERITYN TOOLS'), 'turntable keyboard')
  check('no auto-advance without input', await sleep(2500).then(() => hasText('4 / 5 · VERITYN TOOLS')))
  await clickTab('Guided Lab')
  await waitFor(() => hasText('1 / 5 · VERITYN TOOLS'), 'turntable back to lab')
  await clickButtonStarts('Open Guided Lab')
  await waitFor(() => hasText('Mounting Engineering Workspace'), 'swoosh plays', 5000)
  check('lab swoosh mounts the workspace', await hasText('Initializing Module 1'))
  check('hub stays behind the swoosh', await hasText('Imagine it. Test it. Understand it.'))
  await waitFor(() => hasText('loose ends'), 'station opens lab')
  await clickButton('Hub')
  await waitFor(() => hasText('Imagine it. Test it. Understand it.'), 'hub again')
  await clickTab('Experiment Bay')
  await waitFor(() => hasText('2 / 5 · VERITYN TOOLS'), 'turntable experiment')
  await clickButtonStarts('Open Experiment')
  await waitFor(() => hasText('Build something. Test what happens.'), 'station opens experiment')
  await clickButton('Hub')
  await waitFor(() => hasText('Imagine it. Test it. Understand it.'), 'hub after experiment')
  await clickTab('Reality Lens')
  await waitFor(() => hasText('3 / 5 · VERITYN TOOLS'), 'turntable lens')
  await clickButtonStarts('Open Reality Lens')
  await waitFor(() => hasText('META VISION WORKSPACE'), 'station opens lens')
  await clickButton('Hub')
  await waitFor(() => hasText('Imagine it. Test it. Understand it.'), 'hub after lens')
  await clickTab('Meta Muse Spark')
  await waitFor(() => hasText('4 / 5 · VERITYN TOOLS'), 'turntable coach')
  await clickButtonStarts('See how the coach works')
  await sleep(900)
  check('coach station scrolls to method', await ev(`document.getElementById('laboratory-loop-heading').getBoundingClientRect().top < window.innerHeight`))
  await clickTab('Verityn Solver')
  await waitFor(() => hasText('5 / 5 · VERITYN TOOLS'), 'turntable solver')
  await clickButtonStarts('Run an experiment')
  await waitFor(() => hasText('Build something. Test what happens.'), 'station opens bench')
  await clickButton('Hub')
  await waitFor(() => hasText('Imagine it. Test it. Understand it.'), 'hub after solver')
  check('shell nav', await hasText('Guided Lab') && await hasText('Reality Lens') && await hasText('Experiment Bay') && await ev(`![...document.querySelectorAll('nav')].some((n) => (n.innerText ?? '').includes('Under the hood'))`))
  check('no hood dropdown in nav', await ev(`document.querySelector('nav[aria-label="Laboratory"] details') === null`))
  const navCurrent = await ev(`document.querySelector('nav[aria-label="Laboratory"] button[aria-current="page"]')?.textContent.trim() ?? 'none'`)
  check('hub is current location', navCurrent === 'Hub', navCurrent)
  const expEnabled = await ev(`(() => {
    const b = [...document.querySelectorAll('nav[aria-label="Laboratory"] button')].find((e) => e.textContent.includes('Experiment'));
    return b ? b.disabled !== true && !b.textContent.includes('Next') : 'missing';
  })()`)
  check('experiment enabled in nav', expEnabled === true, String(expEnabled))
  await captureScreenshot('hub-start')
  await clickButton('Start your own lab')

  const swooshStart = Date.now()
  await waitFor(() => hasText('loose ends'), 'l1 predict')
  check('swoosh runs five seconds', Date.now() - swooshStart >= 4500)
  check('swoosh settles into the lab', !(await hasText('Mounting Engineering Workspace')))
  check(
    'guided lab opens with the task',
    await hasText('Welcome to the Guided Lab. This bulb is off because the circuit has a gap. Will it light once the loose ends are connected?'),
  )
  await assertGuidedCanvasFits('Predict')
  await captureScreenshot('predict')
  await assertOneVoice('predict')
  const micLabel = await ev(`document.querySelector('#predict-why + button')?.getAttribute('aria-label') ?? 'missing'`)
  check('mic button renders with honest state', micLabel === 'Record a reason with Meta Muse Voice Transcribe' || micLabel === 'Stop voice recording', micLabel)
  check('coach dock shows the current line', await ev(`!!document.querySelector('[aria-label="Coach dock"] p[aria-live="polite"]')`))
  check('browser voice muted by default', await ev(`document.querySelector('[aria-label="Coach dock"] button[title="Browser voice, not Meta"]')?.getAttribute('aria-pressed') === 'false'`))
  check('voice toggle is in the dock', await ev(`!!document.querySelector('[aria-label="Coach dock"] button[title="Browser voice, not Meta"]')`))
  check('dock voice turns on', await setDockVoice(true))
  await waitFor(() => hasText('Reply by voice'), 'tap-to-talk offered', 10000)
  await sleep(2500)
  check('no auto-listen loop', !(await hasText('Listening. Pausing will send')))
  check('dock voice turns off', await setDockVoice(false))
  await clickButton('No')
  await fillInput('predict-why', 'gap breaks the loop')
  await clickButton('Continue to fix it')
  await waitFor(() => handleCenter('B1', 'b'), 'l1 canvas')
  await assertGuidedCanvasFits('Build before test')
  await captureScreenshot('build-before-test')
  await assertOneVoice('build-before')
  await wire('B1', 'b', 'L1', 'b')
  await waitFor(() => hasText('Test with the switch open'), 'l1 gate', 25000)
  await assertGuidedCanvasFits('Build after test')
  await captureScreenshot('build-after-test')
  await assertOneVoice('build-after')

  await ensureSummaryOpen('See details', 'section[aria-label="Test result"]')
  check('original prediction details', await hasText('Your original prediction'))
  check('initial copy (stay dark)', await hasText('Your initial prediction was that the open circuit would stay dark.'))
  check('repaired circuit details', await hasText('You completed the loop'))
  check('repair numbers', await hasText('Your completed circuit produces 0.6 A and 3.6 W.'))
  check('prediction recap chip', await ev(`!!document.querySelector('[aria-label="Prediction recap"]')`))
  check('flow paced by amps', await ev(`[...document.querySelectorAll('.react-flow__edge.animated path.react-flow__edge-path')].some((p) => p.style.animationDuration === '0.5s')`))
  check('3-section card', await hasText('What the simulator observed'))
  check('simulator ready badge', await hasText('Simulator ready'))
  await clickButton('Hub')
  await waitFor(() => hasText('Imagine it. Test it. Understand it.'), 'nav hub')
  await clickButton('Guided Lab')
  await waitFor(() => handleCenter('B1', 'b'), 'nav lab restores build', 25000)
  check('prediction stands after hub exit', await hasText('Your prediction:'))
  check('gate cleared until rebuild', !(await hasText('Test with the switch open')))
  await wire('B1', 'b', 'L1', 'b')
  await waitFor(() => hasText('Test with the switch open'), 'gate re-earned by rebuild', 25000)
  await ensureSummaryOpen('See details', 'section[aria-label="Test result"]')
  check('evidence returns with the gate', await hasText('You completed the loop'))
  await clickButtonStarts('Test with the switch open')

  await waitFor(() => hasText('REALITY CHECK · THE OPEN SWITCH'), 'reality predict')
  await assertGuidedCanvasFits('Reality Check')
  await clickButton('Yes')
  await fillInput('predict-why', 'um complete loop loop lights, um')
  await clickButtonStarts('Continue')
  await clickButton('Test again')
  check('guided build keeps inline palette', await ev(`!![...document.querySelectorAll('[aria-label="Palette"]')].find((el) => el.offsetParent !== null && !el.closest('[aria-label="Part dock"]'))`))
  await waitFor(() => hasText('MEASURED BY THE SOLVER'), 'Reality Check measurement', 25000)
  await assertGuidedCanvasFits('Reality Check after test')
  check('prediction chip is cleaned of fillers and repeats', await ev(`(() => {
    const chip = document.querySelector('[aria-label="Prediction recap"]')?.innerText ?? '';
    return chip.includes('Complete loop lights') && !/\\bum\\b/i.test(chip);
  })()`))
  await captureScreenshot('reality-check-after-test')
  check('reality verdict line visible', await hasText('You predicted Yes'))
  check('reality verdict personal', await hasText('That disagreed with your prediction'))
  check('solo waits on an engaged reply', await hasText('Answer the coach to unlock Solo') && !(await hasText('Start the Solo challenge')))
  check('reality battery supplies wording', await ev(`(document.querySelector('section[aria-labelledby="canvas-heading"]')?.innerText ?? '').includes('supplies 0.0 A (0.0 W)')`))
  await assertOneVoice('reality-after')
  check('reality follow-up asked', await ev(`document.body.textContent.includes('What would you change to make the bulb light?')`))
  check('retest button offered', await hasText('Close the switch and test again'))
  check('practice block removed', !(await hasText('Your turn: flip the switch yourself')))
  check('reality evidence row groups prediction and result', await ev(`(() => {
    const row = document.querySelector('[aria-label="Evidence verification"]');
    if (!row || row.offsetParent === null) return false;
    const text = row.innerText;
    return text.includes('Complete loop lights') && text.includes('MEASURED BY THE SOLVER');
  })()`))
  await ev(`[...document.querySelectorAll('[aria-label="Coach dock"] summary')].find((e) => e.textContent.includes('Earlier'))?.click()`)
  check('coach invites live flipping', await hasText('Try flipping the switch off and on'))
  await captureScreenshot('reality-followup')
  await waitFor(() => askRequestIds.length >= 1, 'automatic R1 question', 25000)
  await waitFor(() => hasText('Fallback coach'), 'fake R1', 20000)
  check('reply box asks in the open', await ev(`document.querySelector('#coach-reply')?.offsetParent !== null`))
  await captureScreenshot('reality-reply-box', 1440, '[aria-label="Coach questions"]')
  await assertOneVoice('reality-rung-visible')
  await ensureSummaryOpen('See details', 'section[aria-label="Test result"]')
  check('dock retained muted state', await ev(`document.querySelector('[aria-label="Coach dock"] button[title="Browser voice, not Meta"]')?.getAttribute('aria-pressed') === 'false'`))
  await fillInput('coach-reply', 'close the switch S1')
  await clickButton('Save')
  await waitFor(() => hasText('Coach heard'), 'engaged reply unlocks', 10000)
  check('engaged reply unlocks solo', await hasText('Start the Solo challenge'))
  check('reality action row groups retest and gate', await ev(`(() => {
    const row = document.querySelector('[aria-label="Sandbox actions"]');
    if (!row || row.offsetParent === null) return false;
    const text = row.innerText;
    return text.includes('Close the switch and test again') && text.includes('Start the Solo challenge');
  })()`))
  check('trace drawer present', await hasText('What Meta did / What code checked'))
  check('R1 request recorded for the trace drawer', askRequestIds.length === 1, `got ${askRequestIds.length}`)
  check('trace drawer closed by default', await ev(`[...document.querySelectorAll('details')].find((e) => e.querySelector('summary')?.textContent.includes('What Meta did'))?.open !== true`))
  await ev(`[...document.querySelectorAll('details')].find((e) => e.querySelector('summary')?.textContent.includes('What Meta did'))?.querySelector('summary')?.click()`)
  await waitFor(() => hasText('Template fallback'), 'trace event recorded', 10000)
  check('trace names serving tool', await hasText('prototype-fake'))
  await clickButton('Point to it on the circuit')
  await waitFor(() => hasText('Show me'), 'r2', 20000)
  check('fake coach line is not marked Meta', await ev(`!document.querySelector('[aria-label="Coach dock"]')?.innerText.includes('Meta Spark')`))
  check('earlier coach lines are expandable', await ev(`!!document.querySelector('[aria-label="Coach dock"] details summary')`))
  check('dock speaker plays the current line', await setDockVoice(true))
  check('dock speaker can be turned off', await setDockVoice(false))

  // Stuck-helper: closing the switch on the open-switch stage names the
  // problem instead of silently flipping the verdict.
  const toggleLabel = await ev(`[...document.querySelectorAll('[data-id="S1"] button')].map((b) => b.textContent.trim()).join('|')`)
  check('switch toggle found', toggleLabel !== '', toggleLabel)
  await ev(`[...document.querySelectorAll('[data-id="S1"] button')][0]?.click()`)
  await clickButton('Test again')
  await waitFor(() => hasText('The switch is closed, but this challenge uses it open.'), 'stuck notice', 25000)
  await ev(`[...document.querySelectorAll('[data-id="S1"] button')][0]?.click()`)
  await clickButton('Test again')
  await waitFor(() => hasText('Prediction did not match'), 'stuck reopened', 25000)
  check('stuck notice clears', !(await hasText('The switch is closed, but this challenge uses it open.')))

  // Demo excursion mid-ladder: the served R1/R2 cards must survive the
  // verdict flip, and R4 must still be the next rung after undo.
  await clickButton('Show me')
  await waitFor(() => hasText('Your prediction matched the circuit result'), 'demo apply flips verdict', 25000)
  check('demo apply shows fresh lit reading', await hasText('3.6 W'))
  check('undo offered at canvas', await hasText('Undo demonstration'))
  await clickButton('Undo demonstration')
  await waitFor(() => hasText('Prediction did not match'), 'demo undo restores', 25000)
  check('undo restores dark reading', await hasText('0.0 W'))
  await clickButton('Try the demonstration')
  await waitFor(() => hasText('Confirmation check'), 'r4', 20000)
  await assertOneVoice('reality-ladder-complete')

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

  await clickButton('Close the switch and test again')
  await waitFor(() => hasText('Open the switch and test again'), 'retest ran', 25000)
  await waitFor(() => hasText('Closing the switch completed the loop'), 'retest confirmation', 25000)
  check('retest shows lit reading', await hasText('3.6 W'))
  check('retest skips stuck notice', !(await hasText('The switch is closed, but this challenge uses it open.')))
  check('follow-up asked once', await ev(`document.body.textContent.split('What would you change to make the bulb light?').length - 1 === 1`))
  await captureScreenshot('reality-retest-button', 1440, '[aria-label="Chapter complete"]')
  await clickButton('Open the switch and test again')
  await waitFor(() => hasText('Prediction did not match'), 'retest reopened', 25000)

  const coachCallsBeforeSolo = askRequestIds.length
  await waitFor(() => hasText('Solo: the second bulb'), 'flip auto-advance', 25000)
  check('retest excursion auto-advances to solo', !(await hasText('REALITY CHECK · THE OPEN SWITCH')))
  await assertGuidedCanvasFits('Solo prediction')
  check('no coach in solo', !(await hasText('Ask the coach')))
  const soloMic = await ev(`document.querySelector('#predict-why + button')?.getAttribute('aria-label') ?? 'missing'`)
  check('solo mic offered without coach', soloMic === 'Record a reason with Meta Muse Voice Transcribe', soloMic)
  await clickButton('Yes')
  await fillInput('predict-why', 'parallel bulb lights')
  await clickButton('Continue to wire it')
  await waitFor(() => handleCenter('L2', 'b'), 'solo canvas')
  await wire('L2', 'b', 'L1', 'b')
  await waitFor(() => hasText('View completed journey'), 'solo gate', 25000)
  await assertGuidedCanvasFits('Solo after test')
  await captureScreenshot('solo-after-test')
  check('solo verdict line visible', await hasText('You predicted Yes'))
  check('solo verdict personal', await hasText('That agreed with your prediction'))
  check('solo battery supplies wording', await ev(`(document.querySelector('section[aria-labelledby="canvas-heading"]')?.innerText ?? '').includes('supplies 1.2 A (7.2 W)')`))
  check('solo canvas never negative', await ev(`(() => {
    const text = document.querySelector('section[aria-labelledby="canvas-heading"]')?.innerText ?? '';
    return !text.includes('-1.2 A') && !text.includes('-7.2 W');
  })()`))
  await assertOneVoice('solo-after')
  check('solo made zero coach calls', askRequestIds.length === coachCallsBeforeSolo,
    `before ${coachCallsBeforeSolo}, after ${askRequestIds.length}`)
  check('solo coach-off lock', await hasText('Coach off.'))
  await clickButtonStarts('View completed journey')
  await waitFor(() => hasText('Your journey'), 'finale')
  await captureScreenshot('finale-1440')
  await captureScreenshot('finale-390', 390)
  check('journey progress highlights Recap', await ev(`(() => {
    const current = document.querySelector('[aria-label="Journey progress"] [aria-current="step"]');
    return current?.textContent?.trim() === 'Recap';
  })()`))
  check('finale solo verdict uses the measured result', await ev(`(() => {
    const solo = [...document.querySelectorAll('[aria-label="Your circuit journey"] li')]
      .find((item) => item.querySelector('h3')?.innerText.includes('Solo'));
    return !!solo && solo.innerText.includes('You predicted Yes.')
      && solo.innerText.includes('The solver measured');
  })()`))
  check('journey snapshots supplies wording', await ev(`(() => {
    const journey = document.querySelector('[aria-label="Your circuit journey"]')?.innerText ?? '';
    return journey.includes('supplies 1.2 A (7.2 W)') && !journey.includes('-1.2 A');
  })()`))
  check('solo preview rebuilt cleanly', await ev(`(() => {
    const flow = [...document.querySelectorAll('.react-flow[aria-label]')]
      .find((element) => /Solo circuit$/.test(element.getAttribute('aria-label') ?? ''));
    if (!flow) return false;
    const labels = [...flow.querySelectorAll('.react-flow__node')].map((n) => n.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '');
    return labels.length === 4 && ['B1', 'S1', 'L1', 'L2'].every((id) => labels.some((t) => t.includes(id)));
  })()`))
  check('finale battery thumbnail uses positive supply readings', await ev(`(() => {
    const flow = [...document.querySelectorAll('.react-flow[aria-label]')]
      .find((element) => /Solo circuit$/.test(element.getAttribute('aria-label') ?? ''));
    const battery = flow?.querySelector('[aria-label="B1 measurement"]');
    return !!battery && battery.textContent?.includes('1.2 A')
      && battery.textContent.includes('7.2 W')
      && !battery.textContent.includes('-');
  })()`))
  check(
    'journey shows all three chapters and measured values',
    await hasText('Your journey') && await hasText('Light the bulb') && await hasText('Open switch')
      && await hasText('Solo') && await hasText('You said') && await hasText('The solver measured'),
  )
  check('journey you-said is cleaned of fillers and repeats', await ev(`(() => {
    const reality = [...document.querySelectorAll('[aria-label="Your circuit journey"] li')]
      .find((item) => item.querySelector('h3')?.innerText.includes('Open switch'));
    return !!reality && reality.innerText.includes('Complete loop lights')
      && !/\\bum\\b/i.test(reality.innerText);
  })()`))
  check('journey you-said label appears once', await ev(`(() => {
    const items = [...document.querySelectorAll('[aria-label="Your circuit journey"] li')];
    return items.length > 0 && items.every(
      (item) => (item.innerText.match(/You said/g) ?? []).length <= 1,
    );
  })()`))
  check('share disclosure starts collapsed', await ev(`(() => {
    const summary = [...document.querySelectorAll('details summary')]
      .find((e) => e.textContent.trim() === 'Share your result');
    return !!summary && !summary.parentElement.open;
  })()`))
  await ensureSummaryOpen('Share your result')
  await waitFor(() => hasText('Evidence card'), 'evidence card')
  check('evidence card shown', await hasText('A shareable record of this session.') && await hasText('Computed by a solver. Not an AI score.'))
  await clickButton('Download card')
  await waitFor(() => hasText('Evidence card downloaded.'), 'card png renders', 20000)
  check('evidence card png renders', true)
  check('card preview is 1200x630', await ev(`(() => {
    const img = document.querySelector('section[aria-label="Evidence card"] img');
    return img !== null && img.naturalWidth === 1200 && img.naturalHeight === 630;
  })()`))
  await ev(`[...document.querySelectorAll('summary')].find((e) => e.textContent.trim() === 'See the full session trace')?.click()`)
  await waitFor(() => hasText('Evidence trace'), 'journey trace', 20000)
  await ev(`[...document.querySelectorAll('summary')].filter((e) => e.textContent.trim() === 'Evidence trace').forEach((e) => e.click())`)
  await sleep(500)
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
  check('reality check chapter trace', await hasText('Reality Check: the open switch'))
  check('all three chapter traces',
    await hasText('Light the bulb') && await hasText('Reality Check: the open switch')
      && await hasText('Solo: the second bulb'))
  await clickButton('Explain with Muse Spark')
  await waitFor(async () => (await hasText('Meta Spark')) || (await hasText('Fallback coach')), 'explain answered', 25000)
  check('explain never ends red', !(await hasText('ended with a question')))
  check('explain buttons side by side', await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Explain with Muse Spark');
    return btn?.parentElement?.classList.contains('flex-row') === true;
  })()`))
  await clickButton('An open switch ...')
  check('reflection chip fills starter', await ev(`document.querySelector('textarea[aria-label="Your reflection"]')?.value.includes('An open switch') === true`))
  await clickButton('Save my reflection')
  await waitFor(() => hasText('the open switch is a gap'), 'reflection grounded', 10000)
  check('reflection grounded in amps', await hasText('measured 0 A'))
  await captureScreenshot('finale-reflection', 1440, '[aria-label="Reflection"]')
  await clickButton('Open Reality Lens')
  // innerText reflects the CSS uppercase transform on the eyebrow.
  await waitFor(() => hasText('META VISION WORKSPACE'), 'lens page')
  check('lens page heading', await hasText('Reality Lens'))
  check('lens back button removed', !(await hasText('← Back to guided journey')))
  check('logo links home', await ev(`!!document.querySelector('button[aria-label="Verityn home"]')`))
  await waitFor(() => hasText('Your diagram'), 'lens lab', 20000)
  check('upload panel first', await hasText('Choose an image'))
  check('lens hero focuses the upload', await hasText('Drop a circuit diagram to see it'))
  check('samples below upload', await hasText('Sample diagrams'))
  await captureScreenshot('lens-idle')
  await captureScreenshot('lens-idle-390', 390)
  await ev(`(() => {
    const card = [...document.querySelectorAll('#lens-samples button')]
      .find((button) => button.textContent.includes('Textbook loop'));
    card?.scrollIntoView({ block: 'center' });
    card?.click();
    return !!card;
  })()`)
  await waitFor(() => hasText('Tap a highlighted point'), 'sample segment points', 20000)
  await ev(`document.querySelector('button[data-segment="battery"]')?.click()`)
  await waitFor(() => hasText('Battery sample segment'), 'sample segment selected', 10000)
  check('sample tap names the saved SAM 3.1 segment', await hasText('SAM 3.1 confidence 0.91'))
  check('sample taps stay honest', await hasText('no live SAM 3.1 call is made'))
  await captureScreenshot('lens-sample-segment', 1440, '#lens-samples')
  await clickButton('← Sample gallery')
  await waitFor(() => hasText('Sample diagrams'), 'sample gallery restored', 20000)
  // Stub the proposal at the network layer: no live Meta call in smoke.
  visionStubs.push(JSON.stringify({ proposal: switchFixture.proposal, assumptions: [], provider: 'fixture-stub' }))
  await uploadLensFile(switchImage)
  check('auto-interpret, no button', !(await hasText('Interpret with Meta Spark')))
  await waitFor(() => hasText('Original diagram'), 'lens review', 20000)
  check('preview visible', await ev(`!!document.querySelector('img[alt="Uploaded schematic"]')`))
  check('chooser persists after select', await ev(`!!document.querySelector('input[type="file"]')`))
  check('drop zone offered', await ev(`!!document.querySelector('[aria-label="Diagram drop zone"]')`))
  check('no upload prediction gate', !(await hasText('Before we interpret: will it light?')))
  check('filmstrip offers samples during review', await ev(`!!document.querySelector('[aria-label="Diagram filmstrip"] button[data-filmstrip="textbook-loop"]')`))
  check('filmstrip marks upload active', await ev(`document.querySelector('[data-filmstrip="upload"]')?.getAttribute('aria-current') === 'true'`))
  check('review defaults to Compare', await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Compare');
    return b?.getAttribute('aria-pressed') === 'true';
  })()`))
  check('replica beside original', await hasText('Interactive circuit replica'))
  await waitFor(() => ev(`!!document.querySelector('button[aria-label^="switch_1"]')`), 'overlay parts', 15000)
  check('overlay shows part ids', await hasText('switch_1'))
  check('proposal counts from data', await hasText('1 battery, 1 switch, 1 bulb'))
  check('needs-review copy', await hasText('Some connections need your review'))
  check('inspector health summary', await hasText('Circuit health') && await hasText('3 parts: 1 battery, 1 switch, 1 bulb'))
  check('column 1 evidence summary', await ev(`document.querySelector('[aria-label="Detected evidence summary"]')?.innerText.includes('wires traced') ?? false`))
  await ev(`[...document.querySelectorAll('[aria-label="Detected evidence summary"] button')].find((b) => b.textContent.trim() === 'switch_1')?.click()`)
  check('evidence chip inspects part', await waitFor(() => ev(`document.querySelector('[aria-label="Review inspector"]')?.innerText.includes('switch_1') ?? false`), 'chip selection', 10000))
  await ev(`[...document.querySelectorAll('[aria-label="Detected evidence summary"] button')].find((b) => b.textContent.trim() === 'switch_1')?.click()`)
  check('needs-review pulse dot', await ev(`!!document.querySelector('.review-pulse-dot')`))
  await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Focus photo')?.click()`)
  check('focus photo hides replica', !(await hasText('Interactive circuit replica')))
  await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Show replica')?.click()`)
  await waitFor(() => hasText('Interactive circuit replica'), 'replica restored', 10000)
  await ev(`[...document.querySelectorAll('section[aria-label="Diagram upload and review"] button')].find((b) => b.textContent.includes('switch_1') && b.getAttribute('aria-pressed') !== null)?.click()`)
  check('inspector shows selection', await waitFor(() => ev(`document.querySelector('[aria-label="Review inspector"]')?.innerText.includes('switch_1')`), 'inspector selection', 10000))
  await captureScreenshot('lens-review', 1440, '[aria-label="Review inspector"]')
  // The replica (and its lock notice) mounts on the reveal beat after the panels.
  await waitFor(() => hasText('Confirm the model in the inspector before testing'), 'lens lock', 20000)
  check('lens replica docks tools on canvas', await ev(`!!document.querySelector('.canvas-recessed [aria-label="Part dock"] [aria-label="Palette"]')`))
  check('lens dock rides the top edge', await ev(`(() => {
    const dock = document.querySelector('.canvas-recessed [aria-label="Part dock"]');
    const canvas = document.querySelector('.canvas-recessed');
    if (!dock || !canvas) return false;
    return dock.getBoundingClientRect().top - canvas.getBoundingClientRect().top < 40;
  })()`))
  check('confirm gate visible', await hasText('Confirm the model in the inspector before testing it against the simulator.'))
  check('lens confirm micro-copy', await hasText('AI Verification Complete'))
  check('no proof before confirm', !(await hasText('Confirmed circuit tested')))
  check('confirm lives in inspector', await ev(`document.querySelector('[aria-label="Review inspector"]')?.innerText.includes('Confirm & Measure Circuit') ?? false`))
  await clickButton('Confirm & Measure Circuit')
  await waitFor(() => hasText('Verityn Solver will test'), 'lens confirmed')
  await waitFor(() => hasText('Confirmed circuit tested'), 'lens proof', 25000)
  check('replica shows result HUD', await ev(`!!document.querySelector('section[aria-label="Diagram upload and review"] [aria-label="Result heads-up display"]')`))
  await ev(`document.querySelector('[data-filmstrip="textbook-loop"]')?.click()`)
  await waitFor(() => hasText('Tap a highlighted point'), 'filmstrip sample', 20000)
  check('filmstrip keeps upload slot', await ev(`!!document.querySelector('[data-filmstrip="upload"]')`))
  await ev(`document.querySelector('[data-filmstrip="upload"]')?.click()`)
  await waitFor(() => hasText('Model confirmed'), 'filmstrip upload restored', 20000)
  check('review continuity after switch', await hasText('Confirmed circuit tested'))
  check('proof cites open-switch reading', await waitFor(() => hasText('Bulb dark') && hasText('0.0 A'), 'proof reading restored', 10000))
  check('proof attribution', await hasText("Computed by Verityn's solver."))
  check('triptych photo panel', await hasText('Your photo or sketch'))
  check('triptych reading panel', await hasText('Confirmed circuit') && await hasText('Proposed by Meta, reviewed by you.'))
  check('post-test usefulness line', await hasText('These numbers are a starting point'))
  await captureScreenshot('lens-tested', 1440, '[aria-label="Confirmed upload: photo, reading, and measurement"]')
  check('photo readings measured', await hasText('dark ·'))
  await clickButton('Export to Free Bench Sandbox')
  await waitFor(() => hasText('FREE BENCH'), 'lens handoff')
  await waitFor(() => hasText('Start from a working bench'), 'handoff workbench chunk')
  await clickButton('Run experiment')
  await waitFor(() => hasText('Run 1 - Reality Lens import'), 'handoff seed runs', 25000)
  check('lens handoff seeds the bay', await hasText('Run 1 - Reality Lens import'))
  await clickButton('Reality Lens')
  await waitFor(() => hasText('Choose an image'), 'lens fresh after handoff')
  visionStubs.push(JSON.stringify({
    proposal: { status: 'unsupported', components: [], connections: [] },
    assumptions: [],
    provider: 'fixture-stub',
  }))
  await uploadLensFile(switchImage)
  await waitFor(() => hasText('does not look like a supported circuit'), 'lens unsupported', 20000)
  check('unsupported guidance', await hasText('Try a schematic or photo'))
  check('no fake replica', !(await hasText('Interactive circuit replica')))
  visionStubs.push(JSON.stringify({
    proposal: {
      status: 'ready',
      components: [
        { id: 'B1', type: 'battery', closed: null, polarity: { positive: 'a', negative: 'b' }, evidence: { region_id: 'r-b', bounds: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 }, rotation: 0 } },
        { id: 'L1', type: 'bulb', closed: null, polarity: null, evidence: { region_id: 'r-l', bounds: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 }, rotation: 0 } },
      ],
      connections: [
        { from: { node: 'B1', terminal: 'a' }, to: { node: 'L1', terminal: 'a' }, uncertain: false, evidence: { region_id: 'r-w', path: null } },
      ],
    },
    assumptions: [],
    provider: 'fixture-stub',
  }))
  await uploadLensFile(switchImage)
  await waitFor(() => hasText('Original diagram'), 'lens invalid review', 20000)
  await waitFor(() => hasText('Confirm the model in the inspector before testing'), 'lens invalid lock', 20000)
  await clickButton('Confirm & Measure Circuit')
  await waitFor(() => hasText('Verityn Solver will test'), 'lens invalid confirmed')
  await clickButton('Test circuit')
  await waitFor(() => hasText('DANGLING_TERMINAL'), 'lens invalid code', 25000)
  check('invalid shows solver label', await hasText("Computed by Verityn's solver."))
  await clickButton('Try another image')
  await waitFor(() => hasText('Choose an image'), 'lens reset invalid')
  // Compare two samples side by side, then sketch a diagram by hand.
  await clickButton('Compare two')
  await waitFor(() => hasText('Pick two diagrams'), 'compare mode', 10000)
  await ev(`[...document.querySelectorAll('#lens-samples button')].find((b) => b.textContent.includes('Textbook loop'))?.click()`)
  await ev(`[...document.querySelectorAll('#lens-samples button')].find((b) => b.textContent.includes('Open switch loop'))?.click()`)
  await waitFor(() => ev(`!!document.querySelector('[aria-label="Sample comparison"]')`), 'compare panel', 10000)
  check('compare panel pairs samples', await ev(`document.querySelector('[aria-label="Sample comparison"]')?.innerText.includes('Textbook loop') && document.querySelector('[aria-label="Sample comparison"]')?.innerText.includes('Open switch loop')`))
  await captureScreenshot('lens-compare', 1440, '[aria-label="Sample comparison"]')
  await clickButton('Done comparing')
  check('compare clears cleanly', !(await ev(`!!document.querySelector('[aria-label="Sample comparison"]')`)))
  await clickButton('Draw a sketch instead')
  await waitFor(() => ev(`!!document.querySelector('canvas[aria-label="Circuit sketch pad"]')`), 'sketch pad', 10000)
  check('insulated traces on by default', await ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Insulated traces' && b.getAttribute('aria-pressed') === 'true')`))
  check('insulated caption shown', await hasText('Insulated Trace Mode active'))
  await ev(`document.querySelector('canvas[aria-label="Circuit sketch pad"]')?.scrollIntoView({ block: 'center' })`)
  await sleep(400)
  const sketchAt = await ev(`(() => { const r = document.querySelector('canvas[aria-label="Circuit sketch pad"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sketchAt.x - 60, y: sketchAt.y, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 6; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sketchAt.x - 60 + i * 20, y: sketchAt.y })
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sketchAt.x + 60, y: sketchAt.y, button: 'left', clickCount: 1 })
  check('sketch stroke arms export', await ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Use sketch' && !b.disabled)`))
  // Second stroke crosses the first: the insulation shield must flash.
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sketchAt.x, y: sketchAt.y - 60, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 6; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sketchAt.x, y: sketchAt.y - 60 + i * 20 })
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sketchAt.x, y: sketchAt.y + 60, button: 'left', clickCount: 1 })
  check('insulated shield flashes on cross', await waitFor(() => ev(`!!document.querySelector('.trace-collision')`), 'shield flash', 10000))
  await captureScreenshot('lens-sketch', 1440, 'canvas[aria-label="Circuit sketch pad"]')
  visionStubs.push(JSON.stringify({ proposal: switchFixture.proposal, assumptions: [], provider: 'fixture-stub' }))
  await clickButton('Use sketch')
  await waitFor(() => hasText('Original diagram'), 'sketch review', 20000)
  check('sketch enters vision flow', await ev(`!!document.querySelector('img[alt="Uploaded schematic"]')`))
  await clickButton('Try another image')
  await waitFor(() => hasText('Choose an image'), 'lens reset sketch')
  visionStubs.push(JSON.stringify({
    proposal: {
      status: 'needs_review',
      components: [
        { id: 'B1', type: 'battery', closed: null, polarity: { positive: 'a', negative: 'b' }, evidence: { region_id: 'r-b', bounds: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 }, rotation: 0 } },
        { id: 'S1', type: 'switch', closed: true, polarity: null, evidence: { region_id: 'r-s', bounds: { x: 0.4, y: 0.2, width: 0.1, height: 0.1 }, rotation: 0 } },
        { id: 'L1', type: 'bulb', closed: null, polarity: null, evidence: { region_id: 'r-l', bounds: { x: 0.7, y: 0.2, width: 0.1, height: 0.1 }, rotation: 0 } },
      ],
      connections: [
        { from: { node: 'B1', terminal: 'a' }, to: { node: 'S1', terminal: 'a' }, uncertain: false, evidence: { region_id: 'r-w1', path: [[0.2, 0.3], [0.5, 0.3], [0.8, 0.3]] } },
        { from: { node: 'S1', terminal: 'b' }, to: { node: 'L1', terminal: 'a' }, uncertain: false, evidence: { region_id: 'r-w2', path: [[0.2, 0.7], [0.5, 0.7], [0.8, 0.7]] } },
        { from: { node: 'L1', terminal: 'b' }, to: { node: 'B1', terminal: 'b' }, uncertain: true, evidence: { region_id: 'r-w3', path: [[0.5, 0.3], [0.5, 0.7]] } },
      ],
    },
    assumptions: [],
    provider: 'fixture-stub',
  }))
  await uploadLensFile(switchImage)
  await waitFor(() => hasText('Original diagram'), 'lens traced review', 20000)
  await waitFor(() => hasText('Confirm the model in the inspector before testing'), 'lens traced lock', 20000)
  check('traced overlay renders', await ev(`document.querySelectorAll('svg[aria-label="Traced wires"] > polyline').length === 3`))
  check('traced wires clickable', await ev(`document.querySelectorAll('svg[aria-label="Traced wires"] g[role="button"]').length === 3`))
  check('certain wires solid', await ev(`(() => {
    const q = (r) => document.querySelector('svg[aria-label="Traced wires"] polyline[data-region="' + r + '"]')?.getAttribute('stroke-dasharray');
    return q('r-w1') === null && q('r-w2') === null;
  })()`))
  check('ambiguous wire dashed', await ev(`document.querySelector('svg[aria-label="Traced wires"] polyline[data-region="r-w3"]')?.getAttribute('stroke-dasharray') === '5 3'`))
  check('traced summary', await hasText('Wire routes are traced on your photo'))
  await captureScreenshot('lens-traced-wires', 1440, 'svg[aria-label="Traced wires"]')
  visionStubs.push(JSON.stringify({
    proposal: { status: 'unsupported', components: [], connections: [] },
    assumptions: [],
    provider: 'fixture-stub',
  }))
  await captureScreenshot('lens-rotate', 1440, 'button[title^="Rotates the photo"]')
  await clickButton('Rotate and re-read')
  await waitFor(() => ev(`document.querySelector('img[alt="Uploaded schematic"]')?.src.startsWith('data:image/png') ?? false`), 'rotated pixels', 20000)
  check('rotate swaps the photo', await ev(`document.querySelector('img[alt="Uploaded schematic"]')?.src.startsWith('data:image/png') ?? false`))
  await waitFor(() => hasText('does not look like a supported circuit'), 'rotated re-read', 20000)
  check('rotate re-asks vision', await hasText('does not look like a supported circuit'))
  await clickButton('Try another image')
  await waitFor(() => hasText('Choose an image'), 'lens reset traced')
  check('lazy lab chunk loaded', lazyChunks.size > 0, [...lazyChunks].join(', '))
  await clickButton('Guided Lab')
  await waitFor(() => hasText('Your journey'), 'back to finale')
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
  await send('Page.navigate', { url: HOME })
  await waitFor(() => hasText('Start your own lab'), 'mobile hub')
  const overflow = await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  check('mobile homepage fits 390px', overflow <= 1, `overflow ${overflow}px`)
  await clickButton('Start your own lab')
  await waitFor(() => hasText('loose ends'), 'mobile predict')
  await send('Page.navigate', { url: HOME })
  await waitFor(() => hasText('Start your own lab'), 'mobile rehub')
  await clickButton('Reality Lens')
  await waitFor(() => hasText('META VISION WORKSPACE'), 'mobile lens')
  await waitFor(() => hasText('Your diagram'), 'mobile lens lab', 20000)
  const lensOverflow = await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  check('mobile lens page fits 390px', lensOverflow <= 1, `overflow ${lensOverflow}px`)

  // ---- Guided demo: a separate clean run that performs itself. ----
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: HOME })
  await waitFor(() => hasText('Watch a walkthrough'), 'demo hub')
  await clickButton('Watch a walkthrough')
  await waitFor(() => hasText('Demo playing'), 'demo starts')
  const demoCoachCallsBefore = askRequestIds.length
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
  await waitFor(() => hasText('Connect the two open ends with one wire.'), 'demo l1 build', 30000)
  check('demo step 2', await hasText('Step 2 of 7'))
  check('demo repair notice', await hasText('Demo: repairing the open connection'))
  await waitFor(
    () => ev(`!!document.querySelector('section[aria-label="Test result"] details summary')`),
    'demo solver result details',
    30000,
  )
  await clickButton('Pause demo')
  await waitFor(() => hasText('Demo paused'), 'demo pauses on solver result')
  await ensureSummaryOpen('See details', 'section[aria-label="Test result"]')
  await waitFor(() => hasText('You completed the loop'), 'demo l1 solved', 30000)
  await waitFor(
    () => hasText('Your completed circuit produces 0.6 A and 3.6 W.'),
    'demo measured numbers',
    10000,
  )
  check('demo measured numbers', true)
  await clickButton('Resume demo')
  await waitFor(() => hasText('Demo playing'), 'demo resumes after result')
  await clickButtonStarts('Test with the switch open')
  await waitFor(() => hasText('Demo complete'), 'demo finale', 90000)
  // The finale chunk is lazy: Demo complete fires with the transfer gate,
  // while the recap heading lands once the chunk arrives.
  await waitFor(() => hasText('Your journey'), 'demo journey recap', 30000)
  check('demo reaches the completed journey', await hasText('Your journey'))
  check('demo made no coach calls in Solo', askRequestIds.length - demoCoachCallsBefore === 3,
    `demo calls ${askRequestIds.length - demoCoachCallsBefore}`)
  check('demo step 7', await hasText('Step 7 of 7'))
  await clickButton('Replay demo')
  await waitFor(() => hasText('Step 1 of 7'), 'demo replay')
  await waitFor(() => ev(`(document.getElementById('predict-why')?.value ?? '') !== ''`), 'replay scripted why', 30000)
  await fillInput('predict-why', 'manual takeover')
  await sleep(300)
  check('takeover exits demo', !(await hasText('Demo playing')) && !(await hasText('Demo paused')))
  check('takeover keeps input', await ev(`document.getElementById('predict-why')?.value === 'manual takeover'`))

  // ---- Experiment workspace: free bench beside the guided journey. ----
  await send('Page.navigate', { url: HOME })
  await waitFor(() => hasText('Start your own lab'), 'hub again')
  await clickButton('Experiment Bay')
  await waitFor(() => hasText('Build something. Test what happens.'), 'experiment page')
  await waitFor(() => hasText('Start from a working bench'), 'experiment workbench chunk')
  check('experiment current location', await ev(`document.querySelector('nav[aria-label="Laboratory"] button[aria-current="page"]')?.textContent.trim()`) === 'Experiment Bay')
  check('no lesson gate in experiment', !(await hasText('Your prediction')) && !(await hasText('Ask the coach')))
  check('ask locked before run', await hasText('Run the experiment first'))
  await clickPresetButton('Light a bulb', 'Load')
  await waitFor(() => hasText('Ready to test your circuit.'), 'preset ready')
  check('active preset badge', await hasText('In progress'))
  check('preset prompt shown', await hasText('What carries the current?'))
  check('execution deck side by side', await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Run experiment')
    const pill = [...document.querySelectorAll('[role="status"]')].find((el) => el.textContent.includes('Ready to test your circuit.'))
    if (!btn || !pill) return false
    const a = btn.getBoundingClientRect()
    const b = pill.getBoundingClientRect()
    return a.bottom > b.top && a.top < b.bottom
  })()`))
  check('tool dock floats on canvas', await ev(`!!document.querySelector('.canvas-recessed [aria-label="Part dock"] [aria-label="Palette"]')`))
  check('dock holds four tools', await ev(`[...document.querySelectorAll('[aria-label="Part dock"] [aria-label="Palette"] button')].map((b) => b.textContent.trim()).join(',')`) === 'Battery,Bulb,Switch,Delete')
  check('canvas spans full width', await ev(`(() => { const c = document.querySelector('.canvas-recessed'); return !c.closest('div[class*="grid-cols"]') && c.getBoundingClientRect().width / c.parentElement.getBoundingClientRect().width > 0.95 })()`))
  check('single palette in bay', await ev(`[...document.querySelectorAll('[aria-label="Palette"]')].filter((el) => el.offsetParent !== null).length`) === 1)
  await sleep(1500)
  check('no auto-run in experiment', !(await hasText('Simulation result')))
  const explainBefore = explainRequestIds.length
  await clickButton('Run experiment')
  await waitFor(() => hasText('Run 1 - Light a bulb'), 'history run 1', 25000)
  check('preset measures honestly', await hasText('0.6 A'))
  check('ask unlocked after run', await ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Ask Muse Spark about this result' && !b.disabled)`))
  check('mission first light', await missionDone('first-light'))
  check('mission loop closer', await missionDone('loop-closer'))
  check('result hud on canvas', await ev(`document.querySelector('[aria-label="Result heads-up display"]')?.textContent.includes('0.6 A')`))
  check('result hud lit word', await ev(`document.querySelector('[aria-label="Result heads-up display"]')?.textContent.includes('Lit')`))
  await clickButton('Trace')
  check('trace off hides readings', !(await ev(`!!document.querySelector('[aria-label="Simulation result"]')`)))
  check('trace off hides trace drawer', !(await hasText('What Meta did / What code checked')))
  await clickButton('Trace')
  await waitFor(() => ev(`!!document.querySelector('[aria-label="Simulation result"]')`), 'readings restored', 10000)
  await clickButton('Closed')
  await waitFor(() => hasText('Circuit changed - run the experiment again.'), 'stale status')
  check('stale hides measurements', !(await hasText('Simulation result')))
  check('ask locked after edit', !(await ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Ask Muse Spark about this result' && !b.disabled)`)))
  await clickButton('Run experiment')
  await waitFor(() => hasText('Run 2 - Free build'), 'history run 2', 25000)
  check('open switch measures dark', await hasText('0.0 A'))
  check('run comparison shown', await hasText('Compared with run 1'))
  check('mission threshold', await missionDone('threshold'))
  check('mission gap finder', await missionDone('gap-finder'))
  await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Mission Log'))?.click()`)
  check('mission drawer opens', await waitFor(() => ev(`document.getElementById('mission-drawer')?.getAttribute('aria-hidden') === 'false'`), 'mission drawer', 10000))
  await captureScreenshot('bay-missions', 1440, '[aria-label="Missions"]')
  await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Close' && b.getAttribute('aria-label') === 'Close mission log')?.click()`)
  await ev(`document.querySelector('[data-run="2"]')?.click()`)
  await waitFor(() => hasText('Run 2 — Free build'), 'run detail', 10000)
  check('run detail shows params', await hasText('Light 1: 0.0 V'))
  await ev(`document.querySelector('[data-run="2"]')?.click()`)
  await clickButton('Ask Muse Spark about this result')
  await waitFor(() => hasText('Fallback coach'), 'explain served', 20000)
  check('explain caption honest', await hasText('Deterministic prototype - no model call.'))
  check('one explicit explain call', explainRequestIds.length === explainBefore + 1, `before ${explainBefore}, after ${explainRequestIds.length}`)
  await clickPresetButton('The Forbidden Wire', 'Test')
  await waitFor(() => hasText('Run 3 - The Forbidden Wire'), 'history run 3', 25000)
  check('short rejected honestly', await hasText('SHORTED_BATTERY') || await hasText('straight back to itself'))
  check('short friendly pill', await hasText('Short circuit'))
  check('short diagnostics name battery', await hasText('connects Battery 1 straight back to itself'))
  const shortExplainBefore = explainRequestIds.length
  await clickButton('Ask Muse Spark about this result')
  await waitFor(() => hasText('Deterministic prototype'), 'short explain', 20000)
  check('short explain round trip', explainRequestIds.length === shortExplainBefore + 1)
  await fillInput('rig-start-volts', '6')
  await fillInput('rig-end-volts', '6')
  await fillInput('rig-step-volts', '1')
  await clickButton('Run sweep')
  await waitFor(() => hasText('Sweep stopped: Short circuit'), 'rig refuses short', 30000)
  check('rig stop note guides fix', await hasText('Fix the bench and run again.'))
  await clickPresetButton('Overwork the bulb', 'Test')
  await waitFor(() => hasText('Run 5 - Overwork the bulb'), 'overwork run 1', 25000)
  check('overwork loads hot', await hasText('32.4 W'))
  check('strain banner shown', await hasText('BULB OVERWORKED'))
  check('strain hud shown', await ev(`document.querySelector('[aria-label="Result heads-up display"]')?.textContent.includes('Overworked')`))
  check('overwork badge shown', await hasText('Overworked'))
  check('overwork limit shown', await hasText('Safe limit: 14.4 W'))
  check('diagnostics card', await hasText('took 32.4 W against a 14.4 W safe limit'))
  await ev(`[...document.querySelectorAll('summary')].find((e) => e.textContent.trim() === 'Why?')?.click()`)
  check('why formula', await hasText('I = V/R = 18.0 V / 10 Ω = 1.8 A'))
  await fillInput('battery-B1-volts', '12')
  await clickButton('Apply')
  await waitFor(() => hasText('Circuit changed - run the experiment again.'), 'voltage stale')
  check('voltage label updates', await hasText('Battery · 12 V'))
  await clickButton('Run experiment')
  await waitFor(() => hasText('Run 6 - Free build'), 'overwork run 2', 25000)
  check('overwork cools to intact', await hasText('Intact'))
  check('power ratio shown', await hasText('Light 1 power 32.4 W → 14.4 W (0.4×)'))
  await fillInput('battery-B1-volts', '19')
  await clickButton('Apply')
  await waitFor(() => hasText('Circuit changed - run the experiment again.'), 'blow stale')
  const blowStart = Date.now()
  await clickButton('Run experiment')
  await waitFor(() => ev(`!!document.querySelector('.bulb-damaged')`), 'blast lands', 25000)
  check('explosion stages a strain beat', Date.now() - blowStart >= 450)
  await waitFor(() => hasText('Run 7 - Free build'), 'exploded run', 25000)
  check('exploded latched', await hasText('Exploded'))
  check('exploded reads dark', await hasText('0.0 A'))
  check('mission demolition', await missionDone('demolition'))
  await captureScreenshot('bay-exploded', 1440, '[aria-label="Latest result"]')
  await clickButton('Ask Muse Spark about this result')
  await waitFor(() => hasText('exploded and no longer completes the circuit'), 'exploded explain', 20000)
  await clickButton('Reset to blank')
  await waitFor(() => hasText('Drag a battery into the workspace to begin.'), 'blank bench')
  check('sound toggle offered', await hasText('Sound on'))
  check('history survives reset', await hasText('Run 1 - Light a bulb'))
  await clickPresetButton('Overwork the bulb', 'Test')
  await waitFor(() => hasText('Run 8 - Overwork the bulb'), 'overwork after reset', 25000)
  check('reset clears blast latch', await hasText('Overworked') && !(await hasText('Exploded')))
  check('mission redline recovered', await missionDone('redline'))
  await fillInput('rig-start-volts', '2')
  await fillInput('rig-end-volts', '8')
  await fillInput('rig-step-volts', '2')
  await clickButton('Run sweep')
  await waitFor(() => hasText('First glow at 4 V (run 10).'), 'rig thresholds', 90000)
  check('rig history labels', await hasText('Run 9 - Rig B1 2 V'))
  check('rig table states', await ev(`[...document.querySelectorAll('section[aria-label="Stress Test Rig"] tbody tr')].map((tr) => tr.lastElementChild.textContent).join(',')`) === 'Dark,Lit,Lit,Lit')
  check('mission full spectrum', await missionDone('full-spectrum'))
  check('rig amber accent', await ev(`!!document.querySelector('section[aria-label="Stress Test Rig"] .bg-light')`))
  check('sweep gauge lands on last point', await ev(`document.querySelector('section[aria-label="Stress Test Rig"] [data-volts]')?.getAttribute('data-volts') === '8'`))
  await captureScreenshot('rig-after-sweep', 1440, '[aria-label="Stress Test Rig"]')
  await ev(`(() => {
    const el = document.querySelector('input[aria-label="Replay sweep point"]');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, '2');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await waitFor(() => hasText('Point 3 of 4: 6 V'), 'replay scrub', 10000)
  await clickButton('Re-run this point')
  await waitFor(() => hasText('Run 13 - Rig B1 6 V replay'), 'replay run', 25000)
  check('replay run logged', await hasText('Run 13 - Rig B1 6 V replay'))
  await fillInput('rig-start-volts', '0.1')
  await fillInput('rig-end-volts', '24')
  await fillInput('rig-step-volts', '1')
  await clickButton('Run sweep')
  await waitFor(() => ev(`!!document.querySelector('[aria-label="Sweep running, bench locked"]')`), 'sweep lock', 10000)
  check('sweep locks bench', await ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Test' && b.disabled)`))
  check('sweep pill shows live point', await ev(`/Point \\d+ of \\d+ · B1 at/.test(document.querySelector('[aria-label="Sweep running, bench locked"]')?.innerText ?? '')`))
  await clickButton('Cancel sweep')
  await waitFor(() => hasText('Sweep cancelled'), 'sweep cancel', 10000)
  await fillInput('rig-start-volts', '18')
  await fillInput('rig-end-volts', '24')
  await fillInput('rig-step-volts', '2')
  await clickButton('Run sweep')
  await waitFor(() => hasText('fractured at 20 V'), 'fracture stop', 30000)
  check('sweep stops at fracture', await hasText('fractured at 20 V'))
  check('sweep ends after fracture', !(await ev(`!!document.querySelector('[aria-label="Sweep running, bench locked"]')`)))
  check('sweep logs no points past fracture', await ev(`[...document.querySelectorAll('[aria-label="Run history"] [data-run]')].at(-1)?.textContent.includes('Rig B1 20 V') ?? false`))
  await clickPresetButton('Time Bomb', 'Test')
  await waitFor(() => ev(`document.querySelector('[aria-label="Latest result"]')?.innerText.includes('Exploded') ?? false`), 'bomb blows', 25000)
  check('time bomb explodes first run', await ev(`document.querySelector('[aria-label="Latest result"]')?.innerText.includes('Exploded') ?? false`))
  check('bomb banner reads exploded, never lit', await hasText('BULB EXPLODED') && !(await hasText('BULB LIT')))
  await clickPresetButton('Dim Duo', 'Test')
  await waitFor(() => ev(`[...document.querySelectorAll('[aria-label="Run history"] [data-run]')].at(-1)?.textContent.includes('Dim Duo') ?? false`), 'duo run', 25000)
  check('duo banner pairs bulbs dim', await hasText('2 BULBS DIM'))
  check('duo bulbs render dim art', await ev(`[...document.querySelectorAll('.bulb-illustration')].filter((el) => el.classList.contains('is-dim')).length >= 2`))
  check('duo hud reads dim', await ev(`document.querySelector('[aria-label="Circuit canvas"]')?.parentElement?.innerText.includes('Dim') ?? false`))
  await ev(`[...document.querySelectorAll('[aria-label="Run history"] [data-run]')].at(-1)?.click()`)
  await waitFor(() => ev(`document.body.innerText.includes('Light 2: 3.0 V')`), 'duo detail', 10000)
  check('dim duo splits volts', await hasText('Light 1: 3.0 V') && await hasText('Light 2: 3.0 V'))
  await clickPresetButton('Polarity Duel', 'Test')
  await waitFor(() => ev(`[...document.querySelectorAll('[aria-label="Run history"] [data-run]')].at(-1)?.textContent.includes('Polarity Duel') ?? false`), 'duel run', 25000)
  check('duel standoff dark', await hasText('BULB DARK'))
  check('duel names the standoff', await hasText('STANDOFF'))
  check('duel marks both batteries opposing', await ev(`[...document.querySelectorAll('[aria-label="Battery opposing"]')].length === 2`))
  check('duel prompt guides flip', await hasText('Double-click a battery to flip'))
  await captureScreenshot('bay-presets', 1440, '[aria-label="Starter experiments"]')
  await captureScreenshot('bay-history', 1440, '[aria-label="Run history"]')
  await clickButton('Guided Lab')
  await waitFor(() => hasText('Continue to fix it'), 'guided clean')
  check('guided starts clean', !(await hasText('Build something.')) && await hasText('Continue to fix it'))
  check('no dock in guided', await ev(`![...document.querySelectorAll('[aria-label="Part dock"]')].some((el) => el.offsetParent !== null)`))
  await clickButton('Hub')
  await waitFor(() => hasText('Start your own lab'), 'hub final')
  await captureScreenshot('hub')
  check('console holds four engine tabs', await ev(`[...document.querySelectorAll('[aria-label="Engines"] [role="tab"]')].map((b) => b.textContent).join('|')`) === 'Muse SparkReasoning & logic|Muse VoiceAudio processing|Verityn SolverMathematical truth|SAM 3.1 samplesSaved masks only')
  check('console logic tab', await hasText('muse-spark · example trace'))
  check('console logic runs spark', await hasText('Try Spark'))
  check('console logic keeps evidence refs', await hasText('$ refs'))
  await ev(`[...document.querySelectorAll('[aria-label="Engines"] [role="tab"]')].find((b) => b.textContent.includes('Muse Voice'))?.click()`)
  check('console voice tab', await hasText('muse-voice · example trace'))
  check('console voice runs recorder', await hasText('Record 5 seconds'))
  await ev(`[...document.querySelectorAll('[aria-label="Engines"] [role="tab"]')].find((b) => b.textContent.includes('Verityn Solver'))?.click()`)
  check('console physics tab', await hasText('Current = Voltage / Resistance → 0.60 Amps'))
  check('console physics runs solver', await hasText('Measure a loop'))
  await clickButton('Measure a loop')
  await waitFor(() => hasText('verityn-solver (live)'), 'solver command runs', 20000)
  check('solver command measures honestly', await hasText('I = 0.60 A · P = 3.60 W · INTACT'))
  await ev(`[...document.querySelectorAll('[aria-label="Engines"] [role="tab"]')].find((b) => b.textContent.includes('SAM 3.1 samples'))?.click()`)
  check('console vision tab', await hasText('sam 3.1 · saved mask'))
  check('console vision stays sample-only', await hasText('no live inference runs here') && await hasText('Try Reality Lens'))
  check('why matters pairs problems with answers', await hasText('AI can answer before a learner has time to think.') && await hasText('Predict first. A coach guides; the solver checks the circuit.'))
  await captureScreenshot('under-the-hood-console', 1440, '#under-the-hood')
  await clickButton('Reality Lens')
  await waitFor(() => hasText('Choose an image'), 'lens still works', 20000)

  // ---- Stale-backend honesty: a contract mismatch must not blame reachability. ----
  await clickButton('Experiment Bay')
  await waitFor(() => hasText('Start from a working bench'), 'bay stale revisit')
  await clickPresetButton('Light a bulb', 'Load')
  await waitFor(() => hasText('Ready to test your circuit.'), 'stale preset ready')
  const simBefore = simulateRequests
  staleSimulateNext = true
  await clickButton('Run experiment')
  await waitFor(() => hasText('Unexpected response from the simulator'), 'stale toast', 15000)
  check('stale toast honest copy', !(await hasText('is the backend running')))
  check('stale toast keeps retry', await ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Retry')`))
  await sleep(2000)
  check('stale mismatch never auto-retries', simulateRequests === simBefore + 1, `requests=${simulateRequests - simBefore}`)
  await clickButton('Retry')
  await waitFor(() => hasText('0.6 A'), 'retry recovers', 25000)
  check('retry runs the real backend', await hasText('Run 1 - Light a bulb'))

  console.log(fails.length === 0 ? 'BROWSER SMOKE PASSED' : `FAILURES: ${fails.join(', ')}`)
  ws.close()
  // Return (don't process.exit): main's finally must run to kill Chrome.
  process.exitCode = fails.length === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('BROWSER SMOKE ERROR:', error instanceof Error ? error.message : String(error))
  process.exitCode = 2
})
