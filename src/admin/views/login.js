/**
 * 관리자 로그인.
 * 사용자와 엔드포인트·쿠키가 다르다 — Refresh 는 nv_admin_rt (Path=/api/admin/auth).
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { loginForm } from '@shared/login-form.js'

function loginView(title = 'NewVent에 오신 것을 환영해요') {
  const content = AUTH_ENABLED
    ? `
      <h1 id="admin-login-title">관리자 로그인</h1>
      <p class="admin-login-description">
        관리자 계정으로 로그인해주세요.
      </p>
      ${loginForm()}
    `
    : `
      <h1 id="admin-login-title">${esc(title)}</h1>
      <p class="admin-login-description">
        프로토타입에서 체험할 역할을 선택해주세요.
      </p>
      <div class="admin-login-demo">
        ${button('role', icon('user') + '사용자로 체험하기', 'data-role="user"', 'btn primary wide')}
        ${button('role', icon('layers') + '관리자로 체험하기', 'data-role="admin"', 'btn wide')}
      </div>
      <p class="admin-login-helper">
        실제 계정 없이 화면과 동작을 확인할 수 있습니다.
      </p>
    `

  return `
    <div class="admin-login-page">
      <div class="admin-login-art" aria-hidden="true">
        <img
          class="admin-login-art-bg"
          src="/assets/admin-login-bg.png"
          alt=""
        >

        <div class="admin-laptop-glow"></div>

        <img
          class="admin-login-blink"
          src="/assets/admin-login-blink.png"
          alt=""
        >

        <img
          class="admin-login-balloon"
          src="/assets/admin-login-balloon.png"
          alt=""
        >

        <span class="admin-decoration admin-decoration-star">
          <svg viewBox="70 140 570 580" focusable="false">
            <image
              href="/assets/admin-login-decorations.png"
              width="1280"
              height="1280"
            />
          </svg>
        </span>

        <span class="admin-decoration admin-decoration-ribbon">
          <svg viewBox="720 40 510 710" focusable="false">
            <image
              href="/assets/admin-login-decorations.png"
              width="1280"
              height="1280"
            />
          </svg>
        </span>

        <span class="admin-decoration admin-decoration-confetti-blue">
          <svg viewBox="90 830 310 350" focusable="false">
            <image
              href="/assets/admin-login-decorations.png"
              width="1280"
              height="1280"
            />
          </svg>
        </span>

        <span class="admin-decoration admin-decoration-confetti-yellow">
          <svg viewBox="490 820 310 360" focusable="false">
            <image
              href="/assets/admin-login-decorations.png"
              width="1280"
              height="1280"
            />
          </svg>
        </span>

        <span class="admin-decoration admin-decoration-confetti-right">
          <svg viewBox="880 840 320 340" focusable="false">
            <image
              href="/assets/admin-login-decorations.png"
              width="1280"
              height="1280"
            />
          </svg>
        </span>
      </div>

      <section
        class="admin-login-card"
        aria-labelledby="admin-login-title"
      >
        <img
          class="admin-login-logo"
          src="/assets/newvent-logo.png"
          alt="NEWVENT"
        >
        <span class="admin-login-eyebrow">ADMIN WORKSPACE</span>
        ${content}
      </section>
    </div>
  `
}

export { loginView }