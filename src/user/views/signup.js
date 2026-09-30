/**
 * 회원가입. `POST /api/public/users/signup`
 *
 * 지금은 목업이라 state.db.me 를 채우고 바로 로그인 상태로 넘어간다.
 * API 를 붙일 때 제출 처리만 repo 로 바꾸면 화면은 그대로 쓴다.
 */

import { esc } from '@shared/dom.js'
import { button } from '@shared/ui/controls.js'
import { PLANS } from '@shared/mock/fixtures.js'
import { ui } from '@shared/state.js'

export function signupView() {
  const f = (ui.signup ??= { loginId: '', name: '', email: '', phone: '', plan: 'BASIC', agree: false })

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
            <span class="helper">영문·숫자 4~20자</span>
            <input data-signup="loginId" name="loginId" required minlength="4" maxlength="20"
                   autocomplete="username" placeholder="user01" value="${esc(f.loginId)}">
          </label>

          <label class="field">비밀번호
            <span class="helper">8자 이상, 영문과 숫자를 섞어주세요</span>
            <input data-signup="password" name="password" type="password" required minlength="8"
                   autocomplete="new-password" placeholder="••••••••">
          </label>

          <label class="field">비밀번호 확인
            <input data-signup="password2" name="password2" type="password" required
                   autocomplete="new-password" placeholder="••••••••">
          </label>

          <label class="field">이름
            <input data-signup="name" name="name" required maxlength="20"
                   autocomplete="name" placeholder="홍길동" value="${esc(f.name)}">
          </label>

          <label class="field">이메일
            <input data-signup="email" name="email" type="email" required
                   autocomplete="email" placeholder="name@example.com" value="${esc(f.email)}">
          </label>

          <label class="field">휴대폰 번호
            <span class="helper">'-' 없이 숫자만 입력해도 됩니다</span>
            <input data-signup="phone" name="phone" required inputmode="numeric"
                   autocomplete="tel" placeholder="01012345678" value="${esc(f.phone)}">
          </label>

          <div class="field">
            <span>요금제</span>
            <span class="helper">요금제에 따라 참여할 수 있는 이벤트가 달라져요. 가입 후에도 바꿀 수 있습니다.</span>
            <div class="plan-grid">${PLANS.map((p) => planCard(p, f.plan)).join('')}</div>
          </div>

          <label class="field row" style="align-items:center;gap:8px">
            <input data-signup="agree" name="agree" type="checkbox" ${f.agree ? 'checked' : ''}>
            <span>이벤트·혜택 안내 수신에 동의합니다 <span class="helper">(선택)</span></span>
          </label>

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
            data-act="signup-plan" data-plan="${p.code}" aria-pressed="${p.code === selected}">
      <strong>${esc(p.name)}</strong>
      <span class="plan-price">${esc(p.price)}</span>
      <span class="plan-meta">데이터 ${esc(p.data)} · ${esc(p.grade)} 등급</span>
      <span class="plan-desc">${esc(p.desc)}</span>
    </button>
  `
}
