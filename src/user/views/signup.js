/**
  * 회원가입 화면.
 * 서버 모드에서는 POST /api/public/users/signup으로 가입하고
 * 성공 후 로그인 화면으로 이동한다.
<<<<<<< HEAD
 * 
import { esc } from '@shared/dom.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { button } from '@shared/ui/controls.js'
import { PLANS } from '@shared/mock/fixtures.js'
import { USE_SERVER } from '@shared/repo.js'
=======
 * 요금제와 멤버십 등급은 서버에서 결정한다.
 */

import { esc } from '@shared/dom.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { button } from '@shared/ui/controls.js'
>>>>>>> 89ca09c (fix: 변경된 회원가입 정책에 맞춰 요금제 선택 제거)
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

const heading =
  '<div class="page-heading"><span class="eyebrow">WELCOME TO NEWVENT</span>'
  + '<h1>회원가입</h1>'
  + '<p>가입하면 이벤트에 참여하고 받은 혜택을 모아볼 수 있어요.</p></div>'

const actions =
  '<p id="signup-error" class="create-error" role="alert"></p>'
  + '<div class="create-actions">'
  + button('route', '이미 계정이 있어요', 'data-route="login"')
  + '<button type="submit" class="btn primary">가입하기</button></div>'

/* ───────────────────────── 서버 모드 ───────────────────────── */

function serverSignupView(f) {
  return '<div class="container narrow">' + heading
    + '<form id="signup-form" class="panel" novalidate><div class="panel-body fields">'

    + '<label class="field">아이디'
    + '<span class="helper">영문·숫자·밑줄(_) 4~50자. 대소문자를 구분해 저장하니 로그인할 때 그대로 입력해주세요.</span>'
    + '<input data-signup="loginId" name="loginId" required maxlength="50" autocomplete="username"'
    + ' placeholder="user_01" value="' + esc(f.loginId) + '"></label>'

    + '<label class="field">비밀번호<span class="helper">8자 이상</span>'
    + '<input data-signup="password" name="password" type="password" required maxlength="100"'
    + ' autocomplete="new-password" placeholder="••••••••"></label>'

    + '<label class="field">비밀번호 확인'
    + '<input data-signup="password2" name="password2" type="password" required maxlength="100"'
    + ' autocomplete="new-password" placeholder="••••••••"></label>'

    + '<label class="field">이름'
    + '<input data-signup="name" name="name" required maxlength="50" autocomplete="name"'
    + ' placeholder="홍길동" value="' + esc(f.name) + '"></label>'

    + '<label class="field">이메일'
    + '<input data-signup="email" name="email" type="email" required maxlength="100" autocomplete="email"'
    + ' placeholder="name@example.com" value="' + esc(f.email) + '"></label>'

    + '<label class="field">휴대폰 번호 <span class="helper">선택 · 20자 이내</span>'
    + '<input data-signup="phone" name="phone" maxlength="20" inputmode="tel" autocomplete="tel"'
    + ' placeholder="010-1234-5678" value="' + esc(f.phone) + '"></label>'

    + '<p class="review-note">요금제는 가입할 때 고르지 않아요. 모두 기본 요금제로 시작하고, '
    + '멤버십 등급은 이용 실적에 따라 정해집니다.</p>'

    + actions + '</div></form></div>'
}

/* ───────────────────────── 목업 모드 ───────────────────────── */

function planCard(p, selected) {
  return '<button type="button" class="plan-card ' + (p.code === selected ? 'selected' : '') + '"'
    + ' data-act="signup-plan" data-plan="' + p.code + '" aria-pressed="' + (p.code === selected) + '">'
    + '<strong>' + esc(p.name) + '</strong>'
    + '<span class="plan-price">' + esc(p.price) + '</span>'
    + '<span class="plan-meta">데이터 ' + esc(p.data) + ' · ' + esc(p.grade) + ' 등급</span>'
    + '<span class="plan-desc">' + esc(p.desc) + '</span></button>'
}

function mockSignupView(f) {
  return '<div class="container narrow">' + heading
    + '<form id="signup-form" class="panel" novalidate><div class="panel-body fields">'
    + '<label class="field">아이디<span class="helper">영문·숫자·밑줄(_) 4~50자</span>'
    + '<input data-signup="loginId" name="loginId" required maxlength="50" autocomplete="username"'
    + ' placeholder="user_01" value="' + esc(f.loginId) + '"></label>'
    + '<label class="field">비밀번호<span class="helper">8자 이상</span>'
    + '<input data-signup="password" name="password" type="password" required maxlength="100"'
    + ' autocomplete="new-password" placeholder="••••••••"></label>'
    + '<label class="field">비밀번호 확인'
    + '<input data-signup="password2" name="password2" type="password" required maxlength="100"'
    + ' autocomplete="new-password" placeholder="••••••••"></label>'
    + '<label class="field">이름<input data-signup="name" name="name" required maxlength="50"'
    + ' autocomplete="name" placeholder="홍길동" value="' + esc(f.name) + '"></label>'
    + '<label class="field">이메일<input data-signup="email" name="email" type="email" required maxlength="100"'
    + ' autocomplete="email" placeholder="name@example.com" value="' + esc(f.email) + '"></label>'
    + '<label class="field">휴대폰 번호 <span class="helper">선택</span>'
    + '<input data-signup="phone" name="phone" maxlength="20" inputmode="tel" autocomplete="tel"'
    + ' placeholder="010-1234-5678" value="' + esc(f.phone) + '"></label>'
    + '<div class="field"><span>요금제</span>'
    + '<span class="helper">체험용이에요. 실제 가입에서는 요금제를 고르지 않습니다.</span>'
    + '<div class="plan-grid">' + PLANS.map((p) => planCard(p, f.plan)).join('') + '</div></div>'
    + '<label class="field row" style="align-items:center;gap:8px">'
    + '<input data-signup="agree" name="agree" type="checkbox" ' + (f.agree ? 'checked' : '') + '>'
    + '<span>이벤트·혜택 안내 수신에 동의합니다 <span class="helper">(선택)</span></span></label>'
    + actions + '</div></form></div>'
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