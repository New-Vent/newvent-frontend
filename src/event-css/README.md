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
| `90-palettes/` | `01` 기본 10종 · `02` 추가 8종 · `97` 어두운 템플릿(theme-sale)의 중성색 복원 · `99` 어두운 팔레트 보정 | **테마(20) · 템플릿(40)보다 뒤** — 팔레트가 이겨야 한다 |
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

## 템플릿 테마와 포인트색 (#207)

팔레트가 템플릿 페이지에서도 먹히게 하는 작업(`New-Vent/newvent-backend#207`)의 기준 문서다. 아래 표는 `src/event-css/` 를 읽어 뽑은 값이다 (2026-10-13).

### 테마 분류

| 테마 | 바탕 | 카드 | 글자 | 분류 | 바탕을 정한 곳 |
| --- | --- | --- | --- | --- | --- |
| sports | `#f8fafc` | `#ffffff` | `#0f172a` | **밝음** | `:root` 기본 |
| holiday | `#faf6f0` | `#fdfbf7` | `#0f172a` | **밝음** | `40-templates/02-holiday.css` |
| vip | `#f9f9f8` | `#ffffff` | `#0f172a` | **밝음** | `40-templates/03-vip.css` |
| sale | `#09090b` | `#121215` | `#f4f4f5` | **어두움** | `40-templates/04-sale.css` |
| launch | `#f8fafc` | `#ffffff` | `#0f172a` | **밝음** | `40-templates/05-launch.css` |

팔레트(90)는 바탕 · 카드 · 테두리를 덮어쓴다. 템플릿과 어긋나는 곳은 두 파일이 맞춘다.

- 어두운 템플릿(sale)에 밝은 팔레트를 붙일 때 — `90-palettes/97-template-neutrals.css`
- 밝은 템플릿에 어두운 팔레트(night · esports)를 붙일 때 — `90-palettes/99-dark-fixes.css`

### 토큰 값이 둘로 갈라진 곳

- `.theme-sale` 의 `--ev-primary` · `-hover` · `-light` · `-glow` · `--ev-gradient-cta` 는 `20-themes/01-template-themes.css` 에 코랄(`#ff4757` …)로 적혀 있지만, `40-templates/07-refinements.css` 가 네온 라임(`#ccff00` …)으로 다시 덮는다. 화면에 보이는 값은 뒤쪽이고, 앞쪽의 코랄 값은 어디에도 나타나지 않는다.
- `--ev-gradient-hero`(`#2f3542 → #ff4757`)와 `--ev-accent-tag`(`#ffa502`)는 덮이지 않고 남아 있다.

### 템플릿 CSS 의 포인트색 현황

6자리 · 3자리 hex 만 센 **치환 전** 값이다 (`rgba()` 와 그라데이션 안의 값은 따로 봐야 한다). 치환한 템플릿은 아래 「치환 현황」을 본다. 중성색(slate · gray · zinc 계열, 흰색, 검정, 아주 밝거나 어두운 면)은 제외했다.

| 템플릿 | hex (고유) | 테마 토큰과 **같은** 포인트색 | 테마 토큰과 **다른** 포인트색 |
| --- | --- | --- | --- |
| sports | 32 (14) | `#dc2626` ×4 (`primary`) | `#ef4444` ×7 · `#991b1b` ×1 (그라데이션 일부로 보이나 확인 필요), `#1e1b4b` ×1 |
| holiday | 19 (14) | 없음 (`#f59e0b` ×1 은 `gradient-cta` 일부) | `#fde68a` ×2, `#fef08a`, `#dc2626`, `#3d1627` · `#2c1220` (와인색 바탕), `#1b4332` (초록 바탕) |
| vip | 25 (15) | 없음 | **`#cca43b` ×6** (테마 `primary` 는 `#ca8a04`), `#b45309`, `#fef08a` |
| sale | 38 (14) | `#ccff00` ×9, `#b8e600` ×1 | 없음 |
| launch | 44 (20) | 없음 | **`#2563eb` ×5, `#38bdf8` ×4** (테마 `primary` 는 청록 `#06b6d4`), `#172554`, `#ef4444`, `#f59e0b`, `#10b981`, `#1e3a8a`, `#1d4ed8` |

hex 가 테마 토큰 값과 같은 곳은 sale 뿐이다. 나머지는 템플릿이 실제로 쓰는 색과 테마의 `--ev-primary` 가 다르다. 그대로 `var(--ev-primary)` 로 바꾸면 팔레트 없이도 기본 모양이 바뀐다.

### 방침: 템플릿 전용 포인트색 토큰

1. 바꾸는 것은 **포인트색뿐**이다. 중성색과 상태색(성공 · 경고 · 비활성, 주로 `08-interactive.css`)은 토큰화하지 않는다. 템플릿이 사라지거나 의미가 깨진다.
2. **기본 모양은 그대로여야 한다.** 그래서 hex 를 `var(--ev-primary)` 로 바꾸지 않고, 테마 블록에 **지금 값 그대로** 템플릿 전용 토큰(`--tpl-` 접두사)을 정의해 그것을 쓴다.

   ```css
   .theme-vip { --tpl-accent: #cca43b; }
   .theme-vip .vp-example { color: var(--tpl-accent); }
   ```

   투명도가 있는 포인트색(`rgba(220, 38, 38, 0.12)`)은 토큰 하나에서 투명도만 달리하도록
   `color-mix(in srgb, var(--tpl-accent) 12%, transparent)` 로 바꾼다.

