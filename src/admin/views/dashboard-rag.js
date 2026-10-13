/**
 * RAG 품질 대시보드 — 신규 뷰 1개 (라우트 /rag).
 *
 *   주간 추이  GET /api/admin/rag/quality-trend?weeks=8
 *
 * 주간 막대 — 파란색이 전체 호출, 안쪽 초록색이 그중 RAG 를 쓴 호출.
 * 막대 아래 사용률 %, 범례 아래 지난주 대비 증감을 붙인다 (같은 응답으로 계산 — 추가 요청 없음).
 * 차트 라이브러리 없이 div 높이로 그린다 (프로덕션 의존성 제로 원칙).
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { loadQualityTrend } from '@shared/repo.js'
import { ui } from '@shared/state.js'
import { button } from '@shared/ui/controls.js'

/** 화면에 처음 들어올 때 한 번 읽는다. 실패하면 빈 목록으로 둔다 */
export function ensureDashboard(onDone) {
  if (ui.ragTrend !== undefined) return
  ui.ragTrend = null
  loadQualityTrend(8)
    .then((rows) => { ui.ragTrend = Array.isArray(rows) ? rows : [] })
    .catch(() => { ui.ragTrend = [] })
    .finally(onDone)
}

const maxOf = (rows, pick) => rows.reduce((m, r) => Math.max(m, pick(r) || 0), 0)

/** '2026-10-05' → '10/05'. 백엔드가 월요일 시작 날짜를 준다 */
const weekLabel = (iso) => String(iso ?? '').slice(5).replace('-', '/')

/** 사용률 % — 분모 0 이면 '-' */
const rate = (rag, total) => (total > 0 ? Math.round((rag / total) * 100) + '%' : '-')

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
  const back = button('route', icon('back') + '이벤트 관리', 'data-route="admin"', 'backlink')
  const head = '<div class="page-heading"><span class="eyebrow">RAG</span><h1>품질 추이</h1></div>'
  if (!rows) return '<div class="container">' + back + head + '<div class="card"><p>불러오는 중…</p></div></div>'
  if (!rows.length) {
    return '<div class="container">' + back + head
      + '<div class="card"><p>아직 집계된 호출이 없어요.</p></div></div>'
  }

  const legend = '<p class="trend-legend">'
    + '<span><i class="sw sw-total"></i>전체 호출</span>'
    + '<span><i class="sw sw-rag"></i>그중 RAG 사용</span></p>'
  const maxCalls = Math.max(1, maxOf(rows, (r) => r.totalCalls))
  const cols = rows.map((r) => {
    const total = r.totalCalls || 0
    const rag = Math.min(total, r.ragUsedCalls || 0)
    return '<div class="trend-col">'
      + '<small class="trend-week">' + esc(weekLabel(r.weekStart)) + '</small>'
      + '<strong class="trend-value">' + total + '<span> / ' + rag + '</span></strong>'
      + '<div class="trend-bar" title="' + esc(weekLabel(r.weekStart)) + ' — 전체 ' + total + '회 · RAG ' + rag + '회 · 청크 ' + (r.chunkCount || 0) + '개">'
      + '<span class="trend-fill" style="height:' + Math.round((total / maxCalls) * 100) + '%">'
      + '<span class="trend-rag" style="height:' + (total ? Math.round((rag / total) * 100) : 0) + '%"></span>'
      + '</span></div>'
      + '<small class="trend-rate">사용률 ' + rate(rag, total) + '</small>'
      + '</div>'
  }).join('')

  const d = weekDelta(rows)
  const delta = d
    ? '<p class="trend-delta">이번 주 RAG 사용 ' + d.last + '회 · 지난주 대비 '
      + (d.diff === 0 ? '변동 없음' : (d.diff > 0 ? '+' + d.diff + '회' : d.diff + '회')) + '</p>'
    : ''

  return '<div class="container">' + back + head + legend + delta
    + '<div class="card"><div class="trend">' + cols + '</div>'
    + '<p class="helper">막대 높이는 주간 전체 호출 수, 안쪽 초록색은 RAG 를 쓴 호출이에요. '
    + '막대 위 숫자는 전체 / RAG 사용 회수, 아래는 사용률이에요. 마우스를 올리면 청크 수도 보여요. '
    + '이번 주는 아직 끝나지 않아서 숫자가 작을 수 있어요.</p></div></div>'
}
