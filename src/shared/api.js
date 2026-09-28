/**
 * API 클라이언트.
 *
 * 인증 모델은 NewVent_인프라.md 를 따른다 —
 *   Access 토큰   메모리 (변수). 새로고침하면 사라진다
 *   Refresh 토큰  httpOnly 쿠키. JS 가 못 읽고 브라우저가 알아서 싣는다
 *
 * 사용자·관리자의 Refresh 쿠키는 이름과 Path 가 갈라져 있다.
 *   nv_user_rt    Path=/api/auth
 *   nv_admin_rt   Path=/api/admin/auth
 * 그래서 refresh 엔드포인트도 앱마다 다르다. createApi 로 주입한다.
 */

/**
 * @param {object} opts
 * @param {string} opts.authBase  '/api/auth' 또는 '/api/admin/auth'
 */
export function createApi({ authBase }) {
  let accessToken = null
  let refreshing = null

  const setToken = (t) => {
    accessToken = t
  }
  const clearToken = () => {
    accessToken = null
  }

  async function raw(path, { method = 'GET', body, headers = {}, signal } = {}) {
    return fetch(path, {
      method,
      signal,
      // 같은 오리진이지만 명시해 둔다. 나중에 도메인이 갈려도 동작이 안 바뀐다.
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  /** 동시에 여러 요청이 401 을 받아도 refresh 는 한 번만 돈다. */
  function refresh() {
    refreshing ??= raw(`${authBase}/refresh`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) throw new ApiError('세션이 만료되었습니다', res.status)
        const data = await res.json()
        setToken(data.accessToken)
        return data.accessToken
      })
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }

  /** 401 이면 한 번만 refresh 후 재시도한다. */
  async function request(path, opts = {}) {
    let res = await raw(path, opts)

    if (res.status === 401 && !path.startsWith(authBase)) {
      try {
        await refresh()
      } catch (e) {
        clearToken()
        throw e
      }
      res = await raw(path, opts)
    }

    if (!res.ok) {
      const message = await res
        .json()
        .then((d) => d.message)
        .catch(() => null)
      throw new ApiError(message || `요청에 실패했습니다 (${res.status})`, res.status)
    }

    return res.status === 204 ? null : res.json()
  }

  return {
    setToken,
    clearToken,
    refresh,
    get: (p, o) => request(p, { ...o, method: 'GET' }),
    post: (p, body, o) => request(p, { ...o, method: 'POST', body }),
    put: (p, body, o) => request(p, { ...o, method: 'PUT', body }),
    patch: (p, body, o) => request(p, { ...o, method: 'PATCH', body }),
    del: (p, o) => request(p, { ...o, method: 'DELETE' }),
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
