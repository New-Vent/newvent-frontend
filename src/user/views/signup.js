/**
 * 회원가입 화면.
 *
 * 서버 모드에서는 POST /api/public/users/signup 으로 가입하고 성공하면
 * 로그인 화면으로 보낸다 — 응답이 토큰이 아니라 만들어진 회원이라서,
 * 가입해도 로그인 상태가 되지 않는다.
 *
 * ★ 요금제는 받지 않는다. 서버가 일부러 안 받는다(보내도 무시) — 가입자가
 *   요금제를 골라 멤버십 등급을 올리는 것을 막으려는 것이다. 모두 기본
 *   요금제 · NORMAL 로 시작하고 변경은 관리자만 한다.
 *
 * ★ 서버 검증 실패는 400 COMMON400-0 하나로만 오고 **어느 칸이 틀렸는지
 *   안 알려준다.** 그래서 아래 RULES 로 화면이 먼저 검사한다.
 *   규칙은 백엔드 SignUpRequest 와 맞춰 둔 것이다.
 */

import { esc } from '@shared/dom.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { button } from '@shared/ui/controls.js'
import { ui } from '@shared/state.js'

/**
 * 백엔드 `SignUpRequest` 와 1:1 로 맞춘 검사 규칙.
 * 순서대로 보고 처음 걸리는 것을 알려준다.
 */
const RULES = [
  { key: 'loginId', test: (v) => /^[A-Za-z0-9_]{4,50}$/.test(v),
    message: '아이디는 영문·숫자·밑줄(_)만 써서 4~50자로 입력해주세요.' },
  { key: 'password', test: (v) => v.length >= 8 && v.length <= 100,
    message: '비밀번호는 8자 이상 100자 이하로 입력해주세요.' },
  { key: 'password2', test: (v, all) => v === all.password,
    message: '비밀번호가 서로 다릅니다.' },
  { key: 'name', test: (v) => v.length >= 1 && v.length <= 50,
    message: '이름을 50자 이내로 입력해주세요.' },
  { key: 'email', test: (v) => v.length <= 100 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    message: '이메일 형식을 확인해주세요.' },
  // 휴대폰은 선택이다 — 서버도 @NotBlank 가 없다. 적었을 때만 길이를 본다.
  { key: 'phone', test: (v) => v.length <= 20, message: '휴대폰 번호는 20자 이내로 입력해주세요.' },
]

/** @returns {{key:string,message:string}|null} 처음 걸린 규칙 */
export function firstSignupError(values) {
  for (const r of RULES) if (!r.test(values[r.key] ?? '', values)) return r
  return null
}

export function signupView() {
  const f = (ui.signup ??= {
    loginId: '',
    name: '',
    email: '',
    phone: '',
    agree: false,
  })

  return `
    <div class="user-signup-page">
      <section class="user-signup-card" aria-labelledby="user-signup-title">
        <img
          class="user-auth-logo"
          src="/assets/newvent-logo.png"
          alt="NEWVENT"
        >
      <div class="page-heading">
        <h1 id="user-signup-title">회원가입</h1>
        <p>가입하면 이벤트에 참여하고 받은 혜택을 모아볼 수 있어요.</p>
      </div>

      <form id="signup-form" class="user-signup-form" novalidate>
        <div class="user-signup-fields">
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

          <div class="user-signup-actions">
            <button type="submit" class="btn primary wide">
              가입하기
            </button>
            <p class="user-signup-login">
              이미 계정이 있으신가요?
              ${button('route', '로그인', 'data-route="login"', 'user-login-link')}
            </p>
          </div>
        </div>
      </form>
        ${button(
          'route',
          '이벤트 둘러보기 <span aria-hidden="true">›</span>',
          'data-route="home"',
          'user-login-browse',
        )}
      </section>
    </div>
  `
}