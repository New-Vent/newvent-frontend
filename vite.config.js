import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const r = (p) => fileURLToPath(new URL(p, import.meta.url))

const MIME = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
}

/**
 * dev 에서 public/assets 를 루트 /assets/ 로도 서빙한다.
 *
 * Vite dev 는 public/ 을 base 아래에 서빙하므로 관리자 앱에서는
 * /admin/assets/event.css 가 된다. 하지만 미리보기 문서(iframe)는
 * 운영 기준인 절대경로 /assets/event.css 를 링크한다 — nginx 가
 * 거기서 서빙하기 때문이다. 그 차이를 dev 에서만 메운다.
 */
function serveAssetsAtRoot(dir) {
  return {
    name: 'newvent-assets-at-root',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (!path.startsWith('/assets/')) return next()

        const file = join(dir, normalize(path.slice('/assets/'.length)))
        if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return next()

        res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
  }
}

/**
 * 앱을 두 벌로 나눠 빌드한다.
 *
 * 관리자 번들(편집 스튜디오·채팅·버전 비교)은 무겁고, 공개 화면에는
 * 내려갈 이유가 없다. 따로 빌드해야 nginx 에서 /admin/ 에 IP 제한을
 * 걸었을 때 번들까지 같이 막힌다. (한 벌로 빌드하면 관리자 JS 가
 * /static/ 에 섞여서 제한 밖으로 새어 나간다.)
 *
 *   APP=user   (기본)  →  dist/user   →  /srv/web/
 *   APP=admin          →  dist/admin  →  /srv/web/admin/
 */
const APP = process.env.APP === 'admin' ? 'admin' : 'user'

const TARGETS = {
  // base 는 dev 서버에도 적용된다. 관리자 앱은 개발 중에도
  // http://localhost:5174/admin/ 로 뜨므로 운영과 경로가 같다.
  user: { base: '/', port: 5173 },
  admin: { base: '/admin/', port: 5174 },
}

const API_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:8080'

// 백엔드가 맡는 경로. dev 서버에서도 운영과 같게 프록시한다.
//
// ★ 정규식(^ 로 시작)으로 쓴다. 문자열 '/e' 는 접두사 매칭이라
//   사용자 화면의 /events/:id 까지 백엔드로 넘겨버린다.
const proxy = {
  '^/api/': { target: API_TARGET, changeOrigin: true },
  '^/e/': { target: API_TARGET, changeOrigin: true },
}

export default defineConfig(({ command }) => {
  const t = TARGETS[APP]

  return {
    root: r(`./src/${APP}`),

    // ★ .env · .env.local 은 레포 최상위에서 읽는다.
    //   기본값은 root(src/user · src/admin)라서, 지정하지 않으면 최상위 .env.local 이 무시된다.
    envDir: r('.'),
    base: t.base,

    // public/ 은 사용자 "빌드"에서만 복사한다. 양쪽에서 복사하면
    // /assets/event.css 가 /srv/web 과 /srv/web/admin 에 중복된다.
    //
    // ★ dev 서버에서는 양쪽 다 켠다. 편집 스튜디오의 미리보기가
    //   /assets/event.css 를 링크하는데, 끄면 관리자 dev 에서 404 가 난다.
    //   운영에서는 nginx 가 /assets/ 를 서빙하므로 빌드 산출물에 없어도 된다.
    publicDir: command === 'serve' || APP === 'user' ? r('./public') : false,

    plugins: [serveAssetsAtRoot(r('./public/assets'))],

    resolve: {
      alias: { '@shared': r('./src/shared') },
    },

    build: {
      outDir: r(`./dist/${APP}`),
      emptyOutDir: true,

      // ★ 기본값 'assets' 를 쓰면 안 된다.
      //   nginx 가 /assets/ 를 event.css · event.js 자리로 쓰고 있어서
      //   배포할 때마다 서로 덮어쓴다. (deploy/nginx/newvent.conf 참고)
      assetsDir: 'static',

      sourcemap: true,
    },

    server: {
      port: t.port,
      strictPort: true,
      // src/shared 는 root(src/user · src/admin) 바깥이라
      // 명시하지 않으면 dev 서버가 읽기를 거부한다.
      fs: { allow: [r('.')] },
      proxy,
    },

    preview: {
      port: t.port,
      strictPort: true,
      proxy,
    },
  }
})
