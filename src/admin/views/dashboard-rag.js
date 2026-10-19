/**
 * RAG 품질 대시보드 — 신규 뷰 1개 (라우트 /rag).
 *
 *   주간 추이  GET /api/admin/rag/quality-trend?weeks=8
 *   재색인 이력 GET /api/admin/rag/reindex-logs
 *   전체 재색인 POST /reindex/all + GET /reindex/all/status
 *
 * 주간 막대 — 파란색이 전체 호출, 안쪽 초록색이 그중 RAG 참고 사례를 실어 넣은 호출.
 * 막대 밖엔 주 시작 날짜만 두고 자세한 수치는 hover 툴팁에서 세로로 요약해 보여준다.
 * 범례 아래 지난주 대비 증감을 붙인다 (같은 응답으로 계산 — 추가 요청 없음).
 * 차트 라이브러리 없이 div 높이로 그린다 (프로덕션 의존성 제로 원칙).
 *
 * 과거에는 전체 재색인 카드가 버전 이력 화면에 있었다 — 전역 작업인데 이벤트 화면에
 * 놓인 게 반직관적이라 관찰(추이)·설명(이력)·행동(실행)이 한 화면에서 닫히도록 여기로 옮겼다.
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { loadQualityTrend, loadReindexLogs, startReindexAll, pollReindexStatus } from '@shared/repo.js'
import { ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'
import { toast } from '@shared/ui/toast.js'

/** 화면에 처음 들어올 때 한 번 읽는다. 실패하면 빈 목록으로 둔다 */
export function ensureDashboard(onDone) {
  if (ui.ragTrend !== undefined) return
  ui.ragTrend = null
  ui.ragReindexLogs = null
  ui.ragReindexAll = null
  let pending = 3
  const finish = () => { if (--pending === 0) onDone() }
  loadQualityTrend(8)
    .then((rows) => { ui.ragTrend = Array.isArray(rows) ? rows : [] })
    .catch(() => { ui.ragTrend = [] })
    .finally(finish)
  loadReindexLogs()
    .then((rows) => { ui.ragReindexLogs = Array.isArray(rows) ? rows : [] })
    .catch(() => { ui.ragReindexLogs = [] })
    .finally(finish)
  // 다른 관리자가 이미 전체 재색인을 돌리고 있으면 진행 중으로 그린다
  pollReindexStatus()
    .then((st) => { ui.ragReindexAll = st })
    .catch(() => { ui.ragReindexAll = null })
    .finally(finish)
}

const maxOf = (rows, pick) => rows.reduce((m, r) => Math.max(m, pick(r) || 0), 0)

/** '2026-10-05' → '10/05'. 백엔드가 월요일 시작 날짜를 준다 */
const weekLabel = (iso) => String(iso ?? '').slice(5).replace('-', '/')

/** '2026-10-05' → '10/05-10/11'. 툴팁용 주간 범위 — 시작 +6일 (월요일~일요일) */
const weekRange = (iso) => {
  const s = String(iso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return String(iso ?? '')
  const end = new Date(s + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + 6)
  const m = String(end.getUTCMonth() + 1).padStart(2, '0')
  const d = String(end.getUTCDate()).padStart(2, '0')
  return weekLabel(s) + '-' + m + '/' + d
}

/** 사용률 % — 분모 0 이면 '-' */
const rate = (rag, total) => (total > 0 ? Math.round((rag / total) * 100) + '%' : '-')

// 재색인 이력 — scope(SINGLE/EVENT/ALL)·status 를 화면용 말로 바꾼다
const scopeLabel = { SINGLE: '버전 재색인', EVENT: '이벤트 재색인', ALL: '전체 재색인' }
const statusLabel = { SUCCESS: '성공', FAILED: '실패' }

/** 로그 시각(UTC ISO) → KST 달 'MM/DD hh:mm'. 백엔드 주간 집계가 KST 기준이라 표시도 KST 로 맞춘다 */
const logStamp = (iso) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000)
  if (Number.isNaN(d.getTime())) return String(iso ?? '')
  return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0')
    + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

/** 로그 시각 → KST 날짜 'YYYY-MM-DD'. 주 범위 비교용 */
const logDateKst = (iso) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * 그 주에 실행된 전체 재색인이 있나 — 추이 툴팁의 "왜 이 주가 튄나" 말붙이(ALL만).
 * 전체 재색인은 모든 청크의 생성 시각을 실행일로 다시 찍는다 — 그래서 이 표지로 설명이 끝난다.
 */
function allReindexInWeek(logs, weekStart) {
  if (!weekStart || !logs || !logs.length) return false
  const end = new Date(weekStart + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + 6)
  const endDate = end.toISOString().slice(0, 10)
  return logs.some((l) => l.scope === 'ALL'
    && logDateKst(l.createdAt) >= weekStart && logDateKst(l.createdAt) <= endDate)
}

