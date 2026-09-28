/** DOM 유틸 — 프로토타입의 $ · button · field 계열이 여기로 온다. */

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

/** 원본(newvent-design.html)의 esc · clone. 이식한 함수들이 이 이름으로 쓴다. */
export const esc = (x) => escape(x)
export const clone = (x) => JSON.parse(JSON.stringify(x))

/**
 * 템플릿 리터럴에 꽂히는 값을 이스케이프한다.
 *
 * 뷰가 문자열로 HTML 을 만드는 구조라, 이벤트 제목처럼 사용자·관리자가
 * 넣은 값을 그대로 붙이면 XSS 가 된다. 프로토타입에는 이 방어가 없었다.
 *
 *   html`<h1>${event.title}</h1>`
 */
const RAW = Symbol('raw')

export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    if (i === 0) return s
    const v = values[i - 1]
    const piece = v != null && v[RAW] ? String(v.value) : escape(v)
    return out + piece + s
  }, '')
}

export function escape(v) {
  if (v == null) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 이미 HTML 인 조각을 html`` 안에 넣을 때 감싼다.
 * 이스케이프를 건너뛰므로 **넣는 쪽이 안전을 책임진다.**
 * 다른 뷰 함수의 반환값을 조립할 때만 쓰고, 서버에서 온 문자열에는 쓰지 않는다.
 */
export function raw(value) {
  return { [RAW]: true, value: value ?? '' }
}

/** 배열을 이어붙인다. map 결과를 html`` 안에 넣을 때. */
export function join(parts, sep = '') {
  return raw(parts.join(sep))
}

/** 뷰 문자열을 컨테이너에 그린다. */
export function mount(container, markup) {
  container.innerHTML = markup
}

/**
 * 이벤트 위임. 렌더할 때마다 리스너를 다시 붙이지 않아도 된다.
 *
 *   delegate(app, 'click', '[data-act="route"]', (el, ev) => …)
 */
export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (ev) => {
    const el = ev.target.closest(selector)
    if (el && root.contains(el)) handler(el, ev)
  })
}
