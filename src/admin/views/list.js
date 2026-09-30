/**
 * 이벤트 관리 목록.
 *
 * 탭 세 개로 나뉜다. **탭마다 열도 버튼도 다르다** — 같은 표를 재사용하지 않고
 * 탭별 렌더 함수를 따로 둔 이유다.
 *
 *   나의 이벤트   작업 중인 전부. 버전이력 · 편집하기 · 게시하기 · 삭제하기
 *   게시중        사용자에게 보이는 것만. 기간 · 게시버전 / 게시 내리기
 *   휴지통        삭제된 것.  게시하기(=복구 후 게시) · 영구 삭제하기
 *
 * 원본: adminView · adminTable · adminFilteredEvents
 */

import { published, rows } from '@shared/selectors.js'

import { esc } from '@shared/dom.js'
import { eventStatus, shortDate, statusBadge } from '@shared/format.js'
import { icon } from '@shared/icons.js'
import { state, ui } from '@shared/state.js'
import { button, metric } from '@shared/ui/controls.js'

/** 탭 정의. ui.adminTab 이 이 중 하나를 가리킨다. */
const TABS = [
  { key: 'mine', label: '나의 이벤트' },
  { key: 'live', label: '게시중' },
  { key: 'trash', label: '휴지통' },
]

const currentTab = () => (TABS.some((t) => t.key === ui.adminTab) ? ui.adminTab : 'mine')

/**
 * 탭 · 검색 · 기간으로 거른다.
 * API 의 ?name&status&periodFrom&periodTo 에 대응한다.
 */
function adminFilteredEvents() {
  const tab = currentTab()
  const from = ui.adminFrom || ''
  const to = ui.adminTo || ''

  return state.db.events
    .filter((e) => (tab === 'trash' ? Boolean(e.deletedAt) : !e.deletedAt))
    .filter((e) => (tab === 'live' ? eventStatus(e) === 'live' : true))
    // 상태 필터는 '나의 이벤트'에서만 쓴다. 게시중 탭은 이미 live 로 좁혀져 있다.
    .filter((e) => tab !== 'mine' || ui.adminStatus === 'all' || eventStatus(e) === ui.adminStatus)
    .filter((e) => {
      const s = e.versions.at(-1).snapshot
      if (from && s.end < from) return false
      if (to && s.start > to) return false
      return true
    })
    .filter((e) =>
      (e.versions.at(-1).snapshot.title + ' ' + e.name + ' ' + e.id)
        .toLowerCase()
        .includes(ui.adminQuery.trim().toLowerCase()),
    )
}

/** 현재 페이지만 잘라낸다. API 의 ?page&size 자리. */
function adminPageSlice(es) {
  const size = ui.adminPageSize || 10
  const pages = Math.max(1, Math.ceil(es.length / size))
  const page = Math.min(Math.max(1, ui.adminPage || 1), pages)
  if (ui.adminPage !== page) ui.adminPage = page
  return { rows: es.slice((page - 1) * size, page * size), page, pages, total: es.length }
}

function pager(page, pages) {
  if (pages <= 1) return ''
  const nums = Array.from({ length: pages }, (_, i) => i + 1)
    .map((n) =>
      button('admin-page', String(n), `data-page="${n}" aria-current="${n === page}"`,
        'btn sm ' + (n === page ? 'primary' : 'ghost')),
    )
    .join('')
  return '<div class="admin-pager">'
    + button('admin-page', '이전', `data-page="${page - 1}"${page === 1 ? ' disabled' : ''}`, 'btn sm ghost')
    + nums
    + button('admin-page', '다음', `data-page="${page + 1}"${page === pages ? ' disabled' : ''}`, 'btn sm ghost')
    + '</div>'
}

/* ───────────────────────── 탭별 표 ───────────────────────── */

const titleCell = (e) =>
  `<td><h3>${esc(e.versions.at(-1).snapshot.title)}</h3><small>${e.id} · ${esc(e.name)}</small></td>`

const emptyRow = (cols, text) => `<tr><td colspan="${cols}">${text}</td></tr>`

/** 나의 이벤트 — 게시상태 열 없음, 버전은 한 열로 합침 */
function tableMine(es) {
  const rows = es.map((e) => {
    const latest = e.versions.at(-1).v
    const published = e.publishedVersion
    return '<tr>' + titleCell(e)
      + `<td><span class="badge">최신 v${latest}</span>`
      + (published ? ` <span class="badge green">게시 v${published}</span>` : '')
      + '</td>'
      // 게시하기는 늘 자리를 지킨다. 올릴 게 없으면(최신 == 게시) 눌러도 소용없으니
      // 막아두되 버튼을 없애지는 않는다 — 행마다 버튼 위치가 달라지면 읽기 나쁘다.
      + '<td><div class="row">'
      + button('versions', '버전 이력', `data-id="${e.id}"`, 'btn sm')
      + button('edit', '편집하기', `data-id="${e.id}"`, 'btn sm soft')
      + button('publish-latest', published && latest === published ? '게시됨' : '게시하기',
          `data-id="${e.id}"`
          + (latest === published ? ' disabled title="최신 버전이 이미 게시돼 있어요"' : ''),
          'btn sm ' + (latest === published ? 'ghost' : 'primary'))
      + button('delete-event', '삭제하기', `data-id="${e.id}"`, 'btn sm danger')
      + '</div></td></tr>'
  })
  return `<table class="admin-table"><thead><tr><th>이벤트</th><th>버전</th><th>관리</th></tr></thead><tbody>`
    + rows.join('')
    + (rows.length ? '' : emptyRow(3, '검색 결과가 없습니다.'))
    + '</tbody></table>'
}

