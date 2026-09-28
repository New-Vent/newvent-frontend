/**
 * 최소 라우터 — History API 기반.
 *
 * 프로토타입은 ui.route 문자열만 바꿨기 때문에 주소가 안 바뀌고
 * 새로고침하면 처음으로 돌아갔다. 실제 URL 을 쓰면 새로고침·뒤로가기·
 * 링크 공유가 전부 자연스러워진다.
 *
 * nginx 가 SPA fallback(try_files … /index.html)을 하고 있어서
 * 어느 주소로 직접 들어와도 앱이 뜬다.
 */

/** '/' (사용자) 또는 '/admin/' (관리자). vite 의 base 값이 그대로 들어온다. */
export const BASE = import.meta.env.BASE_URL

/** '/admin/events/3/edit' → '/events/3/edit' */
function stripBase(pathname) {
  const p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname
  return '/' + p.replace(/^\/+/, '')
}

/** '/events/:id/edit' → 정규식 + 파라미터 이름 */
function compile(pattern) {
  const keys = []
  const source = pattern
    .replace(/\/+$/, '')
    .replace(/:([\w]+)/g, (_, k) => {
      keys.push(k)
      return '([^/]+)'
    })
  return { re: new RegExp('^' + (source || '/') + '/?$'), keys }
}

/**
 * @param {Array<{path: string, name: string}>} routes
 * @param {(match: {name: string, params: object}) => void} onChange
 */
export function createRouter(routes, onChange) {
  const compiled = routes.map((r) => ({ ...r, ...compile(r.path) }))

  function resolve() {
    const path = stripBase(location.pathname)
    for (const r of compiled) {
      const m = path.match(r.re)
      if (!m) continue
      const params = {}
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])))
      return { name: r.name, params }
    }
    return { name: 'notFound', params: {} }
  }

  function navigate(path, { replace = false } = {}) {
    const url = BASE.replace(/\/$/, '') + path
    if (url === location.pathname) return
    history[replace ? 'replaceState' : 'pushState']({}, '', url)
    onChange(resolve())
  }

  window.addEventListener('popstate', () => onChange(resolve()))

  return { navigate, resolve, start: () => onChange(resolve()) }
}
