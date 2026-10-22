/** 로그인. 원본: loginView */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { loginForm } from '@shared/login-form.js'
import { ui } from '@shared/state.js'

function loginView(title = '나를 위한 혜택을 만나보세요') {
  let content

  if (AUTH_ENABLED) {
    // 가입 직후 전달된 아이디를 한 번만 사용한다.
    const hint = ui.loginHint || ''
    ui.loginHint = null

    content = `
      <h1 id="user-login-title">${esc(title)}</h1>
      <p class="user-login-description">
        다양한 이벤트에 참여하고, 받은 혜택을 한곳에서 확인하세요.
      </p>
      ${loginForm(hint)}
      <p class="user-login-signup">
        아직 회원이 아니신가요?
        ${button('route', '회원가입', 'data-route="signup"', 'user-login-link')}
      </p>
    `
  } else {
    content = `
      <h1 id="user-login-title">${esc(title)}</h1>
      <p class="user-login-description">
        프로토타입에서 체험할 역할을 선택해주세요.
      </p>
      <div class="user-login-demo">
        ${button('role', icon('user') + '사용자로 체험하기', 'data-role="user"', 'btn primary wide')}
        ${button('role', icon('layers') + '관리자로 체험하기', 'data-role="admin"', 'btn wide')}
      </div>
      <p class="user-login-signup">
        실제 계정 없이 화면과 동작을 확인할 수 있습니다.
      </p>
    `
  }

  return `
    <div class="user-login-page">
      <section class="user-login-card" aria-labelledby="user-login-title">
        <div class="user-login-content">
          <img
            class="user-auth-logo"
            src="/assets/newvent-logo.png"
            alt="NEWVENT"
          >
          ${content}
          ${button(
            'route',
            '이벤트 둘러보기 <span aria-hidden="true">›</span>',
            'data-route="home"',
            'user-login-browse',
          )}
        </div>
      </section>
    </div>
  `
}

export { loginView }
