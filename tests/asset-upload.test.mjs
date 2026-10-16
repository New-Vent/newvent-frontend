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
  const uploaded = [], removed = [], messages = [], edited = []
  const bindings = {
    BLOCK_LABELS, PINNED_BLOCKS: ['notices', 'cta'], $: () => null, esc: String,
    badgeOf: () => '', serverStatus: () => '', GRADES: [], gradeLabel: () => '', REQUEST_MAX: 500,
    icon: () => '', serverFrame: () => '',
    collectTexts: () => [], matches: () => false, normalize: (v) => String(v ?? '').trim(), textsOf: () => [],
    cancelGeneration: async () => {}, generationStatus: async () => ({}), endEvent: async () => ({}),
    loadAdminEvent: async () => s.event, loadPreview: async () => s.preview,
    loadVersions: async () => ({ versions: [] }), loadAssets: async () => s.assets,
    publishEvent: async () => ({}), saveCheckpoint: async () => ({}), updateEventInfo: async () => ({}),
    startEdit: async () => ({}), startGenerate: async () => ({}), directEdit: async (...args) => { edited.push(args); return { versionNo: 9 } },
    uploadAsset: async (...args) => {
      uploaded.push(args)
      if (upload) return upload()
      return { assetId: 'a2', url: 'https://cdn.test/a2.png', bytes: 2048 }
    },
    deleteAsset: async (...args) => { removed.push(args); if (remove) return remove() },
    ui, button: () => '', closeModal: () => {}, modal: () => {},
    resetAdminServer: () => {}, toast: (m) => messages.push(m),
    // ★★ server-editor 가 import 하는 이름은 **하나도 빠짐없이** 여기 있어야 한다.
    //   빠지면 link 가 터지고 이 파일의 테스트가 **전부** SyntaxError 로 떨어진다 —
    //   실제로 그랬다: 다른 작업이 LAYOUTS 를 import 하면서 여기 8개가 통째로 빨개졌다.
    //   아래 "import 한 이름이 전부 묶여 있다" 테스트가 다음엔 이유를 말해 준다.
    LAYOUTS: [], STACK: 'layout-stack', layoutPicks: () => '', markPick: () => {},
    hasVariantIcons: () => false, shortName: (k) => k, variantIcon: () => '',
    loadChatMessages: async () => [], searchRagPreview: async () => ({}),
    loadPromptDrafts: async () => [],
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
  return { s, uploaded, removed, messages, edited, pick, settle, module, source, bound: Object.keys(bindings) }
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

/**
 * ★★ 이 파일이 통째로 빨개지는 유일한 원인을 먼저 잡는다.
 *
 *   server-editor.js 에 import 가 하나 늘면 위 bindings 에도 그 이름이 있어야 한다.
 *   없으면 SyntheticModule 이 그 export 를 못 내주고 **link 단계에서** 터져서,
 *   "파일을 고르면 올리고 목록에 더한다" 같은 멀쩡한 테스트가 다 SyntaxError 로 죽는다.
 *   그때 메시지는 "does not provide an export named 'LAYOUTS'" 뿐이라 원인을 찾느라 시간을 쓴다.
 *
 *   이 테스트는 **무엇이 빠졌는지 이름으로** 말해 준다.
 */
test('★ server-editor 가 import 한 이름이 전부 테스트에 묶여 있다', async () => {
  const source = await readFile(new URL('../src/admin/views/server-editor.js', import.meta.url), 'utf8')
  const bound = new Set((await setup()).bound)
  const missing = []
  // import { a, b as c } from '...'  — 기본·전체 import 는 쓰지 않는다
  for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (name && !bound.has(name)) missing.push(name)
    }
  }
  assert.deepEqual(missing, [], 'bindings 에 없는 import: ' + missing.join(', '))
})

/* ── 번호 고정 · 접기 ──────────────────────────────────────────── */

/**
 * ★★ 제보: 1번을 쓰고 썸네일에서 지우고 다른 사진을 올리면 그게 1번이 됐다.
 *   "1번 이미지를 배경으로" 가 다른 사진을 가리키게 되고 관리자는 그걸 모른다.
 *   번호는 서버가 행에 박아 준다(EventAsset.seq) — 화면은 그걸 그대로 쓴다.
 */
