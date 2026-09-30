/**
 * 직접 수정 대상 문구 — 백엔드 DirectEditor.collectTextNodes 와 **같은 순서**로 모은다.
 *
 *   [data-block] 안의 텍스트 노드를 문서 순서대로
 *   notices 블록 · [data-slot="period"] 안은 뺀다 (서버가 채우는 자리)
 *   script · style · textarea · select 의 글자와 공백뿐인 노드도 뺀다
 *
 * ★ 서버가 주는 editableTexts 가 기준이다. 여기서 모은 건 "어느 영역의 문구인지" 와
 *   "미리보기의 어느 노드인지" 를 알아내는 데만 쓴다. 순서 · 글자가 어긋나면 matches() 가 false 다.
 */

const SKIP_PARENT = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'SELECT'])
const SKIP_SCOPE = '[data-block="notices"],[data-slot="period"]'
// Jsoup 의 isBlank 는 이 다섯 글자만 공백으로 본다
const NOT_BLANK = /[^ \t\n\f\r]/

/** Jsoup TextNode.text().trim() 과 같게 — 연속 공백을 하나로 */
export const normalize = (text) => text.replace(/[ \t\n\f\r ]+/g, ' ').trim()

/** @returns {{node: Text, block: string, text: string}[]} */
export function collectTexts(root) {
  const out = []
  const walk = (el, block, skip) => {
    for (const c of el.childNodes) {
      if (c.nodeType === 1) {
        const b = c.hasAttribute('data-block') ? c.getAttribute('data-block') : block
        walk(c, b, skip || c.matches(SKIP_SCOPE))
      } else if (c.nodeType === 3 && block && !skip && !SKIP_PARENT.has(c.parentNode.nodeName) && NOT_BLANK.test(c.data)) {
        out.push({ node: c, block, text: normalize(c.data) })
      }
    }
  }
  if (root) walk(root, null, false)
  return out
}

/** 서버 editableTexts 와 순서 · 글자가 같은가 */
export function matches(collected, editable) {
  return collected.length === editable.length && collected.every((t, i) => t.text === normalize(editable[i].before))
}

/** HTML 조각 → 문구 목록 (화면에 붙이지 않고 읽는다) */
export function textsOf(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html')
  return collectTexts(doc.body)
}
