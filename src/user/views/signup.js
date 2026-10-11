/**
 * 회원가입. `POST /api/public/users/signup`
 *
 * 두 모드의 **입력 칸이 다르다** — 그래서 폼을 하나로 합치지 않았다.
 *
 *   서버 (VITE_API_AUTH=on)
 *     아이디 · 비밀번호 · 이름 · 이메일 · 휴대폰(선택)
 *     ★ 요금제를 안 받는다. 서버가 일부러 받지 않는다 — 가입자가 요금제를 골라
 *       멤버십 등급을 올리는 것을 막으려는 것이다. 모두 기본 요금제 · NORMAL 로 시작하고
 *       변경은 관리자만 한다. 고르게 두면 거짓말이 되므로 입력 자체를 없앴다.
 *     ★ 마케팅 수신 동의도 없다. 보낼 곳이 없어서, 두면 동의가 저장된 것처럼 보인다.
 *
 *   목업 (off)
 *     기존 체험 화면 그대로 — 요금제를 골라 등급 분기를 확인할 수 있다.
 *
 * ★ 서버 검증 실패는 400 COMMON400-0 하나로만 오고 **어느 칸이 틀렸는지 안 알려준다.**
 *   그래서 아래 RULES 로 화면이 먼저 검사한다. 규칙은 백엔드 SignUpRequest 와 맞춰 둔 것이다.
 */

import { esc } from '@shared/dom.js'
import { button } from '@shared/ui/controls.js'
import { PLANS } from '@shared/mock/fixtures.js'
import { USE_SERVER } from '@shared/repo.js'
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
  const f = (ui.signup ??= { loginId: '', name: '', email: '', phone: '', plan: 'BASIC', agree: false })
  return USE_SERVER ? serverSignupView(f) : mockSignupView(f)
}
