import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/admin/views/server-editor.js', import.meta.url), 'utf8')
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))

test('유의사항의 빈 문자열과 공백 입력은 막고 다른 문구의 삭제는 허용한다', () => {
  const make = new Function('textsOf', between('function hasEmptyNoticeEdit', 'const previewTextNodes')
    + '\nreturn hasEmptyNoticeEdit')
  const check = make(() => [{ block: 'hero' }, { block: 'notices' }])
  const s = { preview: { html: '' } }
  for (const after of ['', '  ', '\n\t']) assert.equal(check(s, [{ index: 1, after }]), true)
  assert.equal(check(s, [{ index: 1, after: '안내 문구' }]), false)
  assert.equal(check(s, [{ index: 0, after: '' }]), false)
  assert.equal(check(s, []), false)
})

test('블록 이동 후에도 서버 인덱스와 원래 문구 노드의 연결을 유지한다', () => {
  const doc = { body: {} }, hero = { node: { isConnected: true }, block: 'hero' }
  const benefit = { node: { isConnected: true }, block: 'benefits' }
  let nodes = [hero, benefit]
  const make = new Function('$', 'collectTexts', 'editable',
    'const previewTextNodes = new WeakMap();\n'
    + between('function liveTexts', 'function highlight') + '\nreturn liveTexts')
  const collect = make(() => ({ contentDocument: doc }), () => nodes, () => [{}, {}])
  const s = { preview: { versionId: 1 } }
  assert.equal(collect(s)[0], hero)
  nodes = [benefit, hero]
  assert.equal(collect(s)[0], hero)
  s.preview.versionId = 2
  assert.equal(collect(s)[0], benefit)
})

const makeFolds = () => new Function('esc', 'editable', 'normalize',
  between('function foldSection', 'function updateGroupMarks') + '\nreturn { foldSection, isEdited }')(
  (v) => String(v).replace(/</g, '&lt;'), (s) => s.texts, (v) => String(v ?? '').trim())

test('접는 칸은 기본값을 따르고, 사람이 정해 둔 열림 상태가 우선한다', () => {
  const { foldSection } = makeFolds()
  const s = { direct: { folds: {} } }
  assert.ok(!foldSection(s, 'a', '제목', '본문', '').includes(' open>'))
  assert.ok(foldSection(s, 'a', '제목', '본문', '', { defaultOpen: true }).includes(' open>'))
  // 기본은 열림이어도 사람이 닫아 뒀으면 닫힌 채로
  s.direct.folds.a = false
  assert.ok(!foldSection(s, 'a', '제목', '본문', '', { defaultOpen: true }).includes(' open>'))
  // 기본은 닫힘이어도 사람이 열어 뒀으면 열린 채로
  s.direct.folds.b = true
  assert.ok(foldSection(s, 'b', '제목', '본문', '').includes(' open>'))
  // 본문이 없으면 칸 자체를 그리지 않는다
  assert.equal(foldSection(s, 'c', '제목', '', ''), '')
})

test('영역 칸 머리글: 문구 개수 · 안내 · 미리보기 한 줄을 달고, 변경됨은 숨겨 둔다', () => {
  const { foldSection } = makeFolds()
  const s = { direct: { folds: {} } }
  const html = foldSection(s, 'text:notices', '유의사항', '본문', '',
    { sub: true, idx: [3, 4], count: 2, note: '수정만 가능', preview: '꼭 확인 <b>' })
  assert.ok(html.includes('sedit-subfold'))
  assert.ok(html.includes('data-idx="3,4"') && html.includes('data-n="2"'))
  assert.ok(html.includes('<span class="sedit-fold-count">2개</span>'))
  assert.ok(html.includes('수정만 가능'))
  assert.ok(html.includes('꼭 확인 &lt;b>'), '미리보기 문구는 이스케이프돼야 합니다')
  // 고친 게 없으면 변경됨은 hidden 으로 자리만 잡아 둔다 — 입력하면 켠다
  assert.ok(/class="sedit-fold-mark" hidden>변경됨/.test(html))
  assert.ok(/class="sedit-fold-mark">변경됨/.test(foldSection(s, 'k', 't', 'b', '변경됨', { idx: [0] })))
})

test('문구를 고쳤거나 서식을 건드렸으면 고친 것으로 센다', () => {
  const { isEdited } = makeFolds()
  const s = { texts: [{ before: '가나' }, { before: '다라' }], direct: { values: {}, formats: {} } }
  assert.equal(isEdited(s, 0), false)
  s.direct.values[0] = ' 가나 '          // 앞뒤 공백만 다르면 안 고친 것
  assert.equal(isEdited(s, 0), false)
  s.direct.values[0] = '가나다'
  assert.equal(isEdited(s, 0), true)
  s.direct.formats[1] = { size: 20 }
  assert.equal(isEdited(s, 1), true)
})
