import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'

async function setup({ restore, refresh } = {}) {
  const s = {
    id: '7', status: 'ready', busy: false, event: { name: '이벤트', status: 'DRAFT' },
    preview: { versionId: 12, versionNo: 3 }, versions: [{ versionId: 10, versionNo: 1 }],
    direct: { values: { 0: '수정 중' } },
  }
  const ui = { serverEditor: s, route: 'versions' }
  const calls = [], messages = []
  let confirm
  const bindings = {
    esc: String, icon: () => '', serverFrame: () => '', ui,
    button: () => '', modal: () => {},
    ask: (_title, _text, action) => { confirm = action },
    toast: (message) => messages.push(message),
    loadingView: () => '', openPublish: () => {}, running: () => false,
    openRegister: () => {}, resetAdminServer: () => {},
    loadVersion: () => {}, loadVersions: () => {}, removeCheckpoint: () => {}, saveCheckpoint: () => {},
    restoreVersion: async (...args) => {
      calls.push(args)
      return restore ? restore() : { versionId: 13, versionNo: 4 }
    },
    refreshPage: async (target, options) => {
      assert.equal(options.strictVersions, true)
      if (refresh) return refresh()
      target.preview = { versionId: 13, versionNo: 4 }
      target.direct = { values: {}, style: {}, styleOn: {} }
    },
  }
  const module = new SourceTextModule(await readFile(new URL('../src/admin/views/server-versions.js', import.meta.url), 'utf8'))
  await module.link(() => new SyntheticModule(Object.keys(bindings), function () {
    for (const [key, value] of Object.entries(bindings)) this.setExport(key, value)
  }))
  await module.evaluate()
  const click = () => module.namespace.handleVersionsClick('server-version-restore', { dataset: { version: '10' } }, () => {})
  return { s, ui, calls, messages, click, confirm: () => confirm?.() }
}

test('확인 전에는 호출하지 않고 성공 후 새 버전과 직접 편집 기준을 갱신한다', async () => {
  const h = await setup()
  h.click()
  assert.equal(h.calls.length, 0)
  await h.confirm()
  assert.deepEqual(h.calls, [['7', 10]])
  assert.equal(h.s.preview.versionId, 13)
  assert.deepEqual(h.s.direct.values, {})
  assert.equal(h.s.busy, false)
})

test('요청 중 확인이 반복되어도 POST는 한 번만 실행한다', async () => {
  let release
  const h = await setup({ restore: () => new Promise((resolve) => { release = resolve }) })
  h.click()
  const first = h.confirm()
  await h.confirm()
  assert.equal(h.calls.length, 1)
  release({ versionId: 13, versionNo: 4 })
  await first
})

test('API 거절 시 기존 미리보기와 저장하지 않은 직접 수정을 유지한다', async () => {
  const h = await setup({ restore: () => { throw new Error('접근 권한이 없습니다.') } })
  h.click()
  await h.confirm()
  assert.equal(h.s.preview.versionId, 12)
  assert.equal(h.s.direct.values[0], '수정 중')
  assert.equal(h.messages.at(-1), '접근 권한이 없습니다.')
  assert.equal(h.s.busy, false)
})

test('새 버전 생성 후 조회 실패는 재생성 없이 다시 불러오기를 안내한다', async () => {
  const h = await setup({ refresh: () => { throw new Error('조회 실패') } })
  h.click()
  await h.confirm()
  assert.equal(h.s.status, 'error')
  assert.match(h.s.error, /v4 생성은 완료/)
  await h.confirm()
  assert.equal(h.calls.length, 1)
})

test('확인창을 연 뒤 다른 이벤트로 이동하면 원래 이벤트를 수정하지 않는다', async () => {
  const h = await setup()
  h.click()
  h.ui.serverEditor = { id: '8' }
  await h.confirm()
  assert.equal(h.calls.length, 0)
})

test('종료된 이벤트와 이미 최신인 버전은 실행하지 않는다', async () => {
  for (const mutate of [
    (s) => { s.event.status = 'ENDED' },
    (s) => { s.preview.versionId = 10 },
  ]) {
    const h = await setup()
    mutate(h.s)
    h.click()
    await h.confirm()
    assert.equal(h.calls.length, 0)
  }
})
