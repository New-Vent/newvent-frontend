import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureServerEvent, isUpcomingEvent } from '../src/user/event-loading.js'

test('조회 실패 후 다시 그려도 자동 재요청하지 않고 명시적 재시도는 허용한다', async () => {
  const state = {}
  let requests = 0
  const load = async () => { requests++; throw new Error('지금은 접근할 수 없는 이벤트입니다.') }
  const render = () => ensureServerEvent(state, 1, load, render)
  render()
  await new Promise(setImmediate)
  assert.equal(requests, 1)
  assert.equal(state.serverEventState, 'error')
  assert.equal(state.serverEventError, '지금은 접근할 수 없는 이벤트입니다.')
  state.serverEventState = null
  render()
  await new Promise(setImmediate)
  assert.equal(requests, 2)
})

test('이벤트 전환 후 늦게 도착한 이전 응답은 화면을 덮어쓰지 않는다', async () => {
  const state = {}
  let finish
  ensureServerEvent(state, 1, () => new Promise(resolve => { finish = resolve }), () => {})
  ensureServerEvent(state, 2, async () => ({ id: 2 }), () => {})
  await new Promise(setImmediate)
  finish({ id: 1 })
  await new Promise(setImmediate)
  assert.equal(state.serverEvent.id, 2)
  assert.equal(state.serverEventState, 'done')
})

test('시작 시각 직전만 오픈 예정이고 시작 시각부터 참여 화면을 연다', () => {
  const start = Date.parse('2026-10-20T00:00:00+09:00')
  const event = { startDate: '2026-10-20T00:00:00+09:00' }
  assert.equal(isUpcomingEvent(event, start - 1), true)
  assert.equal(isUpcomingEvent(event, start), false)
  assert.equal(isUpcomingEvent(event, start + 1), false)
  assert.equal(isUpcomingEvent({}, start), false)
})
