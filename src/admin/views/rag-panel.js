/**
 * 버전 이력 화면의 RAG 구역 — 색인 배지 · LLM 호출 로그 카드.
 *
 * 서버 화면(server-versions.js)과 목업 화면(versions.js)이 같이 쓴다.
 * 백엔드가 없어도 보이도록 repo.js 함수가 목업 분기를 한다(템플릿 라이브러리와 같은 방식).
 *
 * 상태는 이 모듈이 이벤트별로 들고 있다(화면 객체에 물지 않는다 — 두 화면이 번갈아 열려도
 * 값이 남아 있어 다시 불러오지 않는다).
 *
 * 전체 재색인 카드는 품질 대시보드(dashboard-rag.js)로 옮겨 갔다 — 전역 작업인데
 * 이벤트 화면에 놓인 게 반직관적이었기 때문. 버전·이벤트 범위 재색인만 여기에 남는다.
 */

import { esc } from '@shared/dom.js'
import { loadIndexStatus, loadLlmCallLogs, loadLlmCallLog } from '@shared/repo.js'
import { ui } from '@shared/state.js'

const stamp = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})
const when = (iso) => (iso ? stamp.format(new Date(iso)) : '')

/** 이벤트별 패널 상태. index·logs 는 undefined 면 아직 안 불러봤다는 뜻 */
const PANELS = {}
const panelOf = (eventId) => (PANELS[eventId] ||= { index: undefined, logs: undefined, loading: false })

/** 화면을 그릴 때 한 번 불러온다. 다 오면 'rag:refresh' 이벤트로 다시 그리게 한다 */
export function ensureRagPanel(eventId) {
  if (eventId == null || eventId === '') return
  const p = panelOf(eventId)
  if (p.loading || p.index !== undefined) return
  p.loading = true
  Promise.all([
    loadIndexStatus(eventId).catch(() => null),
    loadLlmCallLogs({ eventId }).catch(() => null),
  ]).then(async ([index, logs]) => {
    p.loading = false
    p.index = index
    p.logs = logs
    // 목록에는 실패원인·청크ID가 없다 — 인라인 표시용으로 필요한 행만 상세를 붙인다
    await attachDetails(p)
    refresh()
  })
}

/** 상세 붙이기 + 다시 그리기. 목록만으로 그릴 때와 같은 경로를 쓴다 */
async function attachDetails(p) {
  const rows = normalizeLogs(p.logs).filter((l) => !l.validOk || l.ragUsed)
  await Promise.all(rows.map(async (l) => {
    try {
      const d = await loadLlmCallLog(l.id)
      l.failureType = d?.failureType
      l.failureMessage = d?.failureMessage
      l.chunkIds = d?.chunkIds
    } catch {
      // 상세 실패는 무시 — 목록 정보만 보여준다
    }
  }))
}

function refresh() {
  // 버전 이력 화면을 벗어난 뒤면 다시 그리지 않는다
  if (ui.route === 'versions') document.dispatchEvent(new Event('rag:refresh', { bubbles: true }))
}

/** 단건 재색인 뒤 배지를 갱신하게 한다 (server-versions.js 의 버전 행 버튼이 쓴다) */
export async function refreshRagPanel(eventId) {
  const p = panelOf(eventId)
  p.index = await loadIndexStatus(eventId).catch(() => p.index)
}

export function ragIndexBadge(eventId) {
  const st = panelOf(eventId).index
  if (!st) return ''

  const pending = st.pendingVersions > 0
  const message = pending
    ? '재색인이 필요한 버전이 ' + st.pendingVersions + '개 있어요.'
    : '모든 버전의 색인이 완료됐어요.'

  return '<span class="admin-index-notice' + (pending ? ' is-pending' : '') + '">'
    + '<span class="admin-index-notice-icon" aria-hidden="true">i</span>'
    + '<span>' + message + '</span>'
    + '</span>'
}

export function ragPanel(eventId) {
  const p = eventId == null ? null : panelOf(eventId)
  const logs = normalizeLogs(p?.logs)
  const rows = logs.length
    ? `
      <div class="rag-log-table-wrap">
        <table class="rag-log-table" aria-label="LLM 호출 로그">
          <thead>
            <tr>
              <th scope="col">호출 / 모델</th>
              <th scope="col">상태</th>
              <th scope="col">입력 / 출력 토큰</th>
              <th scope="col">응답 시간</th>
              <th scope="col">일시</th>
            </tr>
          </thead>
          <tbody>
            ${logs.slice(0, 5).map((l) => {
              const chunks = l.ragUsed && l.chunkIds
                ? String(l.chunkIds)
                : ''

              return `
                <tr>
                  <td>
                    <span class="rag-log-model">
                      <span class="rag-log-id">#${esc(l.id)}</span>
                      ${esc(l.modelName ?? '')}
                    </span>
                    ${l.ragUsed
                      ? '<span class="rag-log-rag">RAG 사용</span>'
                      : ''}
                  </td>
                  <td>
                    <span class="rag-log-status ${l.validOk ? 'is-success' : 'is-failure'}">
                      ${l.validOk ? '성공' : '실패'}
                    </span>
                  </td>
                  <td class="rag-log-number">
                    ${esc(l.inputTokens ?? '-')}
                    <span class="rag-log-slash">/</span>
                    ${esc(l.outputTokens ?? '-')}
                  </td>
                  <td class="rag-log-number">${esc(ms(l.responseTimeMs))}</td>
                  <td class="rag-log-date">${esc(when(l.createdAt))}</td>
                </tr>
                ${!l.validOk || chunks ? `
                  <tr class="rag-log-detail">
                    <td colspan="5">
                      ${!l.validOk
                         ? `
                           <details class="rag-log-failure">
                             <summary>실패 사유 보기</summary>
                             <div class="rag-log-failure-body">
                               ${l.failureType
                                 ? `<span class="rag-log-failure-type">${esc(l.failureType)}</span>`
                                 : ''}
                               <p>${esc(l.failureMessage || '상세 실패 사유를 불러오지 못했어요.')}</p>
                             </div>
                           </details>
                         `
                         : ''}
                      ${chunks
                        ? `<p class="rag-log-meta">참고 청크: ${esc(chunks)}</p>`
                        : ''}
                    </td>
                  </tr>
                ` : ''}
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    `
    : '<p class="rag-desc">아직 호출 기록이 없어요.</p>'

  // 색인 배지 — 서버 화면은 여기만 배지를 본다 (목업 화면은 제목 옆에 같이 뜨도록 versions.js 가 배지를 그린다)
  return ragIndexBadge(eventId)
    + '<div class="card rag-card"><h3>LLM 호출 로그</h3>' + rows + '</div>'
}

/** 목록은 페이지 객체로 오고 상세는 단건으로 온다 — 둘 다 배열로 맞춘다 */
const normalizeLogs = (raw) => (Array.isArray(raw) ? raw : (raw?.content ?? []))

/** 1400 → '1.4초', 800 → '800ms'. 없으면 '-' */
const ms = (v) => (v == null ? '-' : (v >= 1000 ? (Math.round(v / 100) / 10) + '초' : v + 'ms'))

