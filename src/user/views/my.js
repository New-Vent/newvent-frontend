/**
 * 내 혜택 — 참여 기록과 받은 혜택.
 *
 * 서버 모드는 `GET /api/users/me/participations` 하나로 요약과 목록을 같이 받는다.
 * 지표 3개(참여·혜택·대기)를 프론트가 세지 않고 서버 summary 를 그대로 쓴다 —
 * 페이지네이션이 있어서 현재 페이지만으로는 전체 개수를 알 수 없기 때문이다.
 *
 * 원본: myView · metric
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { shortDate } from '@shared/format.js'
import { USE_SERVER } from '@shared/repo.js'
import { eventById, rows } from '@shared/selectors.js'
import { ui } from '@shared/state.js'
import { button, metric } from '@shared/ui/controls.js'

import { loginView } from './login.js'

/** 2026-10-02T14:32:10+09:00 → 2026.10.02 14:32 */
function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const hm = d.toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul',
  })
  return shortDate(iso.slice(0, 10)) + ' ' + hm
}

const heading = (name) =>
  '<div class="page-heading my-page-heading">'
  + '<span class="eyebrow">나의 참여 활동</span>'
  + '<h1>참여 기록과 혜택을 한눈에</h1>'
  + '<p>' + esc(name) + '님의 이벤트 참여 내역과 결과를 확인하세요.</p>'
  + '</div>'

const metrics = (s) =>
  '<div class="metrics">'
  + metric('참여 기록', s.totalParticipationCount + '<small class="small"> 건</small>', '지금까지 참여한 모든 기록', 'layers')
  + metric('받은 혜택', s.rewardCount + '<small class="small"> 건</small>', '참여 결과로 확인한 선물', 'gift')
  + metric('결과 대기', s.pendingCount + '<small class="small"> 건</small>', '발표를 기다리는 이벤트', 'clock')
  + '</div>'

const filterBar = (count) =>
  '<div class="filterbar"><div class="filters">'
  + button('my-filter', '전체 참여 내역', 'data-value="all"', ui.myFilter === 'all' ? 'active' : '')
  + button('my-filter', '받은 혜택', 'data-value="rewards"', ui.myFilter === 'rewards' ? 'active' : '')
  + '</div><span class="result-count">' + count + '건</span></div>'

const emptyBox =
  '<div class="empty">' + icon('gift') + '<h3>아직 기록이 없어요</h3>'
  + '<p>마음에 드는 이벤트에 참여해보세요.</p>'
  + button('route', '이벤트 둘러보기', 'data-route="home"', 'btn soft') + '</div>'

/* ───────────── 서버 모드 ───────────── */

function serverCard(p) {
  const pending = p.state === 'pending'
  const won = p.resultStatus === 'WON'
  const resultLabel = pending
    ? '결과 대기'
    : won
      ? '당첨'
      : p.resultStatus === 'LOST'
        ? '미당첨'
        : '참여 완료'

  return '<article class="history-card card">'
    + '<div class="history-icon">'
    + icon(won ? 'gift' : pending ? 'clock' : 'layers')
    + '</div>'
    + '<div class="history-info">'
    + '<h3>' + esc(p.title) + '</h3>'
    + '<div class="history-meta">' + when(p.at) + '</div>'
    + '</div>'
    + '<div class="history-result">'
    + '<span class="badge ' + (pending ? 'amber' : won ? 'green' : '') + '">'
    + resultLabel
    + '</span>'
    + '</div>'
    + '<div class="history-actions">'
    + button(
      'result',
      '상세 보기',
      'data-id="' + esc(p.id) + '"',
      'btn sm history-detail-btn',
    )
    + button(
      'event',
      '이벤트 보기',
      'data-id="' + esc(p.eventId) + '"',
      'btn sm history-event-btn',
    )
    + '</div>'
    + '</article>'
}

function myPagination(data) {
  const totalPages = data.totalPages

  if (totalPages <= 1) return ''

  const page = data.page
  const start = Math.max(0, Math.min(page - 2, totalPages - 5))
  const end = Math.min(totalPages, start + 5)

  const pageButton = (target, label, disabled = false) => {
    const current = target === page

    return '<button type="button"'
      + ' class="btn sm' + (current ? ' primary' : '') + '"'
      + ' data-act="my-page"'
      + ' data-page="' + target + '"'
      + (disabled ? ' disabled' : '')
      + (current ? ' aria-current="page"' : '')
      + '>' + label + '</button>'
  }

  let pages = ''

  for (let index = start; index < end; index++) {
    pages += pageButton(index, index + 1)
  }

  return '<nav class="my-pagination" aria-label="내 혜택 페이지">'
    + pageButton(page - 1, '이전', page === 0)
    + pages
    + pageButton(page + 1, '다음', page >= totalPages - 1)
    + '</nav>'
}

function serverMyView() {
  const st = ui.serverMyState
  if (st === 'loading') {
    return '<div class="container">' + heading(ui.userName || '회원')
      + '<div class="empty"><h3>불러오는 중…</h3></div></div>'
  }
  if (st === 'error') {
    return '<div class="container">' + heading(ui.userName || '회원')
      + '<div class="empty"><h3>참여 내역을 불러오지 못했어요</h3>'
      + '<p>' + esc(ui.serverMyError || '') + '</p>'
      + button('reload-my', '다시 시도', '', 'btn soft') + '</div></div>'
  }

  const d = ui.serverMy
  if (!d) return '<div class="container">' + heading(ui.userName || '회원') + '</div>'

  return '<div class="container">' + heading(ui.userName || '회원')
    + metrics(d.summary)
    + filterBar(d.totalElements)
    + '<div class="stack">'
    + (d.items.length ? d.items.map(serverCard).join('') : emptyBox)
    + '</div>'
    + myPagination(d)
    + '</div>'
}

/* ───────────── 목업 모드 ───────────── */

function mockMyView() {
  const ps = rows()
  const shown = ui.myFilter === 'rewards' ? ps.filter((p) => p.reward) : ps
  const summary = {
    totalParticipationCount: ps.length,
    rewardCount: ps.filter((p) => p.reward).length,
    pendingCount: ps.filter((p) => p.state === 'pending').length,
  }
  const cards = shown.slice().reverse().map((p) => {
    const e = eventById(p.eventId)
    return '<article class="history-card card"><div class="history-icon">' + icon(e?.icon || 'gift') + '</div>'
      + '<div class="history-info"><h3>' + esc(p.title) + '</h3>'
      + '<div class="history-meta">' + p.at + ' · ' + p.id + '</div></div>'
      + '<div class="history-result"><span class="badge ' + (p.state === 'pending' ? 'amber' : 'green') + '">'
      + (p.state === 'pending' ? '결과 대기' : '참여 완료') + '</span>'
      + '<p>' + esc(p.reward || p.result) + '</p></div>'
      + button('result', '상세 보기', 'data-id="' + p.id + '"', 'btn sm') + '</article>'
  }).join('')

  return '<div class="container">' + heading('헌진')
    + metrics(summary) + filterBar(shown.length)
    + '<div class="stack">' + (shown.length ? cards : emptyBox) + '</div></div>'
}

function myView() {
  if (!ui.logged) return loginView('참여 내역을 보려면 로그인해주세요')
  return USE_SERVER ? serverMyView() : mockMyView()
}

export { myView }
