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

/* ── 항목 내용 맞바꾸기 · 맨 위/아래 · 한 단계 되돌리기 ─────────────────────── */

const makeSwap = () => new Function('editable', 'liveTexts', 'itemElements', 'labelOf',
  'const COUNTER_ONLY = null;\n'
  + between('const SWAPPABLE', 'const swapItems') + '\nreturn { savedFormat, patchPart, effectiveFormat, sameFormat, setFormat, swapPlan, SWAPPABLE }')

const swapState = (texts, formats = {}) => ({ texts, direct: { values: {}, formats, removeItems: {}, history: [] } })
const swapParts = (texts, itemsOf) => makeSwap()((s) => s.texts, () => texts.map((t, i) => ({ node: { i }, block: 'benefits' })),
  () => itemsOf.map((idx) => ({ contains: (node) => idx.includes(node.i) })), (k) => k)

test('문구 서식: 저장된 서식 위에 고치는 중인 서식이 겹쳐지고, reset 이면 저장된 것을 버린다', () => {
  const { effectiveFormat } = swapParts([{ before: 'a' }], [[0]])
  const s = swapState([{ before: 'a', format: { color: '#112233', 'font-size': '20px', 'font-weight': '700' } }])
  assert.deepEqual(effectiveFormat(s, 0), { color: '#112233', size: 20, bold: true })
  s.direct.formats[0] = { size: 30 }
  assert.deepEqual(effectiveFormat(s, 0), { color: '#112233', size: 30, bold: true })
  s.direct.formats[0] = { reset: true, color: '#ffffff' }
  assert.deepEqual(effectiveFormat(s, 0), { color: '#ffffff' })
})

test('서식을 맞춘다: 같으면 그대로 · 저장된 서식과 같아지면 고칠 것을 지운다 · 아니면 reset 과 함께 보낸다', () => {
  const { setFormat } = swapParts([{ before: 'a' }], [[0]])
  const s = swapState([{ before: 'a', format: { color: '#112233' } }])
  setFormat(s, 0, { color: '#112233' })
  assert.equal(s.direct.formats[0], undefined, '이미 같으면 아무것도 만들지 않는다')
  setFormat(s, 0, { size: 24 })
  assert.deepEqual(s.direct.formats[0], { reset: true, size: 24 }, '저장된 색은 버리고 새 서식만')
  setFormat(s, 0, { color: '#112233' })
  assert.equal(s.direct.formats[0], undefined, '저장된 서식으로 돌아오면 고칠 게 없다')
  setFormat(s, 0, {})
  assert.deepEqual(s.direct.formats[0], { reset: true }, '서식이 없어야 하면 reset 만')
})

test('맞바꾸기 계획: 조각 수가 같아야 하고 단계 번호는 제자리에 둔다', () => {
  // 항목 0 = 문구 0·1·2, 항목 1 = 문구 3·4·5
  const texts = ['01', '로그인', '설명 가', '02', '참여', '설명 나'].map((before) => ({ before }))
  const { swapPlan } = swapParts(texts, [[0, 1, 2], [3, 4, 5]])
  const s = swapState(texts)
  assert.deepEqual(swapPlan(s, 'steps', 0, 1).pairs, [[1, 4], [2, 5]], '번호(01 · 02)는 뺀다')

  const uneven = swapParts(texts, [[0, 1, 2], [3, 4]])
  assert.match(uneven.swapPlan(s, 'steps', 0, 1).why, /3개 ↔ 2개/)

  const mixed = swapParts(['01', '가', '나', '다', '라', '마'].map((before) => ({ before })), [[0, 1, 2], [3, 4, 5]])
  assert.match(mixed.swapPlan(swapState(['01', '가', '나', '다', '라', '마'].map((before) => ({ before }))), 'steps', 0, 1).why, /구조가 달라/,
    '한쪽만 번호면 구조가 다른 것이다')
})

test('자주 묻는 질문은 맞바꾸지 않는다 — 질문과 답이 짝이다', () => {
  const texts = ['질문 1', '질문 2'].map((before) => ({ before }))
  const { swapPlan } = swapParts(texts, [[0], [1]])
  assert.match(swapPlan(swapState(texts), 'faq', 0, 1).why, /짝이 있어서/)
})

test('항목 끌어 놓기: 이웃끼리의 맞바꾸기를 이어서 한다 — 지운(안 보이는) 항목은 건너뛴다', () => {
  const chainSteps = new Function(between('function chainSteps', 'function syncTextFields') + '\nreturn chainSteps')()
  assert.deepEqual(chainSteps([0, 1, 2, 3], 0, 2), [[0, 1], [1, 2]], '앞에서 뒤로 — 사이의 내용이 한 칸씩 당겨진다')
  assert.deepEqual(chainSteps([0, 1, 2, 3], 3, 1), [[3, 2], [2, 1]], '뒤에서 앞으로')
  assert.deepEqual(chainSteps([0, 2, 3], 0, 3), [[0, 2], [2, 3]], '1번 항목을 지웠으면 건너뛴다')
  assert.deepEqual(chainSteps([0, 2, 3], 0, 1), [], '지운 항목 자리에는 놓을 수 없다')
  assert.deepEqual(chainSteps([0, 1], 1, 1), [], '제자리')
})

const makeOrder = () => new Function('PINNED_BLOCKS', 'ui', 'HISTORY_MAX',
  between('function pushHistory', 'function undoLast') + '\nreturn { pushHistory }')

test('한 단계 되돌리기 기록은 50개까지만 쌓는다', () => {
  const { pushHistory } = makeOrder()([], {}, 50)
  const s = { direct: { history: [] } }
  for (let i = 0; i < 60; i++) pushHistory(s, { type: 'order', order: [String(i)] })
  assert.equal(s.direct.history.length, 50)
  assert.deepEqual(s.direct.history[0].order, ['10'], '가장 오래된 것부터 버린다')
})
