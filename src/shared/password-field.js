import './password-field.css'

function eyeIcon(visible) {
  return `
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
      <circle cx="12" cy="12" r="3"/>
      ${visible ? '<path d="m3 3 18 18"/>' : ''}
    </svg>
  `
}

export function passwordField(attributes) {
  return `
    <span class="auth-password-field">
      <input type="password" ${attributes}>
      <button
        type="button"
        class="auth-password-toggle"
        data-password-toggle
        aria-label="비밀번호 보기"
        aria-pressed="false"
        title="비밀번호 보기"
      >${eyeIcon(false)}</button>
    </span>
  `
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return

  const button = event.target.closest('[data-password-toggle]')
  if (!button) return

  const input = button.closest('.auth-password-field')?.querySelector('input')
  if (!input) return

  const visible = input.type === 'password'
  const label = visible ? '비밀번호 숨기기' : '비밀번호 보기'

  input.type = visible ? 'text' : 'password'
  button.innerHTML = eyeIcon(visible)
  button.setAttribute('aria-label', label)
  button.setAttribute('aria-pressed', String(visible))
  button.setAttribute('title', label)
})