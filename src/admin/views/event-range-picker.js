import { esc } from '@shared/dom.js'

const FIELDS = [
  { name: 'from', label: '시작일', createKey: 'start' },
  { name: 'to', label: '종료일', createKey: 'end' },
]
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const formatDate = (value) => value.replaceAll('-', '.')
const inputOf = (picker, name) => picker.querySelector(`[name="${name}"]`)
const readRange = (picker) => Object.fromEntries(
  FIELDS.map(({ name }) => [name, inputOf(picker, name).value]),
)

function syncRangeLabels(picker) {
  FIELDS.forEach(({ name }) => {
    const value = inputOf(picker, name).value
    const label = picker.querySelector(`[data-range-${name}-label]`)

    label.textContent = value ? formatDate(value) : '날짜 선택'
    label.classList.toggle('is-placeholder', !value)
  })
}

function applyRange(picker, { from, to }) {
  inputOf(picker, 'from').value = from
  inputOf(picker, 'to').value = to
  syncRangeLabels(picker)
  picker.dispatchEvent(new CustomEvent('event-range-change', {
    bubbles: true,
    detail: { start: from, end: to },
  }))
}

export function eventRangePicker(from = '', to = '', { creation = false } = {}) {
  const values = { from, to }
  const inputs = FIELDS.map(({ name, createKey }) => `
    <input type="hidden" name="${name}"
      ${creation ? `data-create="${createKey}"` : ''}
      value="${esc(values[name])}">
  `).join('')
  const fields = FIELDS.map(({ name, label }) => `
    <div class="event-range-field">
      <span class="event-range-field__label">${label}</span>
      <button type="button" class="event-range-trigger"
        data-range-open="${name}" aria-label="${label} 선택" aria-expanded="false">
        <span
          data-range-${name}-label
          class="${values[name] ? '' : 'is-placeholder'}"
        >
          ${values[name] ? esc(formatDate(values[name])) : '날짜 선택'}
        </span>
        <span class="event-range-trigger__arrow" aria-hidden="true">▾</span>
      </button>
    </div>
  `).join('')

  return `
    <fieldset class="event-filter-group${creation ? ' create-period' : ''}">
      <legend>${creation ? '이벤트 기간' : '조회 기간'}</legend>
      <div class="event-range-picker">
        ${inputs}
        <div class="event-range-fields">${fields}</div>
        <div class="event-range-calendar" role="group"
          aria-label="${creation ? '이벤트 기간' : '조회 기간'} 달력" hidden>
          <div class="event-range-calendar__header">
            <strong data-range-month></strong>
            <div class="event-range-calendar__nav">
              <button type="button" data-range-move="-1" aria-label="이전 달">‹</button>
              <button type="button" data-range-move="1" aria-label="다음 달">›</button>
            </div>
          </div>
          <div class="event-range-calendar__grid" data-range-grid></div>
          <div class="event-range-calendar__footer">
            <span data-range-hint aria-live="polite"></span>
            <button type="button" class="event-range-done" data-range-done>선택 완료</button>
          </div>
        </div>
      </div>
    </fieldset>
  `
}

export function initEventRangePicker() {
  const drafts = new WeakMap()

  const hide = (picker, restoreFocus = false) => {
    const active = picker.querySelector('[data-range-open][aria-expanded="true"]')
    picker.querySelector('.event-range-calendar').hidden = true
    picker.querySelectorAll('[data-range-open]').forEach((trigger) => {
      trigger.setAttribute('aria-expanded', 'false')
    })
    if (restoreFocus) (active || picker.querySelector('[data-range-open]'))?.focus()
  }

  const draw = (picker) => {
    const draft = drafts.get(picker)
    if (!draft) return
    const { year, month, from, to, selectingEnd } = draft
    const firstDay = new Date(year, month, 1).getDay()
    const lastDate = new Date(year, month + 1, 0).getDate()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const weekdays = WEEKDAYS.map(
      (day) => `<span class="event-range-weekday">${day}</span>`,
    ).join('')
    const blanks = '<span aria-hidden="true"></span>'.repeat(firstDay)
    const days = Array.from({ length: lastDate }, (_, index) => {
      const day = index + 1
      const value = `${prefix}-${String(day).padStart(2, '0')}`
      const classes = [
        'event-range-day',
        value === from && 'is-start',
        value === to && 'is-end',
        from && to && value > from && value < to && 'is-between',
      ].filter(Boolean).join(' ')
      return `
        <button type="button" class="${classes}" data-range-day="${value}"
          aria-label="${year}년 ${month + 1}월 ${day}일"
          aria-pressed="${value === from || value === to}"><span>${day}</span></button>
      `
    }).join('')

    picker.querySelector('[data-range-month]').textContent = `${year}년 ${month + 1}월`
    picker.querySelector('[data-range-grid]').innerHTML = weekdays + blanks + days
    picker.querySelector('[data-range-hint]').textContent =
      selectingEnd ? '종료일을 선택하세요' : '시작일을 선택하세요'
    picker.querySelector('[data-range-done]').disabled = !(from && to)
  }

  const open = (picker, trigger) => {
    const calendar = picker.querySelector('.event-range-calendar')
    const alreadyOpen = !calendar.hidden && trigger.getAttribute('aria-expanded') === 'true'
    hide(picker)
    if (alreadyOpen) return

    const { from, to } = readRange(picker)
    const initial = trigger.dataset.rangeOpen === 'to' ? to || from : from || to
    const today = new Date()
    drafts.set(picker, {
      year: initial ? Number(initial.slice(0, 4)) : today.getFullYear(),
      month: initial ? Number(initial.slice(5, 7)) - 1 : today.getMonth(),
      from,
      to,
      selectingEnd: Boolean(from && !to),
    })
    draw(picker)
    calendar.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    const path = event.composedPath()
    document.querySelectorAll('.event-range-picker').forEach((picker) => {
      if (!path.includes(picker)) hide(picker)
    })
    const picker = event.target.closest('.event-range-picker')
    if (!picker) return
    const trigger = event.target.closest('[data-range-open]')
    if (trigger) {
      open(picker, trigger)
      return
    }
    const draft = drafts.get(picker)
    if (!draft) return
    const move = event.target.closest('[data-range-move]')
    const day = event.target.closest('[data-range-day]')
    if (move) {
      const next = new Date(draft.year, draft.month + Number(move.dataset.rangeMove), 1)
      draft.year = next.getFullYear()
      draft.month = next.getMonth()
    } else if (day) {
      const value = day.dataset.rangeDay
      if (!draft.selectingEnd || value < draft.from) {
        draft.from = value
        draft.to = ''
        draft.selectingEnd = true
      } else {
        draft.to = value
        draft.selectingEnd = false
      }
      applyRange(picker, draft)
    } else if (event.target.closest('[data-range-done]')) {
      if (draft.from && draft.to) hide(picker, true)
      return
    } else {
      return
    }
    queueMicrotask(() => {
      if (picker.isConnected) draw(picker)
    })
  })

  document.addEventListener('toggle', (event) => {
    const details = event.target
    if (!details.matches?.('.event-filter') || details.open) return
    details.querySelectorAll('.event-range-picker').forEach((picker) => {
      hide(picker)
      queueMicrotask(() => {
        if (picker.isConnected) syncRangeLabels(picker)
      })
    })
  }, true)

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const calendar = document.querySelector('.event-range-calendar:not([hidden])')
    if (!calendar) return
    event.preventDefault()
    event.stopImmediatePropagation()
    hide(calendar.closest('.event-range-picker'), true)
  }, true)
}
