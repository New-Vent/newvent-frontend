import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { afterEach, mock } from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'

/**
 * dashboard-rag.js — RAG 품질 대시보드.
 * 주간 추이 + 전체 현황을 한 번에 읽어 요약 카드·사용률·주간 증감을 그린다.
 *
 * ★ 화면은 "지금" 기준 8주를 그린다(없는 주는 0회). 시계를 고정하지 않으면 fixture 의 주가
 *   8주 창 밖으로 밀려나는 날부터 이 테스트가 이유 없이 깨진다 — 그래서 Date 만 2026-10-07(수)로 세운다.
 */
afterEach(() => mock.timers.reset())

async function setup() {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-07T03:00:00Z') })
  const ui = {}
  const buttons = []
  const calls = { startedReindex: 0 }
  const bindings = {
    esc: String, icon: () => '', ui,
    button: (action, label, attrs) => { buttons.push({ action, label, attrs }); return '' },
    toast: (message) => { buttons.push({ action: 'toast', label: message }) },
    loadQualityTrend: async () => ([
      { weekStart: '2026-09-28', totalCalls: 15, ragUsedCalls: 7, chunkCount: 25 },
      { weekStart: '2026-10-05', totalCalls: 22, ragUsedCalls: 14, chunkCount: 31 },
    ]),
    // 재색인 이력 fixture — 10/05T15:00Z 는 KST 10/06 00:00 이라 10/05 주(10/05-10/11)에 해당
    loadReindexLogs: async () => ([
      {
        id: 3, scope: 'ALL', eventId: null, versionId: null, requestedBy: '1',
        chunkCount: 189, durationMs: 42310, status: 'SUCCESS', failureMessage: null,
        createdAt: '2026-10-05T15:00:00Z',
      },
      {
        id: 2, scope: 'EVENT', eventId: 41, versionId: null, requestedBy: '1',
        chunkCount: 24, durationMs: 5210, status: 'FAILED', failureMessage: '임베딩 TIMEOUT',
        createdAt: '2026-09-28T05:00:00Z',
      },
    ]),
    // 전체 재색인 — 시작은 세고, 상태 폴링은 기본 '안 돌고 있는 중'으로 둔다
    startReindexAll: async () => { calls.startedReindex++; return { running: true } },
    pollReindexStatus: async () => ({ running: false, startedAt: null, finishedAt: null, lastResult: null }),
  }
  const module = new SourceTextModule(await readFile(new URL('../src/admin/views/dashboard-rag.js', import.meta.url), 'utf8'))
  await module.link(() => new SyntheticModule(Object.keys(bindings), function () {
    for (const [key, value] of Object.entries(bindings)) this.setExport(key, value)
  }))
  await module.evaluate()
  return { ns: module.namespace, ui, buttons, calls,
    settle: () => new Promise((r) => setTimeout(r, 20)) }
}

test('주별 사용률과 지난주 대비 증감이 나온다', async () => {
  const h = await setup()
  await new Promise((r) => h.ns.ensureDashboard(r))
  const html = h.ns.dashboardRagView()
  // 7/15 → 47%, 14/22 → 64% — 수치는 툴팁 안에 들어간다
  assert.match(html, /사용률 64%/)
  assert.match(html, /사용률 47%/)
  // 주간 범위 — 시작 +6일 (월요일~일요일)
  assert.match(html, /<em>09\/28-10\/04<\/em>/)
  assert.match(html, /<em>10\/05-10\/11<\/em>/)
  // 이번 주 14회 − 지난주 7회 = +7회 — 요약 카드
  assert.match(html, /<p class="rag-week-label">이번 주 RAG 참고<\/p><div class="rag-week-value">14<span>회<\/span><\/div><p class="rag-week-change">지난주 대비 \+7회<\/p>/)
  // 호출이 없는 주도 0회로 채워서 8주를 모두 그린다
  assert.equal((html.match(/class="rag-week-column"/g) || []).length, 8)
  // 툴팁 — 세로 카드, HTML 에 이미 그려져 있고 hover CSS 로만 보인다 (title 속성은 쓰지 않는다)
  assert.match(html, /<span class="trend-tip"><em>10\/05-10\/11<\/em><span>전체 22회<\/span><span>그중 RAG 참고 14회<\/span><span>사용률 64%<\/span><span>청크 31개<\/span><span class="tip-flag">그 주에 전체 재색인 실행<\/span><\/span>/)
  assert.doesNotMatch(html, /trend-bar" title="/)
  // 막대 밖엔 주 시작 날짜만 — 수치 행은 폐지됐다
  assert.doesNotMatch(html, /trend-value/)
  assert.doesNotMatch(html, /trend-rate/)
  // 범례 — 색 견본과 설명이 한 세트로 붙는다. 위치는 막대 뒤 (차트 안, 차트 안내 앞)
  assert.match(html, /<strong>전체 호출<\/strong><\/div><p>그 주에 생성을 부른 횟수<\/p>/)
  assert.match(html, /<strong>그중 RAG 참고<\/strong><\/div><p>분홍 막대, 참고 사례를 실어 넣은 호출<\/p>/)
  assert.ok(html.indexOf('rag-chart-legend') > html.indexOf('rag-week-chart'), '범례가 막대 뒤에 와야 한다')
  assert.ok(html.indexOf('rag-chart-legend') < html.indexOf('rag-chart-help'), '범례가 차트 안내 앞에 와야 한다')
})