3. 팔레트가 붙을 때만 `--tpl-*` 가 팔레트의 포인트색을 따르게 한다. 이 연결 규칙은 `90-palettes` 의 한 곳에 둔다. 연결은 치환이 모두 끝난 뒤의 단계에서 넣는다 — 치환 단계에서는 팔레트 연결 없이 화면이 그대로인지만 확인한다.
4. 어두운 템플릿(sale)은 팔레트의 `--ev-primary` 를 그대로 쓸 수 없다. 팔레트의 포인트색은 밝은 바탕용으로 고른 진한 색이라 어두운 카드 위에서 대비가 모자란다 (18종 중 15종이 4.5 미만). 어두운 바탕용 변종이 따로 필요하다. sale 만의 문제가 아니다 — 밝은 템플릿에도 어두운 영역이 있다 (예: sports 의 히어로 · 스코어보드는 어두운 남색 바탕 위에 밝은 빨강 글자).
5. 치환할 때마다 **팔레트 없는 상태에서 계산된 스타일 차이가 0** 인지 확인한다 (아래 「규칙」의 분리 때와 같은 기준). 치환 전후의 CSS 로 같은 템플릿을 그려 요소마다 색 관련 계산값을 **숫자(RGBA)로 풀어서** 비교한다 — `color-mix` 는 계산값 문자열이 `rgba()` 와 다르게 찍히기 때문이다. `:hover` · `.active` 상태와 팔레트 몇 가지도 함께 본다. 템플릿 HTML 이 쓰지 않는 규칙(예: `.hl-gift-featured`)은 CSS 선택자에서 가짜 요소를 만들어 같은 비교를 한다. 정의한 토큰을 한 단계씩 바꿔 보고 화면이 실제로 달라지는지도 확인한다 (정의만 있고 안 쓰이는 토큰이 없도록).

### 치환 현황

| 템플릿 | 상태 | 치환한 곳 | 남긴 곳 |
| --- | --- | --- | --- |
| sports | **치환함** (`--tpl-accent` · `-bright` · `-deep`) | hex 12곳 + `rgba()` 8곳 | `08-interactive.css` 의 투표 버튼 5개 규칙(선택 상태 색), 어두운 남색 바탕(`#090e17` · `#111827` · `#1e1b4b`) |
| holiday | **치환함** (`--tpl-accent` · `-deep` · `-soft` · `-light` · `ribbon` · `step`) | hex 6곳 + `rgba()` 5곳 | 와인색 히어로 바탕(`#3d1627` · `#2c1220`), 베이지 테두리, 연한 호박 **바탕** `#fffbeb` |
| vip | **치환함** (`--tpl-accent` · `-light` · `-deep`) | hex 8곳 | 스톤 계열 중성색 |
| sale | **치환함** (`--tpl-accent` · `-hover`) | hex 10곳 + `rgba()` 1곳 | 중성색(zinc 계열), `07-refinements.css` 의 테마 토큰 정의 |
| launch | **치환함** (`--tpl-accent` · `-deep` · `-bright` · `-ink`) | hex 11곳 + `rgba()` 3곳 | 짙은 남색 히어로 바탕 `#172554`, 창 장식 점 3색(`#ef4444` · `#f59e0b` · `#10b981`), 연한 파랑 **바탕** `#eff6ff` → `#dbeafe` |

토큰은 `20-themes/01-template-themes.css` 의 해당 테마 블록에 정의한다. 값은 치환 전 hex 그대로다.

이름은 색의 성격을 따른다 — `accent`(기본), `-deep`(진한 변종), `-bright`(어두운 바탕 위의 밝은 변종), `-soft` · `-light`(연한 금색 계열), `-hover`(마우스를 올렸을 때), `-ink`(글자용 짙은 색). 장식은 `ribbon` · `step` 처럼 쓰임새로 부른다.

연한 색조 **바탕**(`#fffbeb`, `#eff6ff` → `#dbeafe`)은 "배경은 건드리지 않는다"는 원칙에 따라 이번에는 남겼다. 팔레트 연결 단계에서 다시 판단한다.

### 진행 순서

1. 이 문서와 템플릿 5종 치환 — 치환 전후 차이 0 을 확인 (표시는 바뀌지 않는다)
2. 팔레트 연결(`90-palettes` 한 곳)과 어두운 영역용 포인트색 변종 — sale 과, 밝은 템플릿의 어두운 영역. 연한 색조 바탕도 여기서 판단
3. 대비 테스트와 「템플릿 페이지에서 되는 수정 / 안 되는 수정」 표 갱신

## 규칙

- 변형(`.v-*`)은 `[data-block="…"]...:not(.ev-block)` 로 건다 — 템플릿 블록에는 걸리지 않게
- JS 가 필요한 모양은 넣지 않는다 — 생성 결과에는 script 가 없다
- 움직이는 모양(흐르는 띠 · 빛나는 버튼)은 `99-a11y` 에서 멈춘 상태를 같이 정한다
- 분리할 때(2026-10-01) 옛 단일 파일과 **규칙 498개가 같고**, 순서만 두 군데(팔레트 · reduced-motion 을 맨 뒤로) 바뀌었다.
  템플릿 5종 · 변형 조합 11종 × 720/375px 에서 계산된 스타일 차이 0 을 확인했다.
  변형 추가(같은 날) 뒤에도 기존 변형 · 템플릿은 차이 0 이다
