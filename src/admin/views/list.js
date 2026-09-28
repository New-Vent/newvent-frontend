import { html } from '@shared/dom.js'

/**
 * 이벤트 관리 목록.
 * 옮겨올 원본: adminView · adminTable · adminFilteredEvents
 *
 * 배지는 computed_status(게시예정·게시중·게시종료·임시저장),
 * 필터는 publish_status 를 쓴다.
 */
export function listView() {
  return html`<div class="container"><h1>이벤트 관리</h1><p>TODO: adminView 이식</p></div>`
}
