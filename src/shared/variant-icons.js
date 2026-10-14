/**
 * 영역 모양(v-*) 아이콘 — 직접 수정에서 모양을 이름 목록 대신 그림으로 고른다.
 *
 * ★ 서버 registry/Variant.java 의 이름과 짝이다. 여기 없는 모양은 아이콘 없이 이름 목록(select)으로 나온다 —
 *   모양을 새로 더해도 화면이 깨지지 않는다. 아이콘을 그린 영역은 제목·소개 · 혜택 · 참여 방법 · 참여 버튼이다.
 *
 * ★ 24×24 칸에 사각형으로 그린다. [x, y, w, h, 꼴]
 *   꼴  (없음) 옅게   d 진하게   l 아주 옅게(바탕)   o 테두리만   s 점선 테두리   p 알약(진하게)   c 동그라미(옅게)
 *   그 모양이 화면에서 어떻게 놓이는지 줄여 그렸다 (src/event-css/60-variants)
 */

const DEFAULT_ICON = [[3, 5, 18, 14, 's'], [7, 9, 10, 2], [8, 13, 8, 2]]

const GLYPHS = {
  // ── 제목 · 소개 ──
  'v-hero-center':        [[2, 4, 20, 16, 'l'], [6, 9, 12, 3, 'd'], [8, 14, 8, 2]],
  'v-hero-left':          [[2, 4, 20, 16, 'l'], [4, 9, 12, 3, 'd'], [4, 14, 8, 2]],
  'v-hero-minimal':       [[3, 7, 15, 4, 'd'], [3, 14, 9, 2]],
  'v-hero-poster':        [[2, 3, 20, 18, 'l'], [4, 6, 16, 5, 'd'], [4, 12, 12, 5, 'd']],
  'v-hero-outline':       [[2, 4, 20, 16, 'o'], [6, 9, 12, 3, 'd'], [8, 14, 8, 2]],
  'v-hero-split':         [[2, 6, 9, 3, 'd'], [2, 11, 7, 2], [13, 4, 9, 16, 'l'], [15, 8, 5, 2], [15, 12, 5, 2]],
  'v-hero-ticket':        [[4, 5, 16, 14, 'l'], [1, 10, 4, 4, 'c'], [19, 10, 4, 4, 'c'], [8, 9, 8, 3, 'd'], [9, 14, 6, 2]],
  'v-hero-gradient-text': [[3, 8, 7, 4, 'd'], [10, 8, 5, 4], [15, 8, 4, 4, 'l'], [5, 15, 12, 2]],
  'v-hero-glass':         [[2, 3, 20, 18, 'l'], [5, 6, 14, 12, 'o'], [8, 9, 8, 3, 'd'], [9, 14, 6, 2]],
  'v-hero-wave':          [[2, 3, 20, 12, 'l'], [2, 15, 5, 3, 'l'], [7, 15, 5, 5, 'l'], [12, 15, 5, 2, 'l'], [17, 15, 5, 4, 'l'], [6, 6, 12, 3, 'd'], [8, 11, 8, 2]],

  // ── 혜택 ──
  'v-benefits-list':      [[3, 4, 18, 4], [3, 10, 18, 4], [3, 16, 18, 4]],
  'v-benefits-grid':      [[3, 4, 8, 7], [13, 4, 8, 7], [3, 13, 8, 7], [13, 13, 8, 7]],
  'v-benefits-coupon':    [[3, 4, 18, 6, 's'], [3, 13, 18, 6, 's'], [6, 6, 8, 2], [6, 15, 8, 2]],
  'v-benefits-numbered':  [[3, 4, 4, 4, 'p'], [9, 5, 12, 2], [3, 10, 4, 4, 'p'], [9, 11, 12, 2], [3, 16, 4, 4, 'p'], [9, 17, 12, 2]],
  'v-benefits-spotlight': [[3, 3, 18, 9, 'd'], [3, 14, 8, 6], [13, 14, 8, 6]],
  'v-benefits-carousel':  [[1, 6, 4, 12, 'l'], [7, 5, 10, 14, 'd'], [19, 6, 4, 12, 'l'], [9, 21, 2, 1.5, 'd'], [13, 21, 2, 1.5]],
  'v-benefits-ticket':    [[3, 4, 3, 6, 'd'], [6, 4, 15, 6], [3, 13, 3, 6, 'd'], [6, 13, 15, 6]],
  'v-benefits-icon':      [[3, 4, 5, 5, 'c'], [10, 5.5, 11, 2], [3, 10.5, 5, 5, 'c'], [10, 12, 11, 2], [3, 17, 5, 5, 'c'], [10, 18.5, 11, 2]],
  'v-benefits-pricing':   [[2, 7, 6, 12], [9, 4, 6, 17, 'd'], [16, 7, 6, 12]],
  'v-benefits-checklist': [[3, 4, 3, 3, 'd'], [8, 4.5, 13, 2], [3, 10, 3, 3, 'd'], [8, 10.5, 13, 2], [3, 16, 3, 3, 'd'], [8, 16.5, 13, 2]],
  'v-benefits-stripe':    [[3, 4, 18, 4], [3, 8, 18, 4, 'l'], [3, 12, 18, 4], [3, 16, 18, 4, 'l']],
  'v-benefits-three-col': [[2, 5, 6, 14], [9, 5, 6, 14], [16, 5, 6, 14]],
  'v-benefits-bento':     [[2, 4, 11, 16, 'd'], [15, 4, 7, 7], [15, 13, 7, 7]],

  // ── 참여 방법 ──
  'v-steps-numbered':     [[3, 4, 4, 4, 'p'], [9, 5, 12, 2], [3, 10, 4, 4, 'p'], [9, 11, 12, 2], [3, 16, 4, 4, 'p'], [9, 17, 12, 2]],
  'v-steps-timeline':     [[5, 3, 1.5, 18], [3.5, 4, 4.5, 4, 'p'], [11, 5, 10, 2], [3.5, 10, 4.5, 4, 'p'], [11, 11, 10, 2], [3.5, 16, 4.5, 4, 'p'], [11, 17, 10, 2]],
  'v-steps-cards':        [[2, 6, 6, 12], [9, 6, 6, 12], [16, 6, 6, 12], [4, 8, 2, 2, 'd'], [11, 8, 2, 2, 'd'], [18, 8, 2, 2, 'd']],
  'v-steps-arrows':       [[2, 8, 5, 8], [9.5, 8, 5, 8], [17, 8, 5, 8], [7.5, 11.25, 1.5, 1.5, 'd'], [15, 11.25, 1.5, 1.5, 'd']],
  'v-steps-carousel':     [[1, 6, 4, 12, 'l'], [7, 5, 10, 14, 'd'], [19, 6, 4, 12, 'l'], [9, 21, 2, 1.5, 'd'], [13, 21, 2, 1.5]],
  'v-steps-progress':     [[3, 8, 18, 2, 'l'], [3, 8, 10, 2, 'd'], [3, 6.5, 5, 5, 'p'], [9.5, 6.5, 5, 5, 'p'], [16, 6.5, 5, 5, 'c'], [2, 15, 6, 2], [9, 15, 6, 2], [16, 15, 6, 2]],
  'v-steps-checklist':    [[3, 4, 4, 4, 'o'], [9, 5, 12, 2], [3, 10, 4, 4, 'o'], [9, 11, 12, 2], [3, 16, 4, 4, 'o'], [9, 17, 12, 2]],
  'v-steps-zigzag':       [[2, 3, 12, 5], [10, 9.5, 12, 5], [2, 16, 12, 5]],
  'v-steps-bubble':       [[2, 3, 14, 5, 'c'], [8, 9.5, 14, 5, 'c'], [2, 16, 14, 5, 'c']],
  'v-steps-minimal':      [[3, 3, 4, 5, 'd'], [9, 5, 12, 2], [3, 10, 4, 5, 'd'], [9, 12, 12, 2], [3, 17, 4, 5, 'd'], [9, 19, 12, 2]],

  // ── 참여 버튼 ──
  'v-cta-center':          [[6, 9, 12, 6, 'd']],
  'v-cta-wide':            [[2, 9, 20, 6, 'd']],
  'v-cta-pill':            [[5, 9, 14, 6, 'p']],
  'v-cta-banner':          [[2, 4, 20, 16, 'l'], [6, 10, 12, 5, 'd']],
  'v-cta-outline':         [[5, 9, 14, 6, 'o']],
  'v-cta-sticky':          [[3, 3, 18, 2, 'l'], [3, 7, 18, 2, 'l'], [3, 11, 12, 2, 'l'], [2, 16, 20, 5, 'd']],
  'v-cta-glow':            [[3, 6, 18, 12, 'l'], [5, 8, 14, 8], [7, 10, 10, 4, 'd']],
  'v-cta-gradient-border': [[4, 8, 16, 8, 'o'], [7, 11, 10, 2, 'd']],
  'v-cta-raised':          [[5, 8, 14, 6, 'd'], [5, 14, 14, 2.5]],
  'v-cta-arrow':           [[3, 9, 14, 6, 'd'], [18.5, 10.5, 3, 3, 'd']],
  'v-cta-dark':            [[2, 4, 20, 16, 'd'], [6, 10, 12, 5, 'l']],
}

