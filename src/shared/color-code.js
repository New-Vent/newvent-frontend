/**
 * 색 코드 — 16진수(#rrggbb)와 R · G · B 를 서로 바꾼다.
 * 직접 수정의 색 칸(제목 · 참여 버튼 디자인)이 브라우저의 색 고르기와 같이 코드를 직접 쓰게 하려고 만들었다.
 *
 * ★ 서버는 #rrggbb 여섯 자리만 받는다(TextFormat · ButtonStyle). 여기서 만드는 값은 늘 그 모양이다.
 * ★ 쓰는 도중(#12, R 칸에 3)은 아직 색이 아니다 — null 을 돌려줘서 호출한 쪽이 상태를 건드리지 않게 한다.
 */

/**
 * '#aabbcc' · 'AABBCC' → '#aabbcc'. 못 읽으면 null.
 * short 를 켜면 3자리('#abc' → '#aabbcc')도 읽는다 — 입력을 마친 뒤에만 켠다.
 * 쓰는 중에 3자리를 늘려 버리면 여섯 자리를 못 쓴다('#abc' 가 '#aabbcc' 로 바뀌어 버린다).
 */
export function parseHex(text, { short = false } = {}) {
  const t = String(text ?? '').trim()
  const six = /^#?([0-9a-f]{6})$/i.exec(t)
  if (six) return '#' + six[1].toLowerCase()
  const three = short && /^#?([0-9a-f]{3})$/i.exec(t)
  if (three) return '#' + [...three[1].toLowerCase()].map((c) => c + c).join('')
  return null
}

/** '#aabbcc' → { r, g, b } (0~255). 못 읽으면 null */
export function hexToRgb(hex) {
  const h = parseHex(hex)
  if (!h) return null
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }
}

/**
 * R · G · B → '#rrggbb'. 0~255 의 정수 세 개가 아니면 null (빈 칸 · 소수 · 범위 밖).
 * 문자열도 받는다 — 입력 칸의 값을 그대로 넘긴다.
 */
export function rgbToHex(r, g, b) {
  const parts = [r, g, b].map((v) => (/^\d{1,3}$/.test(String(v ?? '').trim()) ? Number(v) : NaN))
  if (parts.some((n) => !(n >= 0 && n <= 255))) return null
  return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('')
}
