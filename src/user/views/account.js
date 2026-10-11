/**
 * 내 정보 조회 및 수정.
 * GET /api/users/me
 * PATCH /api/users/me
 *
 * 멤버십 등급은 서버 응답의 membershipGrade를 표시한다.
 */

import { esc } from '@shared/dom.js'
import { AUTH_ENABLED } from '@shared/api.js'
import { icon } from '@shared/icons.js'
import { button } from '@shared/ui/controls.js'
import { PLANS } from '@shared/mock/fixtures.js'
import { state, ui } from '@shared/state.js'

export function accountView() {
  if (!ui.logged) {
    return `
      <div class="container empty">
        <h3>로그인이 필요해요</h3>
        <p>내 정보를 보려면 먼저 로그인해주세요.</p>
        ${button('route', '로그인하기', 'data-route="login"', 'btn primary')}
      </div>
    `
  }

  const me = AUTH_ENABLED ? ui.serverMe : state.db.me

  if (!me) {
    return `
      <div class="container empty">
        <h3>내 정보를 불러오지 못했어요</h3>
        <p>${esc(ui.serverMeError || '다시 시도해주세요.')}</p>
        ${button('reload-account', '다시 시도', '', 'btn primary')}
      </div>
    `
  }

  const current = AUTH_ENABLED
    ? null
    : PLANS.find((p) => p.code === me.plan) ?? PLANS[0]

  const grade = AUTH_ENABLED ? me.membershipGrade : me.grade
  const planLabel = AUTH_ENABLED
    ? '월 ' + Number(me.plan).toLocaleString('ko-KR') + '원'
    : current.name

  return `
    <div class="container narrow">
      <div class="page-heading">
        <span class="eyebrow">MY ACCOUNT</span>
        <h1>내 정보</h1>
        <p>${esc(me.name)}님의 계정 정보를 관리합니다.</p>
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
          <strong>${esc(grade)}</strong>
        </div>

        <div class="activity-stat">
          <span>이용 중인 요금제</span>
          <strong style="font-size:20px">${esc(planLabel)}</strong>
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
            <input data-account="name" required maxlength="50"
                   autocomplete="name" value="${esc(me.name)}">
          </label>

          <label class="field">이메일
            <input data-account="email" type="email" required maxlength="100"
                   autocomplete="email" value="${esc(me.email)}">
          </label>

          <label class="field">휴대폰 번호
            <span class="helper">
              ${AUTH_ENABLED && me.phone
                ? '등록된 번호는 변경할 수 있지만 비울 수는 없어요.'
                : '선택 입력 · 최대 20자'}
            </span>
            <input data-account="phone" type="tel" maxlength="20"
                   autocomplete="tel" value="${esc(me.phone ?? '')}">
          </label>

          ${!AUTH_ENABLED ? `
            <label class="field row" style="align-items:center;gap:8px">
              <input data-account="marketingOptIn" type="checkbox"
                     ${me.marketingOptIn ? 'checked' : ''}>
              <span>
                이벤트·혜택 안내 수신
                <span class="helper">(선택)</span>
              </span>
            </label>
          ` : ''}

          <p id="account-error" class="create-error" role="alert"></p>

          <div class="create-actions">
            <button type="submit" class="btn primary">변경 내용 저장</button>
          </div>
        </div>
      </form>

      ${!AUTH_ENABLED ? `
        <section class="panel">
          <div class="panel-head">요금제</div>
          <div class="panel-body">
            <div class="plan-grid">
              ${PLANS.map((p) => planCard(p, me.plan)).join('')}
            </div>
          </div>
        </section>
      ` : ''}
    </div>
  `
}

function planCard(p, currentCode) {
  const isCurrent = p.code === currentCode

  return `
    <div class="plan-card ${isCurrent ? 'current' : ''}">
      <strong>
        ${esc(p.name)}
        ${isCurrent ? '<span class="badge green">이용 중</span>' : ''}
      </strong>
      <span class="plan-price">${esc(p.price)}</span>
      <span class="plan-meta">데이터 ${esc(p.data)} · ${esc(p.grade)} 등급</span>
      <span class="plan-desc">${esc(p.desc)}</span>
      ${isCurrent
        ? ''
        : button('change-plan', '이 요금제로 변경', `data-plan="${p.code}"`, 'btn sm soft')}
    </div>
  `
}