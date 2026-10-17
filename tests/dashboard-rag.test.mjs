import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'

/**
 * dashboard-rag.js — RAG 품질 대시보드.
 * 주간 추이 + 전체 현황을 한 번에 읽어 요약 카드·사용률·주간 증감을 그린다.
 */
async function setup() {
  const ui = {}
  const bindings = {
    esc: String, icon: () => '', ui,
    button: () => '',
    loadQualityTrend: async () => ([
      { weekStart: '2026-09-28', totalCalls: 15, ragUsedCalls: 7, chunkCount: 25 },
      { weekStart: '2026-10-05', totalCalls: 22, ragUsedCalls: 14, chunkCount: 31 },
    ]),
  }
  const module = new SourceTextModule(await readFile(new URL('../src/admin/views/dashboard-rag.js', import.meta.url), 'utf8'))
  await module.link(() => new SyntheticModule(Object.keys(bindings), function () {
    for (const [key, value] of Object.entries(bindings)) this.setExport(key, value)
  }))
  await module.evaluate()
  return { ns: module.namespace, ui }
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
  // 이번 주 14회 − 지난주 7회 = +7회
  assert.match(html, /이번 주 RAG 참고 14회 · 지난주 대비 \+7회/)
  // 툴팁 — 세로 카드, HTML 에 이미 그려져 있고 hover CSS 로만 보인다 (title 속성은 쓰지 않는다)
  assert.match(html, /<span class="trend-tip"><em>10\/05-10\/11<\/em><span>전체 22회<\/span><span>그중 RAG 참고 14회<\/span><span>사용률 64%<\/span><span>청크 31개<\/span><\/span>/)
  assert.doesNotMatch(html, /trend-bar" title="/)
  // 막대 밖엔 주 시작 날짜만 — 수치 행은 폐지됐다
  assert.doesNotMatch(html, /trend-value/)
  assert.doesNotMatch(html, /trend-rate/)
  // 범례 — 색 견본과 설명이 한 세트로 붙는다
  assert.match(html, /<b>전체 호출<\/b> — 그 주에 생성을 부른 횟수/)
  assert.match(html, /<b>그중 RAG 참고<\/b> — 안쪽 초록 막대, 참고 사례를 실어 넣은 호출/)
})

test('데이터가 없으면 빈 메시지를 보여준다', async () => {
  const h = await setup()
  h.ui.ragTrend = []
  const html = h.ns.dashboardRagView()
  assert.match(html, /아직 집계된 호출이 없어요/)
})
