# src/event-css — 이벤트 페이지 스타일 원본

여기 파일들을 **경로 순서대로 이어 붙여** `public/assets/event.css` 한 파일을 만든다.
게시 페이지 · 미리보기 iframe · 템플릿이 전부 `/assets/event.css` 를 링크한다.

- `npm run dev` · `npm run build` 가 자동으로 다시 만든다 (vite.config.js 의 `eventCss` 플러그인)
- 손으로 만들기: `npm run css`
- 원본과 결과가 같은지 확인: `npm run css:check` (CI · 커밋 전)
- **`public/assets/event.css` 는 직접 고치지 않는다** — 다음 빌드에서 덮인다

## 순서 = 캐스케이드

같은 특이도면 뒤에 온 규칙이 이긴다. 폴더 · 파일 번호가 그 순서를 정한다.

| 폴더 | 내용 | 왜 이 자리 |
|---|---|---|
| `00-tokens/` | `@import`(폰트) · `:root` 변수 | `@import` 는 맨 앞에서만 유효 (스크립트가 다른 파일의 @import 를 막는다) |
| `10-fallback/` | 백지 생성 블록 기본 모양 (`:where`, 특이도 0) | 무엇이든 덮을 수 있게 맨 앞 |
| `20-themes/` | 템플릿 테마 5종 (`theme-*` 변수) | |
| `30-base/` | 리셋 · 컨테이너 · 템플릿 공통 블록 · 토스트 · 반응형 | |
| `40-templates/` | 템플릿 5종 전용 (`.sp- .hl- .vp- .fs- .lc-`) · 반응형 · 상호작용 | |
| `50-blocks/` | 레지스트리 블록 기본 모양 — `01` highlight · intro · audience · faq · compare, `02` stats, `03` prize, `04` coupon, `05` schedule | 블록마다 한 파일 |
| `60-variants/` | 블록 변형 `.v-*` — `01`~`14` 블록마다 한 파일, `80-surface` 배경, `90-responsive` | **`80-surface` 는 블록 변형보다 뒤** — 배경이 변형의 배경을 덮는다 |
| `70-components/` | 마크업이 다른 컴포넌트 (아코디언 · 안내 상자 · 캐러셀 · 비교표 · 배지 `.t-*`) | 배경 변형보다 뒤 — 캐러셀 카드 배경이 이겨야 한다 |
| `90-palettes/` | `01` 기본 10종 · `02` 추가 8종 · `99` 어두운 팔레트 보정 | **테마(20) · 템플릿(40)보다 뒤** — 팔레트가 이겨야 한다 |
| `99-a11y/` | `prefers-reduced-motion` (흐르는 띠 · 빛나는 버튼 멈춤) | `!important` 라 자리는 무관. 찾기 쉽게 맨 끝 |

폴더 안 번호는 **두 자리**로 맞춘다 (`10-` 이 `9-` 앞에 정렬되지 않게).
새 블록 변형은 `60-variants/15-…` 처럼 **80 보다 앞 번호**로 만든다.

## 백엔드 레지스트리와 짝

| CSS | 백엔드 | 추가할 때 |
|---|---|---|
| `60-variants/NN-블록.css` · `70-components/06-compare.css` 의 `.v-*` | `registry/Variant.java` | 양쪽에 같은 이름 |
| `90-palettes/*.css` 의 `.palette-*` | `registry/Palette.java` | 변수 11개(primary · hover · light · glow · gradient-hero · gradient-cta · accent-tag · bg · surface · surface-subtle · border), 어두우면 text-* 3개 + `99-dark-fixes` |
| `70-components/02-inline.css` 의 `.t-*` | `registry/Inline.java` | |
| `50-blocks/NN-블록.css` | `registry/Block.java` | 새 블록의 기본 모양 (= 기본 변형의 모양) |

저장소가 달라 이름이 어긋나도 테스트가 못 잡는다. 이름을 바꾸면 양쪽을 같이 고친다.
레지스트리에만 있고 CSS 가 없는 이름은 **기본 모양과 같은 기본 변형**이다 (예: `v-stats-grid`, `palette-base`).

디자인 출처: Bootstrap(jumbotron · alert · card · pricing · table · accordion-flush) · HyperUI · Preline · Flowbite · DaisyUI.
Tailwind 유틸리티를 그대로 쓰지 않고 이름 붙은 class 로 옮겼다 — 이벤트 페이지에는 Tailwind 가 없고, 모델이 고르는 이름은 검증 가능해야 한다.

## 규칙

- 변형(`.v-*`)은 `[data-block="…"]...:not(.ev-block)` 로 건다 — 템플릿 블록에는 걸리지 않게
- JS 가 필요한 모양은 넣지 않는다 — 생성 결과에는 script 가 없다
- 움직이는 모양(흐르는 띠 · 빛나는 버튼)은 `99-a11y` 에서 멈춘 상태를 같이 정한다
- 분리할 때(2026-10-01) 옛 단일 파일과 **규칙 498개가 같고**, 순서만 두 군데(팔레트 · reduced-motion 을 맨 뒤로) 바뀌었다.
  템플릿 5종 · 변형 조합 11종 × 720/375px 에서 계산된 스타일 차이 0 을 확인했다.
  변형 추가(같은 날) 뒤에도 기존 변형 · 템플릿은 차이 0 이다
