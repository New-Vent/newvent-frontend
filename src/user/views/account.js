/**
 * 내 정보 · 멤버십 등급 · 요금제.
 *
 *   GET   /api/users/me          조회
 *   PATCH /api/users/me          이름·이메일·휴대폰·수신동의 수정
 *   PATCH /api/users/me/plan     요금제 변경 (등급이 따라 바뀐다)
 *
 * 등급이 참여 가능 이벤트를 가른다(VIP·FAMILY 전용). 그래서 요금제를
 * 바꾸면 이벤트 목록의 "참여 가능" 판정도 같이 달라진다.
 */

import { esc } from '@shared/dom.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { PLANS } from '@shared/mock/fixtures.js'
import { state, ui } from '@shared/state.js'

export function accountView() {
  const me = state.db.me
  if (!ui.logged) {
    return `<div class="container empty"><h3>로그인이 필요해요</h3>
      <p>내 정보를 보려면 먼저 로그인해주세요.</p>
      ${button('route', '로그인하기', 'data-route="login"', 'btn primary')}</div>`
  }

  const current = PLANS.find((p) => p.code === me.plan) ?? PLANS[0]

  return `
    <div class="container narrow">
      <div class="page-heading">
        <span class="eyebrow">MY ACCOUNT</span>
        <h1>내 정보</h1>
        <p>${esc(me.name)}님의 계정 정보와 요금제를 관리합니다.</p>
      </div>

      <section class="card account-summary">
        <div class="activity-intro">
          <span class="avatar">${icon('user')}</span>
          <div>
            <h2>${esc(me.name)}님</h2>
            <p>${esc(me.loginId)} · ${esc(me.joinedAt)} 가입</p>
          </div>
        </div>
        <div class="activity-stat">
          <span>멤버십 등급</span>
          <strong>${esc(me.grade)}</strong>
        </div>
        <div class="activity-stat">
          <span>이용 중인 요금제</span>
          <strong style="font-size:20px">${esc(current.name)}</strong>
        </div>
      </section>

      <form id="account-form" class="panel" novalidate>
        <div class="panel-head">기본 정보</div>
        <div class="panel-body fields">
          <label class="field">아이디
            <span class="helper">아이디는 바꿀 수 없어요.</span>
            <input value="${esc(me.loginId)}" disabled>
          </label>
          <label class="field">이름
            <input data-account="name" required maxlength="20" value="${esc(me.name)}">
          </label>
          <label class="field">이메일
            <input data-account="email" type="email" required value="${esc(me.email)}">
          </label>
          <label class="field">휴대폰 번호
            <input data-account="phone" required inputmode="numeric" value="${esc(me.phone)}">
          </label>
          <label class="field row" style="align-items:center;gap:8px">
            <input data-account="marketingOptIn" type="checkbox" ${me.marketingOptIn ? 'checked' : ''}>
            <span>이벤트·혜택 안내 수신 <span class="helper">(선택)</span></span>
          </label>
          <p id="account-error" class="create-error" role="alert"></p>
          <div class="create-actions">
            <button type="submit" class="btn primary">변경 내용 저장</button>
          </div>
        </div>
      </form>

      <section class="panel">
        <div class="panel-head">요금제</div>
        <div class="panel-body">
          <p class="helper" style="margin-bottom:12px">
            요금제를 바꾸면 멤버십 등급이 함께 바뀝니다.
            VIP · FAMILY 등급은 전용 이벤트에 참여할 수 있어요.
          </p>
          <div class="plan-grid">${PLANS.map((p) => planCard(p, me.plan)).join('')}</div>
        </div>
      </section>
    </div>
  `
}

function planCard(p, currentCode) {
  const isCurrent = p.code === currentCode
  return `
    <div class="plan-card ${isCurrent ? 'current' : ''}">
      <strong>${esc(p.name)}${isCurrent ? ' <span class="badge green">이용 중</span>' : ''}</strong>
      <span class="plan-price">${esc(p.price)}</span>
      <span class="plan-meta">데이터 ${esc(p.data)} · ${esc(p.grade)} 등급</span>
      <span class="plan-desc">${esc(p.desc)}</span>
      ${isCurrent ? '' : button('change-plan', '이 요금제로 변경', `data-plan="${p.code}"`, 'btn sm soft')}
    </div>
  `
}