/** 마지막 두 주 RAG 사용 증감. 1주뿐이면 null */
function weekDelta(rows) {
  if (rows.length < 2) return null
  const sorted = rows.slice().sort((a, b) => String(a.weekStart) < String(b.weekStart) ? -1 : 1)
  const prev = sorted[sorted.length - 2].ragUsedCalls || 0
  const last = sorted[sorted.length - 1].ragUsedCalls || 0
  return { last, diff: last - prev }
}

export function dashboardRagView() {
  const rows = ui.ragTrend
  const head = `
    <div class="page-heading admin-page-heading">
      <div class="admin-page-title">
        <div class="admin-page-title__path">
          <span>워크스페이스</span>
          <span aria-hidden="true">›</span>
          <span class="admin-page-title__current">RAG 품질</span>
        </div>
        <h1>RAG 품질</h1>
        <p>주간 AI 호출과 RAG 사용 추이를 확인하세요.</p>
      </div>
    </div>
  `
  if (!rows) return '<div class="container">' + head + '<div class="card"><p>불러오는 중…</p></div></div>'
  if (!rows.length) {
    return '<div class="container">' + head
      + '<div class="card"><p>아직 집계된 호출이 없어요.</p></div></div>'
  }

  const legend = '<p class="trend-legend">'
    + '<span><i class="sw sw-total"></i><b>전체 호출</b> — 그 주에 생성을 부른 횟수</span>'
    + '<span><i class="sw sw-rag"></i><b>그중 RAG 참고</b> — 안쪽 초록 막대, 참고 사례를 실어 넣은 호출</span>'
    + '</p>'
  const maxCalls = Math.max(1, maxOf(rows, (r) => r.totalCalls))
  const cols = rows.map((r) => {
    const total = r.totalCalls || 0
    const rag = Math.min(total, r.ragUsedCalls || 0)
    const usage = rate(rag, total)
    // 툴팁 본문은 세로로 쌓아 보여주고, aria-label 은 스크린리더용 한 줄 요약으로 둔다
    const aria = esc(weekRange(r.weekStart) + ' — 전체 ' + total + '회 · 그중 RAG 참고 ' + rag + '회 · 사용률 ' + usage + ' · 청크 ' + (r.chunkCount || 0) + '개')
    return '<div class="trend-col">'
      + '<small class="trend-week">' + esc(weekLabel(r.weekStart)) + '</small>'
      + '<div class="trend-bar" tabindex="0" aria-label="' + aria + '">'
      + '<span class="trend-tip">'
      + '<em>' + esc(weekRange(r.weekStart)) + '</em>'
      + '<span>전체 ' + total + '회</span>'
      + '<span>그중 RAG 참고 ' + rag + '회</span>'
      + '<span>사용률 ' + usage + '</span>'
      + '<span>청크 ' + (r.chunkCount || 0) + '개</span>'
      + (allReindexInWeek(ui.ragReindexLogs, String(r.weekStart ?? ''))
          ? '<span class="tip-flag">그 주에 전체 재색인 실행</span>' : '')
      + '</span>'
      + '<span class="trend-fill" style="height:' + Math.round((total / maxCalls) * 100) + '%">'
      + '<span class="trend-rag" style="height:' + (total ? Math.round((rag / total) * 100) : 0) + '%"></span>'
      + '</span></div>'
      + '</div>'
  }).join('')

  const d = weekDelta(rows)
  const delta = d
    ? '<p class="trend-delta">이번 주 RAG 참고 ' + d.last + '회 · 지난주 대비 '
      + (d.diff === 0 ? '변동 없음' : (d.diff > 0 ? '+' + d.diff + '회' : d.diff + '회')) + '</p>'
    : ''

  return '<div class="container">' + head
    + reindexActionCard()
    + delta
    + '<div class="card"><div class="trend">' + cols + '</div>'
    + legend
    + '<p class="helper trend-helper">막대 높이는 그 주 전체 호출 수, 안쪽 초록은 그중 RAG 참고 사례를 실어 넣은 호출이에요. '
    + '막대에 마우스를 올리면 주간 범위와 전체·RAG 참고 회수, 사용률, 그 주에 사용된 청크 수가 세로로 요약돼요. '
    + '그 주에 전체 재색인을 돌렸으면 청크 수가 일제히 바뀌니 말줄에 "그 주에 전체 재색인 실행" 표시가 붙어요. '
    + '막대 밖 날짜는 주의 시작일이고, 이번 주는 아직 끝나지 않아서 숫자가 작을 수 있어요.</p></div>'
    + reindexCard(ui.ragReindexLogs)
    + '</div>'
}