/** 게시중 — 기간과 게시버전을 보여주고, 내리는 것만 한다 */
function tableLive(es) {
  const rows = es.map((e) => {
    const s = e.versions.at(-1).snapshot
    return '<tr>' + titleCell(e)
      + `<td>${shortDate(s.start)} ~ ${shortDate(s.end)}</td>`
      + `<td><span class="badge green">v${e.publishedVersion}</span></td>`
      + '<td><div class="row">'
      + button('unpublish', '게시 내리기', `data-id="${e.id}"`, 'btn sm soft')
      + '</div></td></tr>'
  })
  return `<table class="admin-table"><thead><tr><th>이벤트</th><th>기간</th><th>게시버전</th><th>관리</th></tr></thead><tbody>`
    + rows.join('')
    + (rows.length ? '' : emptyRow(4, '게시 중인 이벤트가 없습니다.'))
    + '</tbody></table>'
}

/** 휴지통 — 되살려 바로 게시하거나, 완전히 지운다 */
function tableTrash(es) {
  const rows = es.map((e) =>
    '<tr>' + titleCell(e)
    + `<td><small>${esc(e.deletedAt ? e.deletedAt.slice(0, 10).replaceAll('-', '.') : '')} 삭제</small></td>`
    + '<td><div class="row">'
    + button('restore-publish', '게시하기', `data-id="${e.id}"`, 'btn sm primary')
    + button('purge-event', '영구 삭제하기', `data-id="${e.id}"`, 'btn sm danger')
    + '</div></td></tr>',
  )
  return `<table class="admin-table"><thead><tr><th>이벤트</th><th>삭제일</th><th>관리</th></tr></thead><tbody>`
    + rows.join('')
    + (rows.length ? '' : emptyRow(3, '휴지통이 비어 있습니다.'))
    + '</tbody></table>'
}

const TABLES = { mine: tableMine, live: tableLive, trash: tableTrash }

/* ───────────────────────── 화면 ───────────────────────── */

function adminView() {
  const tab = currentTab()
  const slice = adminPageSlice(adminFilteredEvents())
  const active = state.db.events.filter((e) => !e.deletedAt)

  const tabs = TABS.map((t) =>
    button('admin-tab', t.label, `data-tab="${t.key}" aria-pressed="${tab === t.key}"`,
      tab === t.key ? 'active' : ''),
  ).join('')

  // 상태 필터는 '나의 이벤트'에서만 의미가 있다.
  const statusFilters = tab !== 'mine' ? '' :
    '<div class="admin-status-filters" role="group" aria-label="게시 상태 필터">'
    + [['all', '전체'], ['draft', '미게시'], ['live', '진행 중'], ['upcoming', '오픈 예정'], ['ended', '종료']]
        .map(([value, label]) =>
          button('admin-status', label, `data-status="${value}" aria-pressed="${ui.adminStatus === value}"`,
            ui.adminStatus === value ? 'active' : ''))
        .join('')
    + '</div>'

  return '<div class="container">'
    + '<div class="page-heading spread"><div><span class="eyebrow">EVENT WORKSPACE</span>'
    + '<h1>이벤트 관리</h1><p>아이디어를 다듬고, 준비된 이벤트를 게시하세요.</p></div>'
    + button('new', '새 이벤트 만들기 ' + icon('sparkle'), '', 'btn primary')
    + '</div>'
    + '<div class="metrics">'
    + metric('전체 이벤트', active.length, '모든 작업 공간', 'layers')
    + metric('진행 중', active.filter((e) => eventStatus(e) === 'live').length, '현재 게시된 이벤트 기준', 'bolt')
    + metric('게시 전 변경', active.filter((e) => e.versions.at(-1).v !== e.publishedVersion).length,
        '최신 저장 버전과 게시 버전이 다른 이벤트', 'edit')
    + '</div>'
    + '<section class="admin-list-section">'
    + '<div class="section-title spread"><div class="admin-list-tabs">' + tabs + '</div>'
    + '<label class="search">' + icon('search')
    + '<input id="admin-search" aria-label="관리자 이벤트 검색" placeholder="이벤트명, ID 검색" value="'
    + esc(ui.adminQuery) + '"></label></div>'
    + statusFilters
    + '<div class="admin-period-filter">'
    + '<label class="field">조회 시작<input id="admin-from" type="date" value="' + esc(ui.adminFrom || '') + '"></label>'
    + '<label class="field">조회 종료<input id="admin-to" type="date" value="' + esc(ui.adminTo || '') + '"></label>'
    + ((ui.adminFrom || ui.adminTo) ? button('clear-period', '기간 초기화', '', 'btn sm ghost') : '')
    + '</div>'
    + '<p id="admin-result-count" class="admin-result-count">' + slice.total + '개 이벤트</p>'
    + '<div id="admin-results" class="card table-wrap">' + TABLES[tab](slice.rows) + '</div>'
    + pager(slice.page, slice.pages)
    + '</section></div>'
}

export { adminView, adminFilteredEvents }
