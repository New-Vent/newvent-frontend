/** '/' (사용자) 또는 '/admin/' (관리자). */
export const BASE = import.meta.env.BASE_URL

function stripBase(pathname) {
  const p = pathname.startsWith(BASE)
    ? pathname.slice(BASE.length)
    : pathname

  return '/' + p.replace(/^\/+/, '')
}

function compile(pattern) {
  const keys = []
  const source = pattern
    .replace(/\/+$/, '')
    .replace(/:([\w]+)/g, (_, key) => {
      keys.push(key)
      return '([^/]+)'
    })

  return {
    re: new RegExp('^' + (source || '/') + '/?$'),
    keys,
  }
}

export function createRouter(
  routes,
  onChange,
  { beforeLeave = () => true } = {},
) {
  const compiled = routes.map((route) => ({
    ...route,
    ...compile(route.path),
  }))

  const INDEX_KEY = '__newventHistoryIndex'
  let index = Number.isInteger(history.state?.[INDEX_KEY])
    ? history.state[INDEX_KEY]
    : 0
  let restoring = false

  history.replaceState(
    { ...history.state, [INDEX_KEY]: index },
    '',
    location.href,
  )

  function resolve() {
    const path = stripBase(location.pathname)

    for (const route of compiled) {
      const match = path.match(route.re)
      if (!match) continue

      const params = {}
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(match[i + 1])
      })

      return { name: route.name, params }
    }

    return { name: 'notFound', params: {} }
  }

  function navigate(path, { replace = false } = {}) {
    if (restoring) return false

    const url = BASE.replace(/\/$/, '') + path

    if (url === location.pathname) {
      onChange(resolve())
      return true
    }

    if (!beforeLeave()) return false

    if (!replace) index += 1

    history[replace ? 'replaceState' : 'pushState'](
      { ...history.state, [INDEX_KEY]: index },
      '',
      url,
    )

    onChange(resolve())
    return true
  }

  window.addEventListener('popstate', (event) => {
    if (restoring) {
      restoring = false
      return
    }

    const nextIndex = event.state?.[INDEX_KEY]

    // 앱이 만든 기록 사이의 뒤로가기·앞으로가기.
    if (Number.isInteger(nextIndex)) {
      if (!beforeLeave()) {
        const delta = index - nextIndex

        if (delta) {
          restoring = true
          history.go(delta)
        }

        return
      }

      index = nextIndex
    }

    onChange(resolve())
  })

  return {
    navigate,
    resolve,
    start: () => onChange(resolve()),
  }
}