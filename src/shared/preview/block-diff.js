/**
 * AI 수정 전 · 후 미리보기 HTML 을 영역(data-block) 단위로 비교한다.
 *
 * ★ DOM 을 쓰지 않는다 — 문자열만 본다. 서버가 주는 미리보기는 영역마다 data-block 을 단
 *   최상위 요소이고, 영역을 세는 쪽(server-editor 의 blocksInHtml)도 같은 정규식을 쓴다.
 * ★ 영역 안의 문구는 태그 사이의 글자 조각으로 센다. 같은 조각은 서로 지워 주고,
 *   남은 개수로 "수정 · 추가 · 삭제" 를 말한다. 줄 단위 diff 가 아니라 관리자가 읽는 요약이다.
 */

const BLOCK_START = /<[a-z][a-z0-9-]*\b[^>]*\bdata-block="([a-z-]+)"[^>]*>/gi

/** 여는 태그(at 에서 시작) 짝이 맞는 닫는 태그 끝. 못 찾으면 끝까지 */
function blockEnd(text, at, tag) {
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*?(/?)>', 'gi')
  re.lastIndex = at
  let depth = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[2]) continue
    depth += m[1] ? -1 : 1
    if (depth === 0) return m.index + m[0].length
  }
  return text.length
}

/** html → { 영역 키: 그 영역의 html 조각 } (등장 순서 유지, 같은 키는 처음 것만) */
export function splitBlocks(html) {
  const text = String(html || '')
  const out = {}
  for (const m of text.matchAll(BLOCK_START)) {
    if (m[1] in out) continue
    const tag = /^<([a-z][a-z0-9-]*)/i.exec(m[0])[1]
    out[m[1]] = text.slice(m.index, blockEnd(text, m.index, tag))
  }
  return out
}

/** 영역 html 의 눈에 보이는 문구 조각. script · style 은 뺀다 */
export function textPieces(fragment) {
  return String(fragment || '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .split(/<[^>]*>/)
    .map((t) => t.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** 같은 조각을 서로 지우고 남은 { removed, added } */
function leftovers(before, after) {
  const pool = new Map()
  for (const t of before) pool.set(t, (pool.get(t) || 0) + 1)
  const added = []
  for (const t of after) {
    if (pool.get(t) > 0) pool.set(t, pool.get(t) - 1)
    else added.push(t)
  }
  const removed = []
  for (const [t, n] of pool) for (let i = 0; i < n; i++) removed.push(t)
  return { removed, added }
}

/** 영역 하나의 변화를 한 줄로. 같으면 null */
export function summarize(beforeHtml, afterHtml) {
  if (beforeHtml === afterHtml) return null
  const { removed, added } = leftovers(textPieces(beforeHtml), textPieces(afterHtml))
  const edited = Math.min(removed.length, added.length)
  const parts = []
  if (edited) parts.push('문구 ' + edited + '곳 수정')
  if (added.length > edited) parts.push('항목 ' + (added.length - edited) + '개 추가')
  if (removed.length > edited) parts.push('항목 ' + (removed.length - edited) + '개 삭제')
  // 글자는 같고 마크업만 다르면 모양 · 이미지 · 배치가 바뀐 것이다
  return parts.join(' · ') || '모양 변경'
}

/**
 * 이전 → 이후 변화 목록. 바뀐 영역만, 이후 화면의 위→아래 순서로.
 * 이전에 없던 영역은 "새 영역", 사라진 영역은 "삭제"다.
 * @returns {{ key: string, kind: 'changed'|'added'|'removed', summary: string }[]}
 */
export function diffBlocks(beforeHtml, afterHtml) {
  const before = splitBlocks(beforeHtml), after = splitBlocks(afterHtml)
  const out = []
  for (const key of Object.keys(after)) {
    if (!(key in before)) out.push({ key, kind: 'added', summary: '새 영역' })
    else {
      const summary = summarize(before[key], after[key])
      if (summary) out.push({ key, kind: 'changed', summary })
    }
  }
  for (const key of Object.keys(before)) if (!(key in after)) out.push({ key, kind: 'removed', summary: '삭제' })
  return out
}

/** 영역 순서만 바뀌었는가 — 공통 영역의 상대 순서를 비교한다 */
export function orderChanged(beforeHtml, afterHtml) {
  const before = Object.keys(splitBlocks(beforeHtml)), after = Object.keys(splitBlocks(afterHtml))
  const common = (list, other) => list.filter((k) => other.includes(k))
  const a = common(before, after), b = common(after, before)
  return a.some((k, i) => k !== b[i])
}