/** 전체 재색인 실행 카드 — 들어오면 바로 누를 수 있게 차트 위 맨 앞에 둔다 */
function reindexActionCard() {
  const st = ui.ragReindexAll
  const running = !!st?.running
  const desc = running
    ? '<p class="rag-desc">전체 재색인 진행 중… 2초 간격으로 상태를 확인해요.</p>'
    : (st?.lastResult
      ? '<p class="rag-desc">완료 — 성공 ' + (st.lastResult.succeeded ?? 0) + '/' + (st.lastResult.totalEvents ?? 0)
        + ', 청크 ' + (st.lastResult.totalChunks ?? 0) + '개</p>'
      : '<p class="rag-desc">삭제된 이벤트·시드를 빼고 전체 이벤트의 청크를 다시 만들어요.<br>'
        + '돌린 뒤에는 아래 이력에 ALL 기록 한 줄이 쌓여요.</p>')
  return '<div class="card rag-card rag-reindex">'
    + '<div class="rag-reindex-text">'
    + '<h3>RAG 전체 재색인</h3>'
    + desc
    + '</div>'
    + button('rag-reindex-all', running ? '진행 중…' : '전체 재색인', running ? 'disabled' : '', 'btn sm')
    + '</div>'
}

/**
 * 재색인 이력 카드 — 실행 1회당 남은 기록을 최신순으로 보여준다.
 * 품질 추이에서 청크 수가 튄 주가 보일 때 원인을 먼저 여기서 확인하게 하려는 배치다.
 */
function reindexCard(logs) {
  if (!logs) return ''
  if (!logs.length) {
    return '<div class="card reindex-card"><h3>재색인 이력</h3>'
      + '<p class="helper trend-helper">아직 재색인 기록이 없어요. 재색인을 돌리면 실행마다 기록이 쌓여요.</p></div>'
  }
  const rows = logs.map((l) => {
    const line = logStamp(l.createdAt) + ' · ' + (scopeLabel[l.scope] || l.scope) + ' · '
      + (statusLabel[l.status] || l.status)
      + (l.chunkCount != null ? ' · 청크 ' + l.chunkCount + '개' : '')
    return '<div class="reindex-row"><span class="reindex-line">' + esc(line) + '</span>'
      + (l.failureMessage ? '<span class="reindex-fail">사유: ' + esc(l.failureMessage) + '</span>' : '')
      + '</div>'
  }).join('')
  return '<div class="card reindex-card"><h3>재색인 이력</h3>'
    + '<p class="helper trend-helper">버전·이벤트·전체 재색인이 돌 때마다 남는 기록이에요. '
    + '품질 추이에서 청크 수가 튀는 주가 보이면 여기서 먼저 확인해요.</p>'
    + rows + '</div>'
}

/** 전체 재색인 폴링 타이머 — 이 화면에서만 하나다 */
let reindexTimer = null

/**
 * 대시보드 버튼 (main.js 가 클릭을 위임한다). 처리했으면 true.
 * rag-panel.js 에 있던 전체 재색인 처리가 이동해 온 것 — 동작(202 시작/409 관용/2초 폴링)은 같다.
 * @returns {boolean} 처리했으면 true
 */
export function handleRagDashboardClick(a, rerender) {
  if (a !== 'rag-reindex-all') return false
  reindexAllFromDashboard(rerender)
  return true
}

async function reindexAllFromDashboard(rerender) {
  try {
    await startReindexAll()  // 202. 이미 돌고 있으면 409 — 그래도 상태 폴링으로 간다
  } catch (e) {
    if (e?.status !== 409) {
      toast(e?.message || '전체 재색인을 시작하지 못했어요.')
      return
    }
  }
  if (reindexTimer) clearInterval(reindexTimer)
  reindexTimer = setInterval(async () => {
    // 화면을 벗어났으면 폴링을 끊는다 — 보이지 않는 상태 갱신은 비용일 뿐이다
    if (ui.route !== 'rag') {
      clearInterval(reindexTimer)
      reindexTimer = null
      return
    }
    try {
      const st = await pollReindexStatus()
      ui.ragReindexAll = st
      if (!st.running) {
        clearInterval(reindexTimer)
        reindexTimer = null
        // 방금 ALL 행이 쌓였을 수 있으니 이력 카드도 새로 읽는다
        loadReindexLogs()
          .then((rows) => { ui.ragReindexLogs = Array.isArray(rows) ? rows : [] })
          .catch(() => {})
      }
      rerender()
    } catch {
      clearInterval(reindexTimer)
      reindexTimer = null
      rerender()
    }
  }, 2000)
}
