/**
 * 아이디 · 비밀번호 로그인 폼. 사용자 · 관리자 앱이 같이 쓴다 (엔드포인트는 각 앱의 api 가 정한다).
 *
 * 서버 인증(VITE_API_AUTH=on)일 때만 쓰인다. 목업 모드는 기존 "체험하기" 버튼 화면 그대로다.
 */

import { $ } from './dom.js'

/** 폼 마크업. 뷰(loginView)가 카드 안에 넣는다 */
function loginForm() {
  return '<form id="login-form" class="fields login-form" novalidate>' +
    '<label class="field">아이디<input name="loginId" autocomplete="username" maxlength="50" required autofocus></label>' +
    '<label class="field">비밀번호<input name="password" type="password" autocomplete="current-password" maxlength="100" required></label>' +
    '<p id="login-error" class="login-error" role="alert"></p>' +
    '<button type="submit" class="btn primary wide">로그인</button>' +
    '</form>'
}

/**
 * submit 이벤트 처리. 성공하면 onSuccess() 를 부른다.
 *
 * ★ 실패 사유는 서버 문구를 그대로 보여준다 — 서버가 일부러 "아이디 또는 비밀번호" 로 뭉뚱그린다.
 *
 * @param {SubmitEvent} ev
 * @param {{ login: (id: string, pw: string) => Promise<unknown> }} api
 * @param {() => unknown} onSuccess
 */
async function handleLoginSubmit(ev, api, onSuccess) {
  ev.preventDefault()
  const form = ev.target
  const error = $('#login-error')
  const submit = form.querySelector('button[type="submit"]')
  const loginId = form.loginId.value.trim()
  const password = form.password.value

  if (!loginId || !password) {
    error.textContent = '아이디와 비밀번호를 입력해주세요.'
    return
  }

  error.textContent = ''
  submit.disabled = true
  try {
    await api.login(loginId, password)
  } catch (e) {
    // fetch 자체가 실패하면(서버 꺼짐 등) ApiError 가 아니라 TypeError 다
    error.textContent = e?.status ? e.message : '서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'
    form.password.value = ''
    form.password.focus()
    return
  } finally {
    submit.disabled = false
  }
  await onSuccess()
}

export { loginForm, handleLoginSubmit }
