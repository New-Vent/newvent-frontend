/**
 * 페이지 배치(layout-*) — 관리자가 화면에서 고르는 목록과 아이콘.
 *
 * ★ 서버 registry/Layout.java 와 짝이다. 이름(class)과 최소 영역 수가 같아야 한다.
 *   편집 화면은 미리보기 응답의 looks 를 쓴다 — 지금 페이지에서 못 고르는 것과 그 이유를 서버가 준다.
 *   여기 목록은 **아직 페이지가 없는 생성 화면**과 아이콘 · 짧은 이름에만 쓴다.
 *
 * ★ 아이콘은 24×24 칸에 사각형으로 그린다. 맨 위 진한 칸이 제목(hero), 옅은 칸이 내용 영역이다.
 *   배치가 영역을 어떻게 놓는지 그대로 줄여 그렸다 (src/event-css/80-layouts/01-layouts.css)
 */

/** [x, y, w, h] — 첫 칸은 hero(진하게) */
const GLYPHS = {
  'layout-stack':    [[2, 2, 20, 5], [2, 9, 20, 3.5], [2, 14, 20, 3.5], [2, 19, 20, 3]],
  'layout-bento':    [[2, 2, 20, 5], [2, 9, 12, 6], [16, 9, 6, 6], [2, 17, 6, 5], [10, 17, 12, 5]],
  'layout-split':    [[2, 2, 9, 11], [13, 2, 9, 11], [2, 15, 20, 3], [2, 20, 20, 2]],
  'layout-wide':     [[2, 2, 20, 5], [2, 9, 9, 6], [13, 9, 9, 6], [2, 17, 9, 5], [13, 17, 9, 5]],
  'layout-three':    [[2, 2, 20, 5], [2, 9, 5.5, 6], [9.25, 9, 5.5, 6], [16.5, 9, 5.5, 6], [2, 17, 5.5, 5], [9.25, 17, 5.5, 5], [16.5, 17, 5.5, 5]],
  'layout-magazine': [[2, 2, 20, 5], [2, 9, 20, 6], [2, 17, 9, 5], [13, 17, 9, 5]],
  'layout-zigzag':   [[2, 2, 20, 5], [2, 9, 14, 3.5], [8, 14, 14, 3.5], [2, 19, 14, 3]],
  'layout-full':     [[0, 2, 24, 6], [0, 9.5, 24, 3.5], [0, 14.5, 24, 3.5], [0, 19.5, 24, 2.5]],
  'layout-focus':    [[6, 2, 12, 5], [6, 9, 12, 3.5], [6, 14, 12, 3.5], [6, 19, 12, 3]],
  'layout-masonry':  [[2, 2, 20, 5], [2, 9, 9, 7], [13, 9, 9, 4], [13, 15, 9, 7], [2, 18, 9, 4]],
  'layout-timeline': [[2, 2, 20, 5], [11.5, 8, 1, 14], [2, 9, 8, 4], [14, 13.5, 8, 4], [2, 18, 8, 4]],
  'layout-l-shape':  [[2, 2, 20, 5], [2, 9, 11, 13], [15, 9, 7, 3.5], [15, 14, 7, 3.5], [15, 19, 7, 3]],
  'layout-cta-rail': [[2, 2, 20, 5], [2, 9, 13, 3.5], [2, 14, 13, 3.5], [2, 19, 13, 3], [17, 9, 5, 6]],
}

/** 생성 화면의 선택지 — min 은 이 배치가 걸리려면 있어야 하는 내용 영역 수 (Layout.minContentBlocks) */
const LAYOUTS = [
  { cssClass: 'layout-stack', label: '세로 한 줄', hint: '영역을 위에서 아래로 쌓아요. 기본이에요.', min: 0 },
  { cssClass: 'layout-bento', label: '벤토', hint: '크기가 다른 칸으로 나란히 놓아요.', min: 4 },
  { cssClass: 'layout-split', label: '좌우 분할', hint: '첫 화면을 좌우로 나눠요.', min: 2 },
  { cssClass: 'layout-wide', label: '넓은 2열', hint: '영역을 두 줄로 나란히 놓아요.', min: 2 },
  { cssClass: 'layout-three', label: '3열', hint: '영역을 세 줄로 나란히 놓아요.', min: 3 },
  { cssClass: 'layout-magazine', label: '매거진', hint: '첫 영역을 크게, 나머지는 두 줄로 놓아요.', min: 3 },
  { cssClass: 'layout-zigzag', label: '지그재그', hint: '영역을 좌우로 번갈아 놓아요.', min: 2 },
  { cssClass: 'layout-full', label: '풀블리드', hint: '영역마다 화면 폭을 끝까지 써요.', min: 0 },
  { cssClass: 'layout-focus', label: '포커스', hint: '폭을 좁혀 가운데 한 줄로 놓아요.', min: 0 },
  { cssClass: 'layout-masonry', label: '벽돌', hint: '높이가 다른 칸을 2단에 빈틈없이 쌓아요.', min: 3 },
  { cssClass: 'layout-timeline', label: '타임라인', hint: '가운데 선을 두고 영역을 좌우로 번갈아 놓아요.', min: 2 },
  { cssClass: 'layout-l-shape', label: 'L자', hint: '대표 영역을 왼쪽에 길게, 나머지는 오른쪽에 쌓아요.', min: 3 },
  { cssClass: 'layout-cta-rail', label: '참여 레일', hint: '참여 버튼을 오른쪽 칸에 두고 따라오게 해요.', min: 1 },
]

const STACK = 'layout-stack'

function layoutIcon(cssClass) {
  const cells = GLYPHS[cssClass] || GLYPHS[STACK]
  return '<svg class="lay-ico" viewBox="0 0 24 24" aria-hidden="true">'
    + cells.map(([x, y, w, h], i) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h
      + '" rx="1" fill="currentColor"' + (i ? ' opacity=".42"' : '') + '/>').join('') + '</svg>'
}

const attr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * 배치 고르기 — 아이콘 버튼 줄.
 * @param {string} act data-act (누르면 main.js 의 click 위임으로 간다)
 * @param {string} current 지금 고른 class
 * @param {{cssClass:string,label:string,title?:string,blocked?:string|null,icon?:string}[]} options
 *   blocked 가 있으면 흐리게 그린다. disabled 로 막지 않는다 — 눌렀을 때 이유를 알려 줘야 한다
 */
function layoutPicks(act, current, options, busy = false) {
  return '<div class="lay-picks" role="group" aria-label="페이지 배치">' + options.map((o) => {
    const on = o.cssClass === current
    return '<button type="button" class="lay-pick' + (on ? ' active' : '') + (o.blocked ? ' blocked' : '') + '" data-act="' + act
      + '" data-layout="' + attr(o.cssClass) + '" aria-pressed="' + on + '"' + (o.blocked ? ' aria-disabled="true"' : '')
      + ' title="' + attr(o.blocked || o.title || o.label) + '"' + (busy ? ' disabled' : '') + '>'
      + (o.icon || layoutIcon(o.cssClass)) + '<span>' + attr(o.label) + '</span></button>'
  }).join('') + '</div>'
}

/** 다시 그리지 않고 고른 표시만 옮긴다 — 입력 포커스 · 미리보기를 건드리지 않는다 */
function markPick(container, current) {
  container?.querySelectorAll('.lay-pick').forEach((b) => {
    const on = b.dataset.layout === current
    b.classList.toggle('active', on)
    b.setAttribute('aria-pressed', String(on))
  })
}

export { LAYOUTS, STACK, layoutIcon, layoutPicks, markPick }