test('재색인 이력 카드와 툴팁의 전체 재색인 표시가 나온다', async () => {
  const h = await setup()
  await new Promise((r) => h.ns.ensureDashboard(r))
  const html = h.ns.dashboardRagView()
  // 이력 카드 — LLM 호출 로그와 같은 표 구조. KST 표시 시각·scope·상태·청크 수·소요 시간
  assert.match(html, /재색인 이력/)
  assert.match(html, /<span class="rag-log-id">#3<\/span>전체 재색인<\/span>/)
  assert.match(html, /<td>전체 이벤트<\/td>/)
  assert.match(html, /<span class="rag-log-status is-success">성공<\/span>/)
  assert.match(html, /<td class="rag-log-number">189개<\/td>/)
  assert.match(html, /42\.3초/)
  assert.match(html, /class="rag-log-date">10\/06 00:00<\/td>/)
  assert.match(html, /#2<\/span>이벤트 재색인/)
  assert.match(html, /<td>이벤트 #41<\/td>/)
  assert.match(html, /<span class="rag-log-status is-failure">실패<\/span>/)
  assert.match(html, /실패: 임베딩 TIMEOUT/)
  // 옛 한 줄 텍스트 형식은 남아 있으면 안 된다
  assert.doesNotMatch(html, /reindex-row/)
  // 툴팁 표시는 ALL 재색인이 있었던 주(10/05)에만 — EVENT 는 표시하지 않는다
  // (설명 문구에도 같은 문장이 있으므로 표시 span 만 센다)
  assert.equal((html.match(/<span class="tip-flag">그 주에 전체 재색인 실행/g) || []).length, 1)
})

test('재색인 기록이 없으면 툴팁 표시 없이 빈 안내를 보여준다', async () => {
  const h = await setup()
  await new Promise((r) => h.ns.ensureDashboard(r))
  h.ui.ragReindexLogs = []
  const html = h.ns.dashboardRagView()
  assert.match(html, /아직 재색인 기록이 없어요/)
  // 설명 문구에도 같은 문장이 있으므로 표시 span 자체를 검사한다
  assert.doesNotMatch(html, /<span class="tip-flag">그 주에 전체 재색인 실행/)
})

test('전체 재색인 카드가 차트보다 위에 온다', async () => {
  const h = await setup()
  await new Promise((r) => h.ns.ensureDashboard(r))
  const html = h.ns.dashboardRagView()
  const action = html.indexOf('RAG 전체 재색인')
  const trend = html.indexOf('주간 RAG 활용 추이')
  const history = html.indexOf('재색인 이력')
  // 대시보드 박스 — 열 폭을 닫아 양 끝 막대 툴팁이 가장자리에 붙지 않게 한다
  assert.match(html, /container rag-dash/)
  // 실행(맨 위) → 관찰(추이) → 설명(이력) 순서다
  assert.ok(action < trend && action < history && trend < history, '실행 카드가 차트 앞, 이력은 차트 뒤여야 한다')
  // 버튼 — 실행 전이면 누를 수 있다
  assert.ok(h.buttons.some((b) => b.action === 'rag-reindex-all' && b.label === '전체 재색인' && !b.attrs.includes('disabled')))
})

test('실행 중이면 버튼이 잠기고 진행 문구가 나온다', async () => {
  const h = await setup()
  await new Promise((r) => h.ns.ensureDashboard(r))
  h.ui.ragReindexAll = { running: true, startedAt: '2026-10-19T09:00:00Z', finishedAt: null, lastResult: null }
  const html = h.ns.dashboardRagView()
  assert.match(html, /전체 재색인 진행 중… 2초 간격으로 상태를 확인해요/)
  assert.ok(h.buttons.some((b) => b.action === 'rag-reindex-all' && b.label === '진행 중…' && b.attrs.includes('disabled')))
})

test('마친 재색인은 완료 결과를 보여준다', async () => {
  const h = await setup()
  await new Promise((r) => h.ns.ensureDashboard(r))
  h.ui.ragReindexAll = { running: false, startedAt: null, finishedAt: '2026-10-19T09:05:00Z',
    lastResult: { totalEvents: 3, succeeded: 2, failedEvents: [41], totalChunks: 189 } }
  const html = h.ns.dashboardRagView()
  assert.match(html, /완료 — 성공 2\/3, 청크 189개/)
})

test('버튼 클릭은 전체 재색인을 시작한다', async () => {
  const h = await setup()
  h.ui.route = 'rag'
  const rerender = () => {}
  assert.equal(h.ns.handleRagDashboardClick('rag-reindex-all', rerender), true)
  assert.equal(h.ns.handleRagDashboardClick('unknown-act', rerender), false)
  await h.settle()
  assert.equal(h.calls.startedReindex, 1)
})

test('데이터가 없어도 8주를 0회로 채워 그리고, 지난주 대비는 변동 없음이다', async () => {
  const h = await setup()
  h.ui.ragTrend = []
  const html = h.ns.dashboardRagView()
  assert.equal((html.match(/class="rag-week-column"/g) || []).length, 8)
  assert.equal((html.match(/<span class="rag-week-total">0회<\/span>/g) || []).length, 8)
  assert.match(html, /<div class="rag-week-value">0<span>회<\/span><\/div><p class="rag-week-change">지난주 대비 변동 없음<\/p>/)
})