const STYLE = {
  d: (r) => r('fill="currentColor"'),
  l: (r) => r('fill="currentColor" opacity=".16"'),
  o: (r) => r('fill="none" stroke="currentColor" stroke-width="1.5" opacity=".8"'),
  s: (r) => r('fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.5 2" opacity=".7"'),
  p: (r, h) => r('fill="currentColor"', h / 2),
  c: (r, h) => r('fill="currentColor" opacity=".42"', h / 2),
}

function draw(cells) {
  return '<svg class="lay-ico" viewBox="0 0 24 24" aria-hidden="true">' + cells.map(([x, y, w, h, kind]) => {
    const rect = (attrs, rx = 1) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" ' + attrs + '/>'
    return STYLE[kind] ? STYLE[kind](rect, h) : rect('fill="currentColor" opacity=".42"')
  }).join('') + '</svg>'
}

/** 그 모양의 아이콘. 빈 이름('')은 기본 모양이다. 그린 적 없는 모양이면 null */
function variantIcon(cssClass) {
  if (!cssClass) return draw(DEFAULT_ICON)
  return GLYPHS[cssClass] ? draw(GLYPHS[cssClass]) : null
}

/** 선택지 전부에 아이콘이 있는가 — 하나라도 없으면 그 영역은 이름 목록으로 보여 준다 */
const hasVariantIcons = (variants) => variants.length > 0 && variants.every((v) => !!GLYPHS[v.cssClass])

