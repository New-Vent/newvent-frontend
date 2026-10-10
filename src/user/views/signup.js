/**
 * 회원가입 화면.
 * 서버 모드에서는 POST /api/public/users/signup으로 가입하고
 * 성공 후 로그인 화면으로 이동한다.
 */

import { esc } from '@shared/dom.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { button } from '@shared/ui/controls.js'
import { PLANS } from '@shared/mock/fixtures.js'
import { ui } from '@shared/state.js'

export function signupView() {
  const f = (ui.signup ??= {
    loginId: '',
    name: '',
    email: '',
    phone: '',
    plan: 'BASIC',
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
            <span class="helper">최대 50자</span>
            <input data-signup="loginId" name="loginId" required maxlength="50"
                   autocomplete="username" placeholder="user01" value="${esc(f.loginId)}">
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
                   autocomplete="name" placeholder="홍길동" value="${esc(f.name)}">
          </label>

          <label class="field">이메일
            <input data-signup="email" name="email" type="email"
                   required maxlength="100"
                   autocomplete="email" placeholder="name@example.com" value="${esc(f.email)}">
          </label>

          <label class="field">휴대폰 번호 (선택)
            <span class="helper">최대 20자</span>
            <input data-signup="phone" name="phone" type="tel" maxlength="20"
                   autocomplete="tel" placeholder="01012345678" value="${esc(f.phone)}">
          </label>

          <div class="field">
            <span>요금제</span>
            <span class="helper">
              가입 후에도 변경할 수 있습니다.
              멤버십 등급은 요금제와 가입 기간에 따라 결정됩니다.
            </span>
            <div class="plan-grid">
              ${PLANS.map((p) => planCard(p, f.plan)).join('')}
            </div>
          </div>

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

function planCard(p, selected) {
  return `
    <button type="button" class="plan-card ${p.code === selected ? 'selected' : ''}"
            data-act="signup-plan" data-plan="${p.code}"
            aria-pressed="${p.code === selected}">
      <strong>${esc(p.name)}</strong>
      <span class="plan-price">${esc(p.price)}</span>
      <span class="plan-meta">
        데이터 ${esc(p.data)}${AUTH_ENABLED ? '' : ' · ' + esc(p.grade) + ' 등급'}
      </span>
      <span class="plan-desc">
        ${esc(AUTH_ENABLED ? p.name + ' 요금제' : p.desc)}
      </span>
    </button>
  `
}