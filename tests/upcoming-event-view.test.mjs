import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { isUpcomingEvent } from '../src/user/event-loading.js'

async function setup(logged) {
  const frames = []
  const ui = { logged, serverEventState: 'done', serverEvent: {
    id: 1, title: '오픈 예정 이벤트', publishedHtml: '<section>행사 소개</section>',
    startDate: '2099-10-20T00:00:00+09:00', endDate: '2099-10-30T00:00:00+09:00',
  } }
  const bindings = {
    ui, USE_SERVER: true, isUpcomingEvent, esc: String, icon: () => '', shortDate: String,
    button: (action, text) => `<button data-action="${action}">${text}</button>`,
    serverFrame: (html, title, mode) => { frames.push(mode); return html },
    participationAccess: () => {}, DEMO_DATE: '', deadline: () => '', policyLabel: () => '',
    statusBadge: () => '', fullFrame: () => '', currentEvent: () => {},
    currentParticipation: () => {}, published: () => {},
  }
  const module = new SourceTextModule(await readFile(new URL('../src/user/views/event.js', import.meta.url), 'utf8'))
  await module.link(() => new SyntheticModule(Object.keys(bindings), function () {
    for (const [key, value] of Object.entries(bindings)) this.setExport(key, value)
  }))
  await module.evaluate()
  return { ui, frames, view: () => module.namespace.eventView() }
}

for (const logged of [false, true]) {
  test(`시작 전에는 로그인 여부(${logged})와 관계없이 본문을 보여주고 참여를 막는다`, async () => {
    const h = await setup(logged)
    const html = h.view()
    assert.match(html, /행사 소개/)
    assert.match(html, /오픈 예정/)
    assert.match(html, /disabled>시작 전에는 참여할 수 없어요/)
    assert.doesNotMatch(html, /id="participate-form"/)
    assert.deepEqual(h.frames, ['readonly'])
  })
}

test('상세 오류는 로딩 문구 대신 오류와 재시도 버튼을 표시한다', async () => {
  const h = await setup(false)
  h.ui.serverEventState = 'error'
  h.ui.serverEventError = '조회 실패'
  const html = h.view()
  assert.match(html, /조회 실패/)
  assert.match(html, /data-action="reload-event"/)
  assert.doesNotMatch(html, /불러오는 중/)
})
