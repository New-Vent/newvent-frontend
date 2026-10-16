import { esc } from '@shared/dom.js'

const formatDate = (value) => value.replaceAll('-', '.')

function syncRangeLabels(picker) {
  const from = picker.querySelector('[name="from"]').value
  const to = picker.querySelector('[name="to"]').value

  picker.querySelector('[data-range-from-label]').textContent =
    from ? formatDate(from) : '날짜 선택'

  picker.querySelector('[data-range-to-label]').textContent =
    to ? formatDate(to) : '날짜 선택'
}

export function eventRangePicker(from = '', to = '') {
  return `
    <fieldset class="event-filter-group">
      <legend>조회 기간</legend>

      <div class="event-range-picker">
        <input type="hidden" name="from" value="${esc(from)}">
        <input type="hidden" name="to" value="${esc(to)}">

        <div class="event-range-fields">
            <div class="event-range-field">
                <span class="event-range-field__label">시작일</span>

                <button
                type="button"
                class="event-range-trigger"
                data-range-open="from"
                aria-label="시작일 선택"
                aria-expanded="false"
                >
                <span data-range-from-label>
                    ${from ? formatDate(from) : '날짜 선택'}
                </span>
                <span class="event-range-trigger__arrow" aria-hidden="true">▾</span>
                </button>
            </div>

            <div class="event-range-field">
                <span class="event-range-field__label">종료일</span>

                <button
                type="button"
                class="event-range-trigger"
                data-range-open="to"
                aria-label="종료일 선택"
                aria-expanded="false"
                >
                <span data-range-to-label>
                    ${to ? formatDate(to) : '날짜 선택'}
                </span>
                <span class="event-range-trigger__arrow" aria-hidden="true">▾</span>
                </button>
            </div>
        </div>

        <div
          class="event-range-calendar"
          role="group"
          aria-label="조회 기간 달력"
          hidden
        >
          <div class="event-range-calendar__header">
            <strong data-range-month></strong>

            <div class="event-range-calendar__nav">
              <button
                type="button"
                data-range-move="-1"
                aria-label="이전 달"
              >‹</button>

              <button
                type="button"
                data-range-move="1"
                aria-label="다음 달"
              >›</button>
            </div>
          </div>

          <div class="event-range-calendar__grid" data-range-grid></div>

          <div class="event-range-calendar__footer">
            <span data-range-hint aria-live="polite"></span>

            <button
              type="button"
              class="event-range-done"
              data-range-done
            >선택 완료</button>
          </div>
        </div>
      </div>
    </fieldset>
  `
}

export function initEventRangePicker() {
  const drafts = new WeakMap()

  const hide = (picker, focus = false) => {
    picker.querySelector('.event-range-calendar').hidden = true

    const activeTrigger = picker.querySelector('[data-range-open][aria-expanded="true"]')
    picker.querySelectorAll('[data-range-open]').forEach((trigger) => { 
      trigger.setAttribute('aria-expanded', 'false') 
    })

    if (focus) {
      const trigger = activeTrigger || picker.querySelector('[data-range-open]')
      trigger.focus()
    }
  }

  const draw = (picker) => {
    const draft = drafts.get(picker)
    const { year, month, from, to } = draft

    picker.querySelector('[data-range-month]').textContent =
      `${year}년 ${month + 1}월`

    const firstDay = new Date(year, month, 1).getDay()
    const lastDate = new Date(year, month + 1, 0).getDate()

    let html = ['일', '월', '화', '수', '목', '금', '토']
      .map((day) => `<span class="event-range-weekday">${day}</span>`)
      .join('')

    html += '<span aria-hidden="true"></span>'.repeat(firstDay)

    for (let day = 1; day <= lastDate; day++) {
      const value =
        `${year}-${String(month + 1).padStart(2, '0')}`
        + `-${String(day).padStart(2, '0')}`

      const classes = [
        'event-range-day',
        value === from ? 'is-start' : '',
        value === to ? 'is-end' : '',
        from && to && value > from && value < to ? 'is-between' : '',
      ].filter(Boolean).join(' ')

      html += `
        <button
          type="button"
          class="${classes}"
          data-range-day="${value}"
          aria-label="${year}년 ${month + 1}월 ${day}일"
          aria-pressed="${value === from || value === to}"
        ><span>${day}</span></button>
      `
    }

    picker.querySelector('[data-range-grid]').innerHTML = html

    picker.querySelector('[data-range-hint]').textContent =
      draft.selectingEnd ? '종료일을 선택하세요' : '시작일을 선택하세요'

    picker.querySelector('[data-range-done]').disabled = !(from && to)
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return

    const clickPath = event.composedPath()

    // 달력 밖을 누르면 달력만 닫는다.
    document.querySelectorAll('.event-range-picker').forEach((picker) => {
      if (!clickPath.includes(picker)) hide(picker)
    })

    const picker = event.target.closest('.event-range-picker')
    if (!picker) return

    const openButton = event.target.closest('[data-range-open]')

    if (openButton) {
      const calendar = picker.querySelector('.event-range-calendar')

      if (!calendar.hidden && openButton.getAttribute('aria-expanded') === 'true') {
        hide(picker)
        return
      }

      hide(picker)

      const from = picker.querySelector('[name="from"]').value
      const to = picker.querySelector('[name="to"]').value
      const field = openButton.dataset.rangeOpen
      const initial = field === 'to' ? to || from : from || to
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
      openButton.setAttribute('aria-expanded', 'true')
      return
    }

    const draft = drafts.get(picker)
    if (!draft) return

    const move = event.target.closest('[data-range-move]')

    if (move) {
      const next = new Date(
        draft.year,
        draft.month + Number(move.dataset.rangeMove),
        1,
      )

      draft.year = next.getFullYear()
      draft.month = next.getMonth()

      queueMicrotask(() => draw(picker))
      return
    }

    const day = event.target.closest('[data-range-day]')

    if (day) {
      const value = day.dataset.rangeDay

      if (!draft.selectingEnd || value < draft.from) {
        // 첫 클릭: 시작일 선택
        draft.from = value
        draft.to = ''
        draft.selectingEnd = true
      } else {
        // 두 번째 클릭: 종료일 선택
        draft.to = value
        draft.selectingEnd = false
      }

      // 선택한 날짜를 각각의 입력칸에 자동 표시
      picker.querySelector('[name="from"]').value = draft.from
      picker.querySelector('[name="to"]').value = draft.to

      syncRangeLabels(picker)

      queueMicrotask(() => draw(picker))
      return
    }

    if (event.target.closest('[data-range-done]')) {
      if (!draft.from || !draft.to) return
      hide(picker, true)
    }
  })

  // 바깥 필터가 닫히면 내부 달력도 닫는다.
  document.addEventListener('toggle', (event) => {
    const details = event.target

    if (!details.matches?.('.event-filter') || details.open) return

    details.querySelectorAll('.event-range-picker').forEach((picker) => {
      hide(picker)

      // 기존 필터의 form.reset() 처리가 끝난 다음 표시를 맞춘다.
      queueMicrotask(() => {
        if (!picker.isConnected) return

        syncRangeLabels(picker)
      })
    })
  }, true)

  // 첫 Escape는 달력만 닫고, 다음 Escape는 기존 필터를 닫는다.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return

    const openCalendar = document.querySelector(
      '.event-range-calendar:not([hidden])',
    )

    if (!openCalendar) return

    event.preventDefault()
    event.stopImmediatePropagation()

    hide(openCalendar.closest('.event-range-picker'), true)
  }, true)
}