import { html } from '@shared/dom.js'

/**
 * 관리자 로그인. 사용자 로그인과 엔드포인트·쿠키가 다르다.
 *   POST /api/admin/auth/login → Refresh 는 nv_admin_rt (Path=/api/admin/auth)
 */
export function loginView() {
  return html`<div class="container"><h1>관리자 로그인</h1><p>TODO: loginView 이식</p></div>`
}