/** 아이콘 아래에 붙일 짧은 이름 — 칸이 좁아서 설명(desc)을 그대로 못 쓴다. 설명은 툴팁으로 나간다 */
const NAMES = {
  'v-hero-center': '가운데', 'v-hero-left': '왼쪽', 'v-hero-minimal': '미니멀', 'v-hero-poster': '포스터', 'v-hero-outline': '테두리',
  'v-hero-split': '좌우 분할', 'v-hero-ticket': '티켓', 'v-hero-gradient-text': '그라데이션', 'v-hero-glass': '유리', 'v-hero-wave': '물결',
  'v-benefits-list': '목록', 'v-benefits-grid': '2열 카드', 'v-benefits-coupon': '쿠폰', 'v-benefits-numbered': '번호',
  'v-benefits-spotlight': '첫 항목 강조', 'v-benefits-carousel': '캐러셀', 'v-benefits-ticket': '티켓', 'v-benefits-icon': '아이콘',
  'v-benefits-pricing': '요금표', 'v-benefits-checklist': '체크', 'v-benefits-stripe': '줄무늬', 'v-benefits-three-col': '3열 카드',
  'v-benefits-bento': '벤토',
  'v-steps-numbered': '번호', 'v-steps-timeline': '타임라인', 'v-steps-cards': '카드', 'v-steps-arrows': '화살표', 'v-steps-carousel': '캐러셀',
  'v-steps-progress': '진행 막대', 'v-steps-checklist': '체크', 'v-steps-zigzag': '지그재그', 'v-steps-bubble': '말풍선', 'v-steps-minimal': '미니멀',
  'v-cta-center': '가운데', 'v-cta-wide': '가로 꽉', 'v-cta-pill': '알약', 'v-cta-banner': '배너', 'v-cta-outline': '테두리',
  'v-cta-sticky': '하단 고정', 'v-cta-glow': '빛 번짐', 'v-cta-gradient-border': '그라데이션', 'v-cta-raised': '입체', 'v-cta-arrow': '화살표',
  'v-cta-dark': '어두운 상자',
}

const shortName = (cssClass, desc) => (cssClass ? NAMES[cssClass] || String(desc || '').split(/ — | \(|, | · /)[0].trim() : '기본')

export { variantIcon, hasVariantIcons, shortName }
