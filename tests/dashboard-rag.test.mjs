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
  // 14/22 → 64%, 7/15 → 47%
  assert.match(html, /사용률 64%/)
  assert.match(html, /사용률 47%/)
  // 이번 주 14회 − 지난주 7회 = +7회
  assert.match(html, /이번 주 RAG 사용 14회 · 지난주 대비 \+7회/)
  // 툴팁 — HTML 안에 이미 그려져 있고 hover CSS 로만 보인다 (title 속성은 쓰지 않는다)
  assert.match(html, /<span class="trend-tip">10\/05 — 전체 22회 · RAG 14회 · 사용률 64% · 청크 31개<\/span>/)
  assert.doesNotMatch(html, /trend-bar" title="/)
})

test('데이터가 없으면 빈 메시지를 보여준다', async () => {
  const h = await setup()
  h.ui.ragTrend = []
  const html = h.ns.dashboardRagView()
  assert.match(html, /아직 집계된 호출이 없어요/)
})
