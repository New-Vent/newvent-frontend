import { esc } from '@shared/dom.js'
import {
  eventRangePicker,
  initEventRangePicker,
} from './event-range-picker.js'

export function eventDatetimeField(
  key,
  label,
  value = '',
  { extra = '', helper = '' } = {},
) {
  initEventRangePicker()

  const [date = '', originalTime = ''] = value.split('T')
  const time = originalTime.slice(0, 5)
  const disabled = /\bdisabled\b/.test(extra)

  const template = document.createElement('template')

  template.innerHTML = eventRangePicker(date, date, {
    creation: true,
    startTime: time,
    endTime: time,
  })

  const fieldset = template.content.querySelector('fieldset')
  const picker = fieldset.querySelector('.event-range-picker')
  const fields = picker.querySelectorAll('.event-range-field')

  // 생성 화면의 상태 변경과 연결되지 않도록 분리한다.
  fieldset.querySelectorAll('[data-create]').forEach((input) => {
    input.removeAttribute('data-create')
  })

  fieldset.disabled = disabled
  fieldset.querySelector('legend').textContent = label

  picker.dataset.rangeSingle = 'true'
  picker.querySelector('.event-range-calendar')
    .setAttribute('aria-label', `${label} 달력`)

  // 단일 날짜 입력이므로 종료일 영역은 제거한다.
  // 달력 내부에서 사용하는 hidden to 값은 유지한다.
  fields[1].remove()
  fields[0].querySelector('.event-range-field__label').remove()

  const dateButton = picker.querySelector('[data-range-open]')
  dateButton.setAttribute('aria-label', `${label} 날짜 선택`)

  const timeButton = picker.querySelector('[data-time-open]')
  timeButton.setAttribute('aria-label', `${label} 시간 선택`)

  if (helper) {
    const help = document.createElement('p')
    help.className = 'helper admin-datetime-helper'
    help.textContent = helper
    fieldset.querySelector('legend').after(help)
  }

  return `
    <div
      class="admin-datetime-widget"
      data-datetime-field
      data-original-time="${esc(originalTime)}"
    >
      ${fieldset.outerHTML}
      <input
        type="hidden"
        name="${esc(key)}"
        data-pconf="${esc(key)}"
        data-datetime-value
        value="${esc(value)}"
      >
    </div>
  `
}

export function syncDatetimeFields(root) {
  root.querySelectorAll('[data-datetime-field]').forEach(syncField)
}

function syncField(field) {
  const date = field.querySelector('[name="from"]').value
  const time = field.querySelector('[name="startTime"]').value
  const originalTime = field.dataset.originalTime || ''

  // 시·분이 그대로라면 기존 초 단위를 유지한다.
  const fullTime = time === originalTime.slice(0, 5)
    ? originalTime
    : time ? `${time}:00` : ''

  const output = field.querySelector('[data-datetime-value]')
  const value = date && fullTime ? `${date}T${fullTime}` : ''

  if (output.value === value) return

  output.value = value
  output.dispatchEvent(new Event('change', { bubbles: true }))
}

// 날짜 선택 후 저장할 값을 갱신한다.
document.addEventListener('event-range-change', (event) => {
  const field = event.target.closest?.('[data-datetime-field]')
  if (field) syncField(field)
}, true)

// 시간 선택창에서 확인을 누르면 저장할 값을 갱신한다.
document.addEventListener('input', (event) => {
  const field = event.target.closest?.('[data-datetime-field]')
  if (field) syncField(field)
}, true)