import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'

/**
 * 올린 이미지 — 고르기 · 올리기 · 지우기. 자리는 **AI 대화 입력칸의 +** 다.
 *
 * ★ 화면은 안 그린다. 여기서 보는 건 **상태와 요청**이다.
 *   파일 input 의 value 를 비우는지는 꼭 본다 — 안 비우면 같은 파일을 다시 못 고른다.
 * ★ 끌어 놓기(블록 순서) 쪽을 건드리지 않았는지도 여기서 본다.
 *   한 번 통째로 덮어써서 그 UI 를 날린 적이 있다.
 */

const BLOCK_LABELS = { hero: '제목·소개', benefits: '혜택', notices: '유의사항', cta: '참여 버튼' }
const HTML = '<div class="ev-container event-page"><section data-block="hero"><h1>제목</h1></section></div>'

globalThis.document ??= { querySelectorAll: () => [], querySelector: () => null }
globalThis.FormData ??= class { append() {} }

async function setup({ upload, remove } = {}) {
  const s = {
    id: '7', status: 'ready', tab: 'chat', busy: false, selected: [], chatInput: '',
    event: { id: 7, name: '이벤트', status: 'DRAFT' },
    preview: { versionId: 12, versionNo: 3, html: HTML, editableTexts: [] },
    versions: [],
    direct: { values: {}, style: {}, styleOn: {}, order: null },
    assets: [{ assetId: 'a1', url: 'https://cdn.test/a1.png', bytes: 1024 }],
    assetBusy: false,
  }
  const ui = { serverEditor: s, route: 'editor' }
  const uploaded = [], removed = [], messages = []
  const bindings = {
    BLOCK_LABELS, PINNED_BLOCKS: ['notices', 'cta'], $: () => null, esc: String,
    badgeOf: () => '', serverStatus: () => '', GRADES: [], gradeLabel: () => '', REQUEST_MAX: 500,
    icon: () => '', serverFrame: () => '',
    collectTexts: () => [], matches: () => false, normalize: (v) => String(v ?? '').trim(), textsOf: () => [],
    cancelGeneration: async () => {}, generationStatus: async () => ({}), endEvent: async () => ({}),
    loadAdminEvent: async () => s.event, loadPreview: async () => s.preview,
    loadVersions: async () => ({ versions: [] }), loadAssets: async () => s.assets,
    publishEvent: async () => ({}), saveCheckpoint: async () => ({}), updateEventInfo: async () => ({}),
    startEdit: async () => ({}), startGenerate: async () => ({}), directEdit: async () => ({}),
    uploadAsset: async (...args) => {
      uploaded.push(args)
      if (upload) return upload()
      return { assetId: 'a2', url: 'https://cdn.test/a2.png', bytes: 2048 }
    },
    deleteAsset: async (...args) => { removed.push(args); if (remove) return remove() },
    ui, button: () => '', closeModal: () => {}, modal: () => {},
    resetAdminServer: () => {}, toast: (m) => messages.push(m),
  }
  const source = await readFile(new URL('../src/admin/views/server-editor.js', import.meta.url), 'utf8')
  const module = new SourceTextModule(source)
  await module.link(() => new SyntheticModule(Object.keys(bindings), function () {
    for (const [key, value] of Object.entries(bindings)) this.setExport(key, value)
  }))
  await module.evaluate()

  const pick = (file) => {
    const target = { id: 'server-asset-file', files: file ? [file] : [], value: 'C:\\fake\\path.png' }
    const handled = module.namespace.handleServerChange({ target }, () => {})
    return { handled, target }
  }
  const settle = () => new Promise((r) => setImmediate(r))
  return { s, uploaded, removed, messages, pick, settle, module, source }
}

const file = (size, name = 'dog.png') => ({ size, name })

test('파일을 고르면 올리고 목록에 더한다', async () => {
  const h = await setup()
  h.pick(file(1000))
  await h.settle()

  assert.deepEqual(h.uploaded, [['7', { size: 1000, name: 'dog.png' }]])
  assert.equal(h.s.assets.length, 2)
  assert.equal(h.s.assets.at(-1).assetId, 'a2')
})

// ★ 안 비우면 같은 파일을 다시 고를 때 change 가 안 난다 — 실패 후 재시도가 막힌다
test('★ 고른 뒤 input 값을 비운다', async () => {
  const h = await setup()
  const { target } = h.pick(file(1000))
  await h.settle()

  assert.equal(target.value, '')
})

// ★ 번호가 프롬프트(Asset.promptLines)의 번호와 같아야 한다. 안내 문구도 그 번호를 말한다
test('올린 뒤 몇 번인지 알려 준다', async () => {
  const h = await setup()
  h.pick(file(1000))
  await h.settle()

  assert.match(h.messages.at(-1), /2번/)
})

test('너무 큰 파일은 보내지 않는다', async () => {
  const h = await setup()
  h.pick(file(4 * 1024 * 1024))
  await h.settle()

  assert.equal(h.uploaded.length, 0)
  assert.match(h.messages.at(-1), /3MB/)
})

test('취소해서 파일이 없으면 아무 일도 없다', async () => {
  const h = await setup()
  const { handled } = h.pick(null)
  await h.settle()

  assert.equal(handled, true)      // 우리 input 이 맞으니 처리한 것으로 본다
  assert.equal(h.uploaded.length, 0)
})

test('올리기가 실패하면 목록이 그대로다', async () => {
  const h = await setup({ upload: () => { throw new Error('이미지 파일이 아닙니다.') } })
  h.pick(file(1000))
  await h.settle()

  assert.equal(h.s.assets.length, 1)
  assert.equal(h.s.assetBusy, false)
  assert.equal(h.messages.at(-1), '이미지 파일이 아닙니다.')
})

test('지우면 목록에서 빠진다', async () => {
  const h = await setup()
  h.module.namespace.handleServerClick('server-asset-delete', { dataset: { id: 'a1' } }, () => {})
  await h.settle()

  assert.deepEqual(h.removed, [['7', 'a1']])
  assert.equal(h.s.assets.length, 0)
})

test('다른 입력의 change 는 건드리지 않는다', async () => {
  const h = await setup()
  const handled = h.module.namespace.handleServerChange({ target: { id: 'admin-from', files: [] } }, () => {})

  assert.equal(handled, false)
  assert.equal(h.uploaded.length, 0)
})

// ★ 이 파일을 통째로 덮어써서 블록 순서 끌어 놓기를 날린 적이 있다. 다시는 안 되게 못 박는다
test('★ 블록 순서 끌어 놓기가 그대로 있다', async () => {
  const h = await setup()

  assert.equal(typeof h.module.namespace.handleServerDrag, 'function')
  for (const mark of ['data-sorder', 'server-order-up', 'server-order-down', 'blockOrder', 'PINNED_BLOCKS']) {
    assert.ok(h.source.includes(mark), mark + ' 가 사라졌다')
  }
})
