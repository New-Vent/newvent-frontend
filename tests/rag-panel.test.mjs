import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'

/**
 * rag-panel.js — 버전 이력의 RAG 구역.
 * 목업 · 서버 양쪽이 부르는 공통 모듈이라 state 대신 이벤트 ID 로 상태를 가진다.
 * repo.js 함수는 전부 스텁으로 끼워 넣는다(하네스 특성상 모든 import 가 같은 네임스페이스를 받는다).
 */
async function setup() {
  const buttons = []
  const ui = { activeId: '7', route: 'admin', serverEditor: null }
  const bindings = {
    esc: String, icon: () => '', ui,
    button: (action, label, attrs) => { buttons.push({ action, label, attrs }); return '' },
    toast: (message) => { buttons.push({ action: 'toast', label: message }) },
    loadIndexStatus: async (eventId) => ({ eventId, totalVersions: 3, indexedVersions: 2, pendingVersions: eventId === '9' ? 0 : 1, chunkCount: 7, lastIndexedAt: null }),
    loadLlmCallLogs: async () => ({
      content: [
        { id: 101, eventId: '7', modelName: 'cohere.embed-multilingual-v3', validOk: true, inputTokens: 1200, outputTokens: 300, responseTimeMs: 1400, ragUsed: true, createdAt: '2026-10-11T10:00:00Z' },
        { id: 102, eventId: '7', modelName: 'cohere.embed-multilingual-v3', validOk: false, inputTokens: 800, outputTokens: null, responseTimeMs: 60000, ragUsed: false, createdAt: '2026-10-11T09:00:00Z' },
      ],
    }),
    // 성공 행은 청크 ID를, 실패 행은 실패원인을 상세에서 가져온다
    loadLlmCallLog: async (id) => (Number(id) === 102
      ? { failureType: 'TIMEOUT', failureMessage: 'Bedrock 호출이 60초 안에 끝나지 않았어요.', chunkIds: null }
      : { failureType: null, failureMessage: null, chunkIds: '101,102' }),
  }
  const module = new SourceTextModule(await readFile(new URL('../src/admin/views/rag-panel.js', import.meta.url), 'utf8'))
  await module.link(() => new SyntheticModule(Object.keys(bindings), function () {
    for (const [key, value] of Object.entries(bindings)) this.setExport(key, value)
  }))
  await module.evaluate()
  return {
    ns: module.namespace, buttons, ui,
    settle: () => new Promise((r) => setTimeout(r, 20)),
  }
}

test('첫 렌더에서 색인 현황과 호출 로그를 불러와 배지와 카드를 만든다', async () => {
  const h = await setup()
  h.ns.ensureRagPanel('7')
  await h.settle()
  // 재색인이 필요한 버전 1개 → 경고 배지
  assert.match(h.ns.ragIndexBadge('7'), /재색인이 필요한 버전이 1개 있어요/)
  const html = h.ns.ragPanel('7')
  assert.match(html, /LLM 호출 로그/)
  // 로그 표 — 호출 ID·모델, 상태 배지, 토큰·응답시간 칸 (표형이라 칸이 갈라져 있다)
  assert.match(html, /<span class="rag-log-id">#101<\/span>/)
  assert.match(html, /is-success/)
  assert.match(html, /1200/)
  assert.match(html, /<td class="rag-log-number">1\.4초<\/td>/)
  // 상세에서 붙인 실패원인·청크ID 인라인
  assert.match(html, /<span class="rag-log-id">#102<\/span>/)
  assert.match(html, /is-failure/)
  assert.match(html, /실패: TIMEOUT/)
  // 재색인 버튼은 이제 버전 이력 화면에 없다 — 전체 재색인 카드가 품질 대시보드로 이동했다
  assert.deepEqual(h.buttons.filter((b) => b.action === 'rag-reindex-all').length, 0)
  assert.deepEqual(h.buttons.filter((b) => b.action === 'rag-log').length, 0)
})

test('색인 배지는 전부 색인됐을 때 완료로 표시한다', async () => {
  const h = await setup()
  h.ns.ensureRagPanel('9') // 스텁이 이 ID 는 미색인 0건으로 답한다
  await h.settle()
  assert.match(h.ns.ragIndexBadge('9'), /모든 버전의 색인이 완료됐어요/)
})

test('패널에 재색인 실행 카드가 더 이상 없다', async () => {
  const h = await setup()
  h.ns.ensureRagPanel('7')
  await h.settle()
  const html = h.ns.ragPanel('7')
  // 카드 대신 배지가 패널 맨 앞에 온다 — 전체 재색인 실행은 품질 대시보드의 몫이다
  assert.match(html, /재색인이 필요한 버전이 1개 있어요/)
  assert.doesNotMatch(html, /RAG 전체 재색인/)
})
