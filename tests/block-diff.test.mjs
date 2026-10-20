import assert from 'node:assert/strict'
import test from 'node:test'
import { diffBlocks, orderChanged, splitBlocks, textPieces } from '../src/shared/preview/block-diff.js'

const page = (blocks) => '<body><div class="ev-container">'
  + blocks.map(([key, inner]) => '<section data-block="' + key + '">' + inner + '</section>').join('') + '</div></body>'

const BEFORE = page([
  ['hero', '<h1>가을 대축제</h1><p>함께해요</p>'],
  ['benefits', '<ul><li>쿠폰</li><li>무료 배송</li></ul>'],
  ['steps', '<ol><li>로그인</li><li>참여</li></ol>'],
  ['notices', '<p>유의사항</p>'],
])

test('영역을 등장 순서대로 나눈다', () => {
  assert.deepEqual(Object.keys(splitBlocks(BEFORE)), ['hero', 'benefits', 'steps', 'notices'])
  assert.deepEqual(Object.keys(splitBlocks('')), [])
  assert.deepEqual(Object.keys(splitBlocks(undefined)), [])
})

test('문구 조각은 태그 · script · style 을 빼고 공백을 정리한다', () => {
  assert.deepEqual(
    textPieces('<style>.a{color:red}</style><h1> 제목&nbsp; 입니다 </h1><script>x()</script><p>본문</p>'),
    ['제목 입니다', '본문'],
  )
})

test('바뀐 게 없으면 빈 목록이다', () => {
  assert.deepEqual(diffBlocks(BEFORE, BEFORE), [])
})

test('문구가 바뀐 영역은 수정 곳 수로 요약한다', () => {
  const after = BEFORE.replace('쿠폰', '5,000원 쿠폰').replace('무료 배송', '전 상품 무료 배송')
  assert.deepEqual(diffBlocks(BEFORE, after), [{ key: 'benefits', kind: 'changed', summary: '문구 2곳 수정' }])
})

test('항목이 늘거나 줄면 추가 · 삭제로 말한다', () => {
  const more = BEFORE.replace('<li>참여</li>', '<li>참여</li><li>인증</li>')
  assert.equal(diffBlocks(BEFORE, more)[0].summary, '항목 1개 추가')
  const fewer = BEFORE.replace('<li>무료 배송</li>', '')
  assert.equal(diffBlocks(BEFORE, fewer)[0].summary, '항목 1개 삭제')
  const both = BEFORE.replace('<li>쿠폰</li>', '<li>적립</li><li>선물</li>')
  assert.equal(diffBlocks(BEFORE, both)[0].summary, '문구 1곳 수정 · 항목 1개 추가')
})

test('글자는 같고 마크업만 다르면 모양 변경이다', () => {
  const after = BEFORE.replace('<h1>', '<h1 style="color:red">')
  assert.deepEqual(diffBlocks(BEFORE, after), [{ key: 'hero', kind: 'changed', summary: '모양 변경' }])
})

test('새로 생기거나 사라진 영역을 알려 준다', () => {
  const after = BEFORE.replace('<section data-block="steps">', '<section data-block="faq"><p>질문</p></section><section data-block="steps">')
    .replace(/<section data-block="notices">[\s\S]*?<\/section>/, '')
  const list = diffBlocks(BEFORE, after)
  assert.deepEqual(list.map((d) => [d.key, d.kind]), [['faq', 'added'], ['notices', 'removed']])
})

test('순서만 바뀐 것도 알아본다', () => {
  const swapped = page([
    ['benefits', '<ul><li>쿠폰</li><li>무료 배송</li></ul>'],
    ['hero', '<h1>가을 대축제</h1><p>함께해요</p>'],
    ['steps', '<ol><li>로그인</li><li>참여</li></ol>'],
    ['notices', '<p>유의사항</p>'],
  ])
  assert.equal(orderChanged(BEFORE, swapped), true)
  assert.equal(orderChanged(BEFORE, BEFORE), false)
  // 영역 하나가 늘어도 나머지 상대 순서가 같으면 순서 변경이 아니다
  const added = BEFORE.replace('<section data-block="steps">', '<section data-block="faq"><p>질문</p></section><section data-block="steps">')
  assert.equal(orderChanged(BEFORE, added), false)
})
