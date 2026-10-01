import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const SRC_DIR = join(ROOT, 'src', 'event-css')
export const OUT_FILE = join(ROOT, 'public', 'assets', 'event.css')

const BANNER =
  '/* ⚠ 생성 파일 — 직접 고치지 마세요.\n' +
  ' *   원본: src/event-css/  ·  만들기: node scripts/build-event-css.mjs\n' +
  ' *   (vite dev · build 가 자동으로 다시 만든다) */\n'

function listCss(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name)
    if (d.isDirectory()) return listCss(p)
    return d.name.endsWith('.css') ? [p] : []
  })
}

/** 경로를 / 로 맞춰 정렬한다 — OS 마다 구분자가 달라도 순서가 같게 */
const key = (p) => relative(SRC_DIR, p).split(sep).join('/')

export function renderEventCss() {
  const files = listCss(SRC_DIR).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
  if (files.length === 0) throw new Error(`CSS 원본이 없습니다: ${SRC_DIR}`)

  const parts = files.map((f, i) => {
    const css = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim()
    // @import 는 맨 앞에서만 유효하다. 다른 파일에 있으면 브라우저가 조용히 무시한다.
    if (i > 0 && /^\s*@import\b/m.test(css)) {
      throw new Error(`@import 는 첫 파일(${key(files[0])})에만 둘 수 있습니다: ${key(f)}`)
    }
    return `/* ── ${key(f)} ── */\n${css}\n`
  })
  return BANNER + '\n' + parts.join('\n')
}

export function buildEventCss() {
  const css = renderEventCss()
  const prev = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null
  if (prev !== css) writeFileSync(OUT_FILE, css, 'utf8')
  return prev !== css
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--check')) {
    const prev = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : ''
    if (prev.replace(/\r\n/g, '\n') !== renderEventCss()) {
      console.error('public/assets/event.css 가 src/event-css 와 다릅니다. node scripts/build-event-css.mjs 를 실행하세요.')
      process.exit(1)
    }
    console.log('event.css 최신 상태')
  } else {
    console.log(buildEventCss() ? 'event.css 를 다시 만들었습니다' : 'event.css 변경 없음')
  }
}
