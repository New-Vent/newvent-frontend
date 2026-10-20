import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

/**
 * 직접 수정으로 비운 문구 — 지우지 않고 숨긴다 (src/event-css/70-components/08-empty-text.css).
 * 브라우저 없이는 렌더를 못 보므로, 규칙이 "빠지면 안 되는 약속"을 지키는지 글자로 확인한다.
 * 실제 숨김 동작은 화면에서 확인했다.
 */
const source = await readFile(new URL('../src/event-css/70-components/08-empty-text.css', import.meta.url), 'utf8')
const built = await readFile(new URL('../public/assets/event.css', import.meta.url), 'utf8')
const rules = source.replace(/\/\*[\s\S]*?\*\//g, '')

test('비운 문구만 담은 요소를 숨기는 규칙이 있다', () => {
  assert.match(rules, /:has\(> span\[id\^="nv-direct-text-"\]:empty\)/)
  assert.match(rules, /display:\s*none\s*!important/)
})

test('속이 빈 span · i(점 같은 장식)만 함께 있으면 숨기고, 그 밖의 요소가 함께 있으면 숨기지 않는다', () => {
  // :not(:has(> :not(<장식>))) — 장식이 아닌 자식이 하나라도 있으면 빠진다
  assert.ok(rules.includes(':not(:has(> :not(span:empty:not([data-slot], [data-behavior]), i:empty)))'))
  // 서버가 나중에 채우는 칸(기간 · 카운트다운)은 장식이 아니다 — 장식으로 치면 기간 줄 전체가 가려진다
  assert.ok(rules.includes('[data-slot], [data-behavior]'))
  // img · svg 를 장식 목록에 넣으면 사진이 함께 사라진다
  assert.ok(!/:not\([^)]*(img|svg|picture|video)/.test(rules.split('{')[0]))
})

test('참여 버튼과 유의사항은 숨기지 않는다', () => {
  const hide = rules.split('}')[0]
  assert.ok(hide.includes('[data-slot="cta-link"]'), '참여 버튼이 숨겨지면 참여할 방법이 사라집니다')
  assert.ok(hide.includes('[data-block="notices"]'), '유의사항이 숨겨지면 안내가 사라집니다')
})

test('줄바꿈으로 나눈 제목은 비운 칸 옆의 br 도 숨긴다', () => {
  assert.match(rules, /br:has\(\+ span\[id\^="nv-direct-text-"\]:empty\)/)
  assert.match(rules, /:empty:first-child \+ br/)
})

test('요소를 지우지 않는다 — display 로만 숨겨서 직접 수정에서 되살릴 수 있다', () => {
  assert.ok(!/visibility|content-visibility|\bremove\b/.test(rules))
  // 규칙 본문은 display 하나뿐이어야 한다 (내용을 바꾸는 content · ::before 등을 쓰지 않는다)
  for (const body of [...rules.matchAll(/\{([^}]*)\}/g)].map((m) => m[1])) {
    assert.deepEqual(body.split(';').map((d) => d.trim()).filter(Boolean), ['display: none !important'])
  }
})

test('만든 event.css 에 규칙이 들어 있다 (npm run css 를 빼먹지 않았는지)', () => {
  assert.ok(built.includes(':not(:has(> :not(span:empty:not([data-slot], [data-behavior]), i:empty)))'), 'public/assets/event.css 에 규칙이 없습니다. npm run css 를 실행하세요')
})
