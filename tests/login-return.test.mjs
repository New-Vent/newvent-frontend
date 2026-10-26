import assert from 'node:assert/strict'
import test from 'node:test'
import { dropLoginReturnOn, rememberLoginReturn, takeLoginReturn } from '../src/user/login-return.js'

test('이벤트 상세에서 로그인으로 가면 그 이벤트를 기억하고, 로그인 뒤 한 번만 꺼낸다', () => {
  const ui = { route: 'event', activeId: '102' }
  rememberLoginReturn(ui)
  dropLoginReturnOn(ui, 'login')
  assert.deepEqual(takeLoginReturn(ui), { route: 'event', id: '102' })
  assert.equal(takeLoginReturn(ui), null)
})

test('내 혜택에서 가면 화면 이름만 기억한다', () => {
  const ui = { route: 'my', activeId: '7' }
  rememberLoginReturn(ui)
  assert.deepEqual(takeLoginReturn(ui), { route: 'my', id: undefined })
})

test('홈이나 로그인 화면에서 가면 아무것도 기억하지 않아 로그인 뒤 홈으로 간다', () => {
  for (const route of ['home', 'login', 'signup', 'account']) {
    const ui = { route, activeId: '1' }
    rememberLoginReturn(ui)
    assert.equal(takeLoginReturn(ui), null, route)
  }
})

test('로그인 화면 안에서 다시 눌러도 앞서 기억한 곳을 지우지 않는다', () => {
  const ui = { route: 'event', activeId: '5' }
  rememberLoginReturn(ui)
  ui.route = 'login'
  rememberLoginReturn(ui)
  assert.deepEqual(takeLoginReturn(ui), { route: 'event', id: '5' })
})

test('회원가입을 거쳐 로그인으로 와도 기억을 유지한다', () => {
  const ui = { route: 'event', activeId: '5' }
  rememberLoginReturn(ui)
  dropLoginReturnOn(ui, 'login')
  dropLoginReturnOn(ui, 'signup')
  dropLoginReturnOn(ui, 'login')
  assert.deepEqual(takeLoginReturn(ui), { route: 'event', id: '5' })
})

test('다른 화면으로 가면 기억을 버려 나중 로그인이 옛 이벤트로 끌고 가지 않는다', () => {
  for (const route of ['home', 'event', 'my', 'account']) {
    const ui = { route: 'event', activeId: '5' }
    rememberLoginReturn(ui)
    dropLoginReturnOn(ui, 'login')
    dropLoginReturnOn(ui, route)
    assert.equal(takeLoginReturn(ui), null, route)
  }
})
