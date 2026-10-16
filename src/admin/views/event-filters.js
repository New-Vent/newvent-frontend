import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { ui } from '@shared/state.js'
import { DEMO_DATE } from '@shared/constants.js'
import { eventRangePicker, initEventRangePicker } from './event-range-picker.js'

const PUBLISH = [
  ['all', '전체'], ['draft', '미게시'],
  ['published', '게시중'], ['ended', '게시 종료'],
]
const PERIOD = [
  ['all', '전체'], ['upcoming', '시작 전'],
  ['ongoing', '진행 중'], ['expired', '기간 만료'],
]

export function matchesAdminEventFilters(event, serverMode) {
  if (ui.adminTab === 'trash') return true
  const snapshot = serverMode ? null : event.versions.at(-1).snapshot
  const publication = serverMode
    ? ({ DRAFT: 'draft', PUBLISHED: 'published', ENDED: 'ended' }[event.status])
    : event.endedAt ? 'ended' : event.publishedVersion ? 'published' : 'draft'
  const start = serverMode ? event.startAt : snapshot.start
  const end = serverMode ? event.endAt : snapshot.end
  const now = serverMode ? Date.now() : Date.parse(DEMO_DATE + 'T12:00:00+09:00')
  const startTime = Date.parse(serverMode ? start : start + 'T00:00:00+09:00')
  const endTime = Date.parse(serverMode ? end : end + 'T23:59:59.999+09:00')
  const period = !Number.isFinite(startTime) || !Number.isFinite(endTime)
    ? 'unknown' : now < startTime ? 'upcoming' : now > endTime ? 'expired' : 'ongoing'

  return (!(ui.adminPublishStatus && ui.adminPublishStatus !== 'all')
      || publication === ui.adminPublishStatus)
    && (!(ui.adminPeriodStatus && ui.adminPeriodStatus !== 'all')
      || period === ui.adminPeriodStatus)
}

function choices(name, title, options, value) {
  return `<fieldset class="event-filter-group">
    <legend>${title}</legend>
    <div class="event-filter-options">
      ${options.map(([key, label]) => `
        <label class="event-filter-option">
          <input type="radio" name="${name}" value="${key}"
            ${key === (value || 'all') ? 'checked' : ''}>
          <span>${label}</span>
        </label>`).join('')}
    </div>
  </fieldset>`
}

function popup(label, contents, active = false) {
  return `
    <details class="event-filter${active ? ' is-active' : ''}">
      <summary
        aria-label="${esc(label)}"
        title="${esc(label)}"
      >
        ${icon('filter')}
      </summary>

      <form class="event-filter-popup" data-event-filter-form>
        ${contents}

        <p class="event-filter-error" role="alert"></p>

        <div class="event-filter-actions">
          <button type="button" data-event-filter-cancel>
            취소
          </button>

          <button type="submit" class="event-filter-apply">
            적용하기
          </button>
        </div>
      </form>
    </details>
  `
}

export function adminFilterToolbar(tab) {
  const trash = tab === 'trash'

  const publish = trash ? '' : choices('publish', '게시 상태', PUBLISH, ui.adminPublishStatus)

  const period = trash ? '' : choices('period', '기간 상태', PERIOD, ui.adminPeriodStatus)

  const active = Boolean(
    (!trash && ui.adminPublishStatus && ui.adminPublishStatus !== 'all')
    || (!trash && ui.adminPeriodStatus && ui.adminPeriodStatus !== 'all')
    || ui.adminFrom
    || ui.adminTo
  )

  const eventTab = ui.adminPublishStatus === 'published' ? 'live' : 'mine'

  const contents = `
    <div class="event-filter-header">
        <h3>이벤트 필터</h3>
        <button
        type="button"
        class="event-filter-reset"
        data-event-filter-reset
        >초기화</button>
    </div>

    ${publish}
    ${period}
    ${eventRangePicker(ui.adminFrom || '', ui.adminTo || '')}
  `

  return `
    <div class="event-list-toolbar">
      <nav class="event-list-tabs" aria-label="이벤트 보관함">
        <button
            type="button"
            class="event-list-tab"
            data-act="admin-tab"
            data-tab="${eventTab}"
            aria-pressed="${!trash}"
        >
            <span>이벤트</span>
        </button>

        <button
            type="button"
            class="event-list-tab"
            data-act="admin-tab"
            data-tab="trash"
            aria-pressed="${trash}"
        >
            <span>휴지통</span>
        </button>
      </nav>

      <label class="search event-admin-search">
        ${icon('search')}
        <input
          id="admin-search"
          aria-label="관리자 이벤트 검색"
          placeholder="이벤트명, ID 검색"
          value="${esc(ui.adminQuery)}"
        >
      </label>

      <div class="event-list-filters">
        ${popup('전체 필터', contents, active)}
      </div>
    </div>
  `
}

export function initAdminEventFilters(render) {
  initEventRangePicker()
  const close = (details, focus = false) => {
    details.querySelector('form')?.reset()
    details.open = false

    if (focus) details.querySelector('summary')?.focus()
  }

  document.addEventListener('toggle', (event) => {
    const details = event.target

    if (!details.matches?.('.event-filter')) return

    if (!details.open) {
      details.querySelector('form')?.reset()
      return
    }

    document.querySelectorAll('.event-filter[open]').forEach((other) => {
      if (other !== details) close(other)
    })
  }, true)

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return

    const clickPath = event.composedPath()

    document.querySelectorAll('.event-filter[open]').forEach((details) => {
      if (!clickPath.includes(details)) close(details)
    })

    const cancel = event.target.closest('[data-event-filter-cancel]')

    if (cancel) close(cancel.closest('details'), true)

    if (event.target.closest('[data-event-filter-reset]')) {
      ui.adminPublishStatus = 'all'
      ui.adminPeriodStatus = 'all'
      ui.adminFrom = ''
      ui.adminTo = ''
      ui.adminPage = 1

      if (ui.adminTab !== 'trash') ui.adminTab = 'mine'

      render()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return

    document.querySelectorAll('.event-filter[open]').forEach((details) => {
      close(details, true)
    })
  })

  document.addEventListener('submit', (event) => {
    const form = event.target

    if (!form.matches('[data-event-filter-form]')) return

    event.preventDefault()

    const data = new FormData(form)
    const from = data.has('from')
      ? String(data.get('from'))
      : ui.adminFrom || ''
    const to = data.has('to')
      ? String(data.get('to'))
      : ui.adminTo || ''

    if (from && to && from > to) {
      form.querySelector('.event-filter-error').textContent =
        '종료일은 시작일과 같거나 이후여야 합니다.'
      return
    }

    if (data.has('publish')) {
      ui.adminPublishStatus = String(data.get('publish'))
    }

    if (data.has('period')) {
      ui.adminPeriodStatus = String(data.get('period'))
    }

    ui.adminFrom = from
    ui.adminTo = to
    ui.adminPage = 1

    // 게시 상태에 따라 목록 렌더링 모드를 전환한다.
    if (ui.adminTab !== 'trash') {
      ui.adminTab = ui.adminPublishStatus === 'published'
        ? 'live'
        : 'mine'
    }

    const details = form.closest('details')
    const index = [...document.querySelectorAll('.event-filter')]
      .indexOf(details)

    render()

    document.querySelectorAll('.event-filter > summary')[index]?.focus()
  })
}