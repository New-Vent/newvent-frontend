/**
 * 회원가입 화면.
 * 서버 모드에서는 POST /api/public/users/signup으로 가입하고
 * 성공 후 로그인 화면으로 이동한다.
 * 요금제와 멤버십 등급은 서버에서 결정한다.
 */

import { esc } from '@shared/dom.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { button } from '@shared/ui/controls.js'
import { ui } from '@shared/state.js'

export function signupView() {
  const f = (ui.signup ??= {
    loginId: '',
    name: '',
    email: '',
    phone: '',
    agree: false,
  })

  return `
    <div class="container narrow">
      <div class="page-heading">
        <span class="eyebrow">WELCOME TO NEWVENT</span>
        <h1>회원가입</h1>
        <p>가입하면 이벤트에 참여하고 받은 혜택을 모아볼 수 있어요.</p>
      </div>

      <form id="signup-form" class="panel" novalidate>
        <div class="panel-body fields">
          <label class="field">아이디
            <span class="helper">영문·숫자·밑줄(_) 4~50자</span>
            <input data-signup="loginId" name="loginId"
                   required minlength="4" maxlength="50"
                   pattern="[A-Za-z0-9_]{4,50}"
                   autocomplete="username" placeholder="user01"
                   value="${esc(f.loginId)}">
          </label>

          <label class="field">비밀번호
            <span class="helper">8~100자</span>
            <input data-signup="password" name="password" type="password"
                   required minlength="8" maxlength="100"
                   autocomplete="new-password" placeholder="••••••••">
          </label>

          <label class="field">비밀번호 확인
            <input data-signup="password2" name="password2" type="password"
                   required maxlength="100"
                   autocomplete="new-password" placeholder="••••••••">
          </label>

          <label class="field">이름
            <input data-signup="name" name="name" required maxlength="50"
                   autocomplete="name" placeholder="홍길동"
                   value="${esc(f.name)}">
          </label>

          <label class="field">이메일
            <input data-signup="email" name="email" type="email"
                   required maxlength="100"
                   autocomplete="email" placeholder="name@example.com"
                   value="${esc(f.email)}">
          </label>

          <label class="field">휴대폰 번호 (선택)
            <span class="helper">최대 20자</span>
            <input data-signup="phone" name="phone" type="tel" maxlength="20"
                   autocomplete="tel" placeholder="01012345678"
                   value="${esc(f.phone)}">
          </label>

          ${!AUTH_ENABLED ? `
            <label class="field row" style="align-items:center;gap:8px">
              <input data-signup="agree" name="agree" type="checkbox"
                     ${f.agree ? 'checked' : ''}>
              <span>
                이벤트·혜택 안내 수신에 동의합니다
                <span class="helper">(선택)</span>
              </span>
            </label>
          ` : ''}

          <p id="signup-error" class="create-error" role="alert"></p>

          <div class="create-actions">
            ${button('route', '이미 계정이 있어요', 'data-route="login"')}
            <button type="submit" class="btn primary">가입하기</button>
          </div>
        </div>
      </form>
    </div>
  `
}