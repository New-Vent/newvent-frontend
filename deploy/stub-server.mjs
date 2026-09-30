/**
 * nginx 검증 전용 스텁 서버. **진짜 백엔드가 아니다.**
 *
 * 백엔드가 나오기 전에 nginx 설정에서 확인해야 할 세 가지를 시험한다.
 * 이 셋은 로컬 Vite 프록시에서는 전부 잘 되기 때문에, 실제 nginx 뒤에
 * 세워보지 않으면 드러나지 않는다.
 *
 *   1) proxy_buffering off   — SSE 이벤트가 하나씩 흘러나오는가
 *   2) proxy_read_timeout    — 60초를 넘겨도 504 가 안 나는가
 *   3) X-Forwarded-Proto     — Set-Cookie 에 Secure 가 붙어 내려가는가
 *
 * 실행:  node deploy/stub-server.mjs        (기본 :8080)
 *        PORT=9000 node deploy/stub-server.mjs
 */

import { createServer } from 'node:http'

const PORT = Number(process.env.PORT || 8080)

const json = (res, code, body, extraHeaders = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  // 프록시가 넘긴 헤더를 그대로 돌려준다 — nginx 설정 확인용
  const forwarded = {
    proto: req.headers['x-forwarded-proto'] ?? null,
    host: req.headers['host'] ?? null,
    realIp: req.headers['x-real-ip'] ?? null,
    forwardedFor: req.headers['x-forwarded-for'] ?? null,
  }

  // ── ① SSE: 이벤트가 하나씩 흘러나오는지 ──────────────────────────
  // /api/admin/events/{id}/generate?count=20&interval=3000
  if (/^\/api\/admin\/events\/[^/]+\/generate$/.test(path)) {
    const count = Number(url.searchParams.get('count') || 20)
    const interval = Number(url.searchParams.get('interval') || 3000)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // nginx 가 proxy_buffering 을 켜뒀더라도 이 헤더면 그 요청만 끈다.
      // 설정이 제대로 됐는지 보려면 이 줄을 주석 처리하고 다시 시험할 것.
      'X-Accel-Buffering': 'no',
    })

    let n = 0
    const started = Date.now()
    const timer = setInterval(() => {
      n += 1
      const elapsed = Math.round((Date.now() - started) / 1000)
      res.write(
        `data: ${JSON.stringify({
          type: 'status',
          phase: 'generating',
          attempt: n,
          maxAttempts: count,
          elapsedSec: elapsed,
        })}\n\n`,
      )
      if (n >= count) {
        res.write(`data: ${JSON.stringify({ type: 'done', version: 99, elapsedSec: elapsed })}\n\n`)
        clearInterval(timer)
        res.end()
      }
    }, interval)

    // Stop 버튼 → 연결 끊김. 진짜 백엔드는 여기서 LLM 호출도 취소해야 한다.
    req.on('close', () => {
      clearInterval(timer)
      console.log(`[stub] 클라이언트가 연결을 끊었습니다 (이벤트 ${n}개 전송 후)`)
    })
    return
  }

  // ── ② 느린 응답: proxy_read_timeout 확인 ────────────────────────
  // /api/slow?sec=90  → 90초 뒤에 한 번에 응답. 504 가 나면 타임아웃이 짧은 것.
  if (path === '/api/slow') {
    const sec = Number(url.searchParams.get('sec') || 90)
    console.log(`[stub] ${sec}초 뒤 응답 예정`)
    const t = setTimeout(() => json(res, 200, { sleptSec: sec, forwarded }), sec * 1000)
    req.on('close', () => clearTimeout(t))
    return
  }

  // ── ③ Secure 쿠키: X-Forwarded-Proto 확인 ───────────────────────
  // Spring 이 하는 판단을 그대로 흉내낸다 — proto 가 https 일 때만 Secure 를 붙인다.
  if (path === '/api/auth/login' || path === '/api/admin/auth/login') {
    const isHttps = forwarded.proto === 'https'
    const name = path.startsWith('/api/admin') ? 'nv_admin_rt' : 'nv_user_rt'
    const cookiePath = path.startsWith('/api/admin') ? '/api/admin/auth' : '/api/auth'
    const cookie =
      `${name}=stub-refresh-token; HttpOnly; SameSite=Lax; Path=${cookiePath}` +
      (isHttps ? '; Secure' : '')

    return json(
      res,
      200,
      {
        accessToken: 'stub-access-token',
        expiresIn: 1800,
        user: { id: 'stub', name: '스텁', grade: '일반' },
        // ★ secureApplied 가 false 면 nginx 의 X-Forwarded-Proto 가 안 넘어온 것
        secureApplied: isHttps,
        forwarded,
      },
      { 'Set-Cookie': cookie },
    )
  }

  if (path.endsWith('/auth/refresh')) {
    const has = (req.headers.cookie || '').includes('_rt=')
    if (!has) return json(res, 401, { message: '세션이 만료되었습니다' })
    return json(res, 200, { accessToken: 'stub-access-token', expiresIn: 1800 })
  }

  // ── 게시된 이벤트 페이지 (/e/{slug}) ────────────────────────────
  if (path.startsWith('/e/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
        `<link rel="stylesheet" href="/assets/event.css"><title>스텁 이벤트</title></head>` +
        `<body class="theme-sports"><div class="ev-container event-page">` +
        `<section class="ev-block block-hero" data-block="hero">` +
        `<h1 class="hero-title">스텁 이벤트 ${path.slice(3)}</h1>` +
        `<p class="hero-desc">/e/{slug} 프록시와 /assets/event.css 서빙을 확인하는 페이지입니다.</p>` +
        `</section></div></body></html>`,
    )
  }

  // ── 그 외 /api/* ───────────────────────────────────────────────
  if (path.startsWith('/api/')) {
    return json(res, 200, { ok: true, path, method: req.method, forwarded })
  }

  json(res, 404, { message: '스텁 서버가 모르는 경로입니다', path })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[stub] http://127.0.0.1:${PORT} 에서 대기 중`)
  console.log('[stub] 확인용 경로')
  console.log('        GET  /api/health')
  console.log('        GET  /api/slow?sec=90')
  console.log('        POST /api/admin/events/1/generate?count=20&interval=3000')
  console.log('        POST /api/auth/login')
  console.log('        GET  /e/test-slug')
})
