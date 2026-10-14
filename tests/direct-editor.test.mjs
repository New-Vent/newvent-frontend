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
