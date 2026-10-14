// 템플릿 5종의 글자 대비를 본다 (#207 · #220).
//
// 실행: node --test tests/template-contrast.test.mjs
//
// 실제 렌더링이 필요해서 헤드리스 Chrome/Edge 를 쓴다 (설치된 것을 찾는다. 없으면 건너뛴다 — CHROME_PATH 로 지정할 수 있다).
// 대상은 public/assets/event.css 와 src/shared/mock/templates.js 의 템플릿 5종이다.
//   → CSS 를 고쳤으면 먼저 `npm run css` 로 event.css 를 다시 만든다.
//   → 다른 CSS 로 보려면 EVENT_CSS=경로 (예: 고치기 전 CSS 로 이 테스트가 실제로 실패하는지 확인할 때).
//
// ★ 두 가지를 본다
//   1) 팔레트 없는 기본 상태에서 글자 대비가 기준(작은 글자 4.5 · 큰 글자 3) 이상인가 (#220)
//   2) 팔레트를 붙였을 때 그보다 나빠지거나 새로 미달이 된 곳이 없는가 (#207)
//   2) 는 "4.5 이상"이 아니라 "붙이기 전보다 나빠지지 않을 것"이다 — 기본 상태 자체가 기준 밖인 요소는 1) 이 잡는다.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { TEMPLATE_BODIES } from '../src/shared/mock/templates.js'

const run = promisify(execFile)
const here = (p) => fileURLToPath(new URL(p, import.meta.url))

// mock 템플릿 id → 테마. 본문의 루트 class(theme-*)로 알아낸다.
const TEMPLATES = Object.fromEntries(
  Object.values(TEMPLATE_BODIES)
    .map((html) => [(html.match(/class="[^"]*\btheme-(sports|holiday|vip|sale|launch)\b/) ?? [])[1], html])
    .filter(([theme]) => theme),
)

// ── 알려진 예외 ──────────────────────────────────────────────────────────────
// 지금은 없다. 팔레트 기본색 자체가 모자라서 템플릿에서 못 고치는 경우가 생기면 이유와 함께 여기에 적는다.
//   { template: 'sports', palettes: ['summer'], names: ['div.sub-label'] },
const KNOWN = []
// 일부러 팔레트에 연결하지 않은 토큰 (이유는 90-palettes/95-template-accent.css)
const UNCONNECTED_TOKENS = ['launch --tpl-accent-ink']

// ── 기본 상태에서 기준 미달을 허용하는 요소 ──
// holiday 복주머니 일러스트(금 · 파랑 몸통 그라데이션) 위의 福 — 색 하나로 못 풀어서 이번 범위에서 뺐다 (#220).
const KNOWN_BASE = [{ template: 'holiday', names: ['span.hl-pouch-hanja'] }]
const isKnownBase = (template, x) => KNOWN_BASE.some((k) => k.template === template && k.names.includes(x.name))

const isKnown = (template, r) =>
  KNOWN.some((k) => k.template === template && k.palettes.includes(r.palette) && k.names.includes(r.name))

// ── 브라우저 ─────────────────────────────────────────────────────────────────
function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  return candidates.find((p) => p && existsSync(p))
}

async function measure(browser) {
  const css = await readFile(process.env.EVENT_CSS ?? here('../public/assets/event.css'), 'utf8')
  const harness = await readFile(here('./fixtures/contrast-harness.js'), 'utf8')
  const palettes = [...css.matchAll(/\.palette-([a-z]+),\s*body:has\(\.palette-\1\)/g)].map((m) => m[1])
  const config = JSON.stringify({ templates: TEMPLATES, palettes }).replaceAll('<', '\\u003c')

  const dir = await mkdtemp(join(tmpdir(), 'newvent-contrast-'))
  try {
    const page = join(dir, 'harness.html')
    await writeFile(page,
      `<!doctype html><meta charset="utf-8"><style>${css}</style>` +
      `<div style="width:760px"><div id="root"></div></div><pre id="result"></pre>` +
      `<script>window.__CONFIG__ = ${config}</script><script>${harness}</script>`)
    const { stdout } = await run(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=800,1000',
      `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=30000',
      '--dump-dom', pathToFileURL(page).href,
    ], { timeout: 90_000, maxBuffer: 64 * 1024 * 1024 })
    const b64 = stdout.match(/<pre id="result">([^<]*)<\/pre>/)?.[1]
    assert.ok(b64, '측정 결과가 비어 있다 — 페이지 스크립트가 끝까지 돌지 못했다')
    return { palettes, result: JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const browser = findBrowser()
const skip = browser ? false : 'Chrome/Edge 를 못 찾았다 (CHROME_PATH 로 지정)'
let measured
const get = async () => (measured ??= await measure(browser))

test('mock 템플릿에서 템플릿 5종을 모두 찾는다', () => {
  assert.deepEqual(Object.keys(TEMPLATES).sort(), ['holiday', 'launch', 'sale', 'sports', 'vip'])
})

test('팔레트 18종 전부를 읽는다', { skip }, async () => {
  const { palettes } = await get()
  assert.ok(palettes.length >= 18, `팔레트 ${palettes.length}종만 읽었다: ${palettes.join(', ')}`)
})

test('측정이 비어 있지 않다 (아무것도 안 재서 통과하는 것을 막는다)', { skip }, async () => {
  const { result } = await get()
  for (const [theme, r] of Object.entries(result.contrast)) {
    assert.ok(r.total >= 30, `${theme}: 측정한 글자 요소가 ${r.total}개뿐이다`)
  }
})

test('팔레트 없는 기본 상태에서 글자 대비가 기준 이상이다', { skip }, async () => {
  const { result } = await get()
  const problems = []
  for (const [theme, r] of Object.entries(result.contrast)) {
    for (const x of r.baseFails) {
      if (!isKnownBase(theme, x)) problems.push(`${theme}: ${x.name} "${x.text}" ${x.c} (필요 ${x.need})`)
    }
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'))
})

test('팔레트를 붙여서 새로 안 읽히게 되거나 눈에 띄게 나빠진 글자가 없다', { skip }, async () => {
  const { result } = await get()
  const problems = []
  for (const [theme, r] of Object.entries(result.contrast)) {
    for (const x of r.regressions) {
      if (!isKnown(theme, x)) problems.push(`${theme} × ${x.palette}: ${x.name} "${x.text}" ${x.base} → ${x.c} (필요 ${x.need})`)
    }
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'))
})

test('알려진 예외가 아직도 실제로 일어난다 (고쳐졌으면 목록에서 지운다)', { skip }, async (t) => {
  const { result } = await get()
  for (const k of KNOWN) {
    const seen = result.contrast[k.template].regressions.filter((x) => isKnown(k.template, x) && k.palettes.includes(x.palette))
    if (!seen.length) t.diagnostic(`더는 안 일어난다 → KNOWN 에서 지워도 된다: ${k.template} × ${k.palettes.join(', ')}`)
  }
})

test('템플릿 전용 토큰(--tpl-*)이 모두 팔레트에 연결돼 있다', { skip }, async () => {
  const { result } = await get()
  const loose = []
  for (const [theme, tokens] of Object.entries(result.tokens)) {
    for (const [name, changed] of Object.entries(tokens)) {
      if (changed === 0 && !UNCONNECTED_TOKENS.includes(`${theme} ${name}`)) loose.push(`${theme} ${name}`)
    }
  }
  assert.deepEqual(loose, [], '팔레트를 붙여도 안 바뀌는 토큰 — 90-palettes/95-template-accent.css 에 연결을 추가한다:\n' + loose.join('\n'))
})
