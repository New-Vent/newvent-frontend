import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'

/**
 * usage.js — AI 사용량 대시보드.
 * 종합(도넛=비용 구성, 상한 대비 숫자) + 주차별(토큰 볼륨 막대)이 한 화면에서 닫히는지 본다.
 */
async function setup({ rows = defaultRows(), reindex = defaultReindex() } = {}) {
  const ui = {}
  const logCalls = []
  const bindings = {
    esc: String,
    ui,
    loadLlmCallLogs: async (params) => {
      logCalls.push(params)
      return { content: rows, page: 0, size: 100, totalElements: rows.length, totalPages: 1 }
    },
    loadReindexLogs: async () => reindex,
  }
  const module = new SourceTextModule(await readFile(new URL('../src/admin/views/usage.js', import.meta.url), 'utf8'))
  await module.link(() => new SyntheticModule(Object.keys(bindings), function () {
    for (const [key, value] of Object.entries(bindings)) this.setExport(key, value)
  }))
  await module.evaluate()
  return { ns: module.namespace, ui, logCalls }
}

/** 최근 며칠 내의 행들 — 날짜는 절대값 고정 대신 '지금' 기준으로 만든다 (주·일 경계 흔들림 방지) */
function defaultRows() {
  return [
    { id: 1, eventId: 3, modelName: 'mock', provider: 'mock', callOk: true, validOk: true,
      inputTokens: 1200, outputTokens: 300, responseTimeMs: 1400, ragUsed: true,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: 2, eventId: 3, modelName: 'mock', provider: 'mock', callOk: true, validOk: true,
      inputTokens: 900, outputTokens: 200, responseTimeMs: 2200, ragUsed: false,
      createdAt: new Date(Date.now() - 30 * 3600000).toISOString() },
  ]
}

function defaultReindex() {
  return [
    { id: 3, scope: 'ALL', eventId: null, chunkCount: 189, durationMs: 42310, status: 'SUCCESS', createdAt: '2026-10-05T15:00:00Z' },
    { id: 2, scope: 'EVENT', eventId: 41, chunkCount: 24, durationMs: 5210, status: 'FAILED', createdAt: '2026-09-28T05:00:00Z' },
  ]
}

test('종합 카드 — 비용 구성과 상한 대비 숫자가 나온다', async () => {
  const h = await setup()
  await new Promise((r) => h.ns.ensureUsage(r))
  const html = h.ns.usageView()
  // 비용 요약 — 누적 예상 비용 한 줄 + 생성(측정)/임베딩(추정) 두 조각. 라벨을 섞지 않는다
  assert.match(html, /class="card usage-panel usage-overview"/)
  assert.match(html, /최근 8주 누적 예상 비용/)
  assert.match(html, /생성 · 측정\s*<strong>[\d,]+원<\/strong>/)
  assert.match(html, /임베딩 · 추정\s*<strong>[\d,]+원<\/strong>/)
  // 상한 대비 숫자 — 하루 200(주 1,400) 기준이 코드 상수와 맞는지
  assert.match(html, /usage-quota-value">\s*\d+<span>\/ 200회<\/span>/)
  assert.match(html, /usage-quota-value">\s*\d+<span>\/ 1,400회<\/span>/)
  assert.match(html, /하루 상한은 200회/)
  // 둘 다 성공 행
  assert.match(html, /<span>성공률<\/span>\s*<strong>100%<\/strong>/)
  // 누적 토큰 — 입력·출력 분해까지 보여준다
  assert.match(html, /누적 토큰/)
  assert.match(html, /입력 토큰/)
  assert.match(html, /출력 토큰/)
})

test('주차별 카드 — 토큰 볼륨 막대와 툴팁이 나온다', async () => {
  const h = await setup()
  await new Promise((r) => h.ns.ensureUsage(r))
  const html = h.ns.usageView()
  assert.match(html, /주차별 사용량/)
  assert.match(html, /<span>입력 \+ 출력 토큰<\/span>/)
  // 막대는 높이 % 로 — 호출이 없는 주도 8주 모두 그린다
  assert.match(html, /class="usage-week-fill"\s+style="height:[\d.]+%/)
  assert.equal((html.match(/class="usage-week-col/g) || []).length, 8)
  // 툴팁에 호출·토큰·예상 비용이 세로로
  assert.match(html, /<span>토큰 [\d,]+<\/span>/)
  assert.match(html, /예상 비용 약 [\d,]+원/)
})

test('호출이 없으면 빈 안내를 보여준다', async () => {
  const h = await setup({ rows: [] })
  await new Promise((r) => h.ns.ensureUsage(r))
  const html = h.ns.usageView()
  assert.match(html, /아직 기록이 없어요/)
  assert.doesNotMatch(html, /conic-gradient/)
})

test('로그를 50개씩 걷고, 재색인 이력 기준 근거 문구가 붙는다', async () => {
  const h = await setup()
  await new Promise((r) => h.ns.ensureUsage(r))
  const html = h.ns.usageView()
  // 첫 페이지 인자 — 8주 창 from + size 50 (백엔드 @Max(50) 제약, 이보다 크면 400)
  assert.equal(h.logCalls.length, 1)
  assert.equal(h.logCalls[0].page, 0)
  assert.equal(h.logCalls[0].size, 50)
  assert.ok(h.logCalls[0].from, 'from 이 있어야 한다 (최근 8주 창)')
  // 임베딩 추정 근거 — 재색인 청크 189+24 = 213개 기준 (비용 행 값 안에 들어간다)
  assert.match(html, /청크 213개 기준/)
})

test('모델 단가 — Bedrock gemma 가격과 1M 나눗셈으로 계산한다', async () => {
  const h = await setup({ rows: [
    { id: 1, eventId: 3, modelName: 'us.gemma-3-27b-it', provider: 'bedrock', callOk: true, validOk: true,
      inputTokens: 1000000, outputTokens: 1000000, responseTimeMs: 900, ragUsed: true,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
  ] })
  await new Promise((r) => h.ns.ensureUsage(r))
  const html = h.ns.usageView()
  // Bedrock gemma-3-27b-it 표준가 $0.23/$0.38 per 1M — 1M+1M 토큰 = 0.61 USD = 원화 854원.
  // 1M 나눗셈이 빠지면 서닌개억 대로 폭등한다 (2026-10-19 실사고)
  assert.match(html, /생성 · 측정\s*<strong>854원<\/strong>/)
})
