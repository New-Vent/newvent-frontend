import { html } from '@shared/dom.js'

export function notFoundView() {
  return html`
    <div class="container empty">
      <h3>페이지를 찾을 수 없습니다</h3>
      <a data-link href="/">이벤트 관리로</a>
    </div>
  `
}