test('★ 번호는 목록 순서가 아니라 서버가 준 seq 다', async () => {
  const h = await setup()

  assert.ok(h.source.includes('a.seq ?? i + 1'), 'assetNo 가 seq 를 먼저 봐야 합니다')
  // ★ 번호를 쓰는 자리는 전부 assetNo 를 거쳐야 한다. (i + 1) 이 남아 있으면 또 밀린다
  const strip = h.source.slice(h.source.indexOf('function assetStrip'),
    h.source.indexOf('function directPanel'))
  assert.ok(!strip.includes('i + 1'), 'assetStrip 안에 i + 1 이 남아 있습니다')
  assert.ok(strip.includes('assetNo('), 'assetStrip 이 assetNo 를 써야 합니다')
})

/**
 * ★★ 제보: 적용한 뒤에도 썸네일이 계속 보여서 입력칸 위가 사진으로 막혔다.
 *   그렇다고 목록에서 빼면 "1번 이미지 지워줘" 를 쓸 수 없다 —
 *   번호는 살리고 자리만 비운다. 배지를 누르면 그 사진만 다시 펼친다.
 */
test('★ 들어간 사진 배지를 누르면 펼치고 또 누르면 접는다', async () => {
  const h = await setup()
  const click = (id) => h.module.namespace.handleServerClick(
    'server-asset-peek', { dataset: { id } }, () => {})

  assert.equal(h.s.assetPeek, undefined)
  assert.equal(click('a1'), true)
  assert.equal(h.s.assetPeek, 'a1')
  // 같은 걸 또 누르면 접는다
  click('a1')
  assert.equal(h.s.assetPeek, null)
  // 다른 걸 누르면 그쪽으로 옮긴다 — 한 번에 하나만 펼친다
  click('a1'); click('a2')
  assert.equal(h.s.assetPeek, 'a2')
})

// ★ 펼쳐 둔 사진을 지우면 그 상태도 지운다 — 없는 id 가 남아 있으면 안 된다
test('펼쳐 둔 사진을 지우면 접은 상태도 정리한다', async () => {
  const h = await setup()
  h.s.assetPeek = 'a1'

  h.module.namespace.handleServerClick('server-asset-delete', { dataset: { id: 'a1' } }, () => {})
  await h.settle()

  assert.equal(h.s.assetPeek, null)
  assert.equal(h.s.assets.length, 0)
})

/**
 * ★★ 제보: 썸네일 × 로 먼저 지우고 "1번 이미지 없애줘" 했더니
 *   "아직 올린 이미지가 없어요" 가 나왔다. 행은 사라졌는데 페이지의 <img> 는 남아서
 *   **뺄 방법이 사라졌다.** 쓰고 있는 사진은 못 지우게 막고 순서를 알려 준다.
 */
test('★ 페이지가 쓰고 있는 사진은 못 지운다', async () => {
  const h = await setup()
  h.s.preview.html = HTML.replace('</h1>', '</h1><img class="ev-asset ev-asset-bg" src="https://cdn.test/a1.png">')

  h.module.namespace.handleServerClick('server-asset-delete', { dataset: { id: 'a1' } }, () => {})
  await h.settle()

  assert.equal(h.removed.length, 0, '서버에 삭제 요청이 가면 안 됩니다')
  assert.equal(h.s.assets.length, 1, '목록에 그대로 있어야 합니다')
  // ★ 막기만 하면 관리자는 왜 안 되는지 모른다. 다음에 할 일을 같이 말해 준다
  assert.ok(h.messages.some((m) => m.includes('번 이미지 지워줘')), h.messages.join(' | '))
})

// ★ 안 쓰는 사진은 전처럼 바로 지워진다
test('페이지에 없는 사진은 그대로 지워진다', async () => {
  const h = await setup()

  h.module.namespace.handleServerClick('server-asset-delete', { dataset: { id: 'a1' } }, () => {})
  await h.settle()

  assert.equal(h.removed.length, 1)
  assert.equal(h.s.assets.length, 0)
})

/* ── 제목 글자 크기 · 색 (직접 수정) ────────────────────────── */

