import assert from 'node:assert/strict'
import test from 'node:test'
import { hexToRgb, parseHex, rgbToHex } from '../src/shared/color-code.js'

test('16진수: # 가 있든 없든, 대문자든 소문자든 #rrggbb 소문자로 맞춘다', () => {
  assert.equal(parseHex('#1D4ED8'), '#1d4ed8')
  assert.equal(parseHex('1d4ed8'), '#1d4ed8')
  assert.equal(parseHex('  #0284C7  '), '#0284c7')
})

test('쓰는 중인 값은 색이 아니다 — 여섯 자리가 되기 전에는 null', () => {
  for (const v of ['', '#', '#1', '#12', '#12345', '#1234567', '#gggggg', '12 34 56', null, undefined]) {
    assert.equal(parseHex(v), null, JSON.stringify(v))
  }
})

test('3자리는 입력을 마친 뒤(short)에만 늘린다 — 쓰는 중에 늘리면 여섯 자리를 못 쓴다', () => {
  assert.equal(parseHex('#abc'), null)
  assert.equal(parseHex('#abc', { short: true }), '#aabbcc')
  assert.equal(parseHex('F80', { short: true }), '#ff8800')
  assert.equal(parseHex('#abcd', { short: true }), null)
})

test('16진수 → R G B', () => {
  assert.deepEqual(hexToRgb('#1d4ed8'), { r: 29, g: 78, b: 216 })
  assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 })
  assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 })
  assert.equal(hexToRgb('#12'), null)
})

test('R G B → 16진수: 0~255 정수만, 한 자리 값은 0 을 채운다', () => {
  assert.equal(rgbToHex(29, 78, 216), '#1d4ed8')
  assert.equal(rgbToHex('0', '5', '255'), '#0005ff')
  assert.equal(rgbToHex(' 7 ', '7', '7'), '#070707')
})

test('R G B: 빈 칸 · 범위 밖 · 소수 · 글자는 색이 아니다', () => {
  for (const bad of [['', '0', '0'], ['256', '0', '0'], ['-1', '0', '0'], ['1.5', '0', '0'], ['a', '0', '0'], [null, 0, 0], ['1000', '0', '0']]) {
    assert.equal(rgbToHex(...bad), null, JSON.stringify(bad))
  }
})

test('왕복: 16진수 → R G B → 16진수 가 제자리로 돌아온다', () => {
  for (const hex of ['#0284c7', '#f2b705', '#000000', '#ffffff', '#1d4ed8']) {
    const { r, g, b } = hexToRgb(hex)
    assert.equal(rgbToHex(r, g, b), hex)
  }
})
