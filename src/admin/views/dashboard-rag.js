/**
 * RAG 품질 대시보드 — 신규 뷰 1개 (라우트 /rag).
 *
 *   주간 추이  GET /api/admin/rag/quality-trend?weeks=8
 *
 * 주간 막대 — 파란색이 전체 호출, 안쪽 초록색이 그중 RAG 참고 사례를 실어 넣은 호출.
 * 막대 밖엔 주 시작 날짜만 두고 자세한 수치는 hover 툴팁에서 세로로 요약해 보여준다.
 * 범례 아래 지난주 대비 증감을 붙인다 (같은 응답으로 계산 — 추가 요청 없음).
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

  return '<div class="container">' + head + legend + delta
    + '<div class="card"><div class="trend">' + cols + '</div>'
    + '<p class="helper trend-helper">막대 높이는 그 주 전체 호출 수, 안쪽 초록은 그중 RAG 참고 사례를 실어 넣은 호출이에요. '
    + '막대에 마우스를 올리면 주간 범위와 전체·RAG 참고 회수, 사용률, 그 주에 사용된 청크 수가 세로로 요약돼요. '
    + '막대 밖 날짜는 주의 시작일이에요. '
    + '이번 주는 아직 끝나지 않아서 숫자가 작을 수 있어요.</p></div></div>'
}