/**
 * ★★ 글자 크기 · 색은 **CSS 가 쥐고 있어서** 모델이 못 바꾼다.
 *   모델에게 시키면 "강조했습니다" 라고 보고하고 화면은 그대로다(실측).
 *   그래서 관리자가 고른 값을 서버가 인라인 style 로 박는다 — 여기는 그 길이 이어지는지 본다.
 */
test('★ 고른 제목 디자인만 요청에 담긴다', async () => {
  const h = await setup()
  h.s.preview.editableTexts = []
  h.s.direct.style = { titleColor: '#15803d', titleSize: 'large', headingColor: '#111111' }
  // ★ 색은 체크를 해야 들어간다. headingColor 는 체크를 안 했으니 빠져야 한다
  h.s.direct.styleOn = { titleColor: true }

  h.module.namespace.handleServerClick('server-direct-apply', { dataset: {} }, () => {})
  await h.settle()

  assert.equal(h.edited.length, 1, '직접 수정 요청이 가야 합니다')
  const body = h.edited[0][1]
  assert.deepEqual(body.textStyle, { titleColor: '#15803d', titleSize: 'large' })
})

// ★★ 아무것도 안 고르면 textStyle 을 보내지 않는다. 빈 값을 보내면 인라인 style 이 박혀서
//   그 제목만 팔레트를 안 따라간다 — 비움이 "테마를 따른다" 는 뜻이다
test('★ 제목 디자인을 안 고르면 textStyle 을 안 보낸다', async () => {
  const h = await setup()
  h.s.preview.editableTexts = []
  h.s.direct.style = { titleColor: '#15803d' }
  h.s.direct.styleOn = {}

  h.module.namespace.handleServerClick('server-direct-apply', { dataset: {} }, () => {})
  await h.settle()

  // 바꾼 게 하나도 없으니 요청 자체가 안 간다
  assert.equal(h.edited.length, 0)
  assert.ok(h.messages.some((m) => m.includes('바꾼 내용이 없어요')), h.messages.join(' | '))
})

/**
 * ★★ 제보: "직접수정에서 제목 디자인을 바꿔도 미리보기에 적용 안 됨".
 *   미리보기만의 문제가 아니었다 — updateDirectCount 가 textStyle 을 **안 세서**
 *   "바꾼 항목 없음" 이 뜨고 **저장 버튼이 disabled 로 남았다.** 저장 자체가 안 됐다.
 */
test('★ 제목 디자인만 바꿔도 바뀐 항목으로 센다', async () => {
  const h = await setup()
  h.s.preview.editableTexts = []
  h.s.direct.style = { titleSize: 'large' }
  h.s.direct.styleOn = {}

  const { textStyle } = h.module.namespace.__directChanges
    ? h.module.namespace.__directChanges(h.s)
    : { textStyle: null }

  // ★ directChanges 는 안 내보내므로 저장 경로로 확인한다 — 요청이 가면 센 것이다
  h.module.namespace.handleServerClick('server-direct-apply', { dataset: {} }, () => {})
  await h.settle()

  assert.equal(h.edited.length, 1, '제목 크기만 바꿔도 저장 요청이 가야 합니다')
  assert.deepEqual(h.edited[0][1].textStyle, { titleSize: 'large' })
})

// ★ 미리보기에 바로 보이는 길이 있어야 한다. 저장해야만 보이면 맞는지 알 수가 없다
test('★ 제목 디자인 미리보기 함수가 있다', async () => {
  const h = await setup()

  assert.ok(h.source.includes('function previewTextStyle'), 'previewTextStyle 이 있어야 합니다')
  // 서버(applyTextStyle)와 같은 값을 써야 한다 — 어긋나면 미리보기와 저장 결과가 다르다
  for (const px of ['28px', '36px', '46px', '58px', '18px', '22px', '27px', '32px']) {
    assert.ok(h.source.includes(px), px + ' 가 미리보기 표에 있어야 합니다')
  }
  // ★ 투명 글자 수법을 쓰는 변형도 이겨야 한다
  assert.ok(h.source.includes('-webkit-text-fill-color'))
  // 고르는 자리마다 미리보기를 다시 그린다
  assert.ok(h.source.includes('previewButtonStyle(s)\n    previewTextStyle(s)'))
})
