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
 *
 * ★ 갱신이 두 갈래다.
 *   1) 사후 — 401 을 받으면 refresh 후 한 번 재시도
 *   2) 사전 — 만료가 가까우면 폴링이 미리 갱신, boot() 가 시작할 때 한 번
 *
 *   2)가 필요한 이유: **SSE 스트리밍 중에는 401 재시도가 통하지 않는다.**
 *   LLM 생성이 길어서(nginx proxy_read_timeout 300s) 스트림이 열려 있는
 *   동안 토큰이 만료되면 끊어진 스트림을 되살릴 수 없다. 생성을 시작하기
 *   전에 ensureFresh() 로 잔여 시간을 확보한다.
 */

/** JWT 의 exp(초)를 읽는다. 못 읽으면 null — 서명 검증은 서버 몫이다. */
function jwtExpiry(token) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = JSON.parse(json).exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * @param {object} opts
 * @param {string} opts.authBase      '/api/auth' 또는 '/api/admin/auth'
 * @param {number} [opts.skewMs]      만료 몇 ms 전부터 미리 갱신할지
 * @param {number} [opts.pollMs]      메모리 토큰을 얼마마다 들여다볼지
 */
export function createApi({ authBase, skewMs = 60_000, pollMs = 30_000 }) {
  let accessToken = null
  let expiresAt = 0
  let refreshing = null
  let poller = null

  /**
   * @param {string|null} token
   * @param {number} [expiresIn] 초. 없으면 JWT 의 exp 를 본다.
   */
  function setToken(token, expiresIn) {
    accessToken = token || null
    if (!accessToken) {
      expiresAt = 0
      return
    }
    expiresAt = expiresIn
      ? Date.now() + expiresIn * 1000
      : (jwtExpiry(accessToken) ?? 0)
  }

  function clearToken() {
    setToken(null)
  }

  /** 만료까지 남은 ms. 만료 시각을 모르면 Infinity (401 에 기대는 동작). */
  function remainingMs() {
    return expiresAt ? expiresAt - Date.now() : Infinity
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
        setToken(data.accessToken, data.expiresIn)
        return data
      })
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }

  /**
   * 토큰이 없거나 곧 만료되면 먼저 갱신한다.
   * **SSE 를 열기 직전에 반드시 부를 것.**
   */
  async function ensureFresh(needMs = skewMs) {
    if (accessToken && remainingMs() > needMs) return accessToken
    await refresh()
    return accessToken
  }

  /**
   * 앱 시작 시 한 번. 새로고침으로 메모리가 비었을 때 Refresh 쿠키로 되살린다.
   * 이걸 안 하면 첫 요청이 반드시 401 을 한 번 맞고, 그 사이 로그인 화면이
   * 깜빡였다가 바뀐다.
   *
   * @returns {Promise<boolean>} 로그인 상태로 복구됐는지
   */
  async function boot() {
    try {
      await refresh()
      startWatch()
      return true
    } catch {
      clearToken()
      return false
    }
  }

  /** 메모리 토큰을 주기적으로 들여다보다가 만료가 가까우면 갱신한다. */
  function startWatch() {
    stopWatch()
    poller = setInterval(() => {
      if (!accessToken) return
      if (remainingMs() > skewMs) return
      refresh().catch(() => clearToken())
    }, pollMs)
  }

  function stopWatch() {
    if (poller) clearInterval(poller)
    poller = null
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
    ensureFresh,
    boot,
    startWatch,
    stopWatch,
    remainingMs,
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
