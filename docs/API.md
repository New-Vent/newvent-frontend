# NewVent API 계약 (프론트 → 백엔드 제안)

**작성 2026-09-29 · 프론트엔드 기준.**
프론트는 이미 이 계약대로 동작하는 mock 어댑터 위에서 돌고 있다.
백엔드가 이 모양으로 응답하면 **프론트는 한 줄도 안 바꾸고** 붙는다.

바꿔야 할 곳이 있으면 구현 전에 알려달라. 나중에 바꾸면 양쪽 다 고쳐야 한다.

---

## 공통

| | |
| --- | --- |
| Base | 같은 오리진. 프론트는 항상 `/api` **상대경로**로 부른다 |
| 형식 | 요청·응답 모두 `application/json` (SSE 제외) |
| 날짜 | `start` · `end` · `day` 는 `YYYY-MM-DD` (KST 기준 날짜) |
| 시각 | `createdAt` · `at` 은 표시용 문자열 `YYYY.MM.DD HH:mm` |
| 오류 | HTTP 상태 + `{ "message": "사용자에게 보여줄 한국어 문구" }` |

`message` 는 그대로 토스트에 뜬다. 스택트레이스나 영문 예외 메시지를 넣지 말 것.

### 인증

```
사용자   Access: 메모리   Refresh: nv_user_rt   HttpOnly; Secure; SameSite=Lax; Path=/api/auth
관리자   Access: 메모리   Refresh: nv_admin_rt  HttpOnly; Secure; SameSite=Lax; Path=/api/admin/auth
```

- Access 토큰은 `Authorization: Bearer <token>` 헤더로 보낸다
- 만료되면 **401** 을 준다 → 프론트가 `POST {authBase}/refresh` 후 한 번 재시도한다
- 403(권한 없음)은 재시도하지 않는다. 401 과 구분해서 줄 것

> ⚠ **`X-Forwarded-Proto` 를 반드시 신뢰 설정할 것.**
> nginx 가 헤더를 넘기고 있고(`deploy/nginx/newvent.conf`),
> `server.forward-headers-strategy: framework` 가 없으면 Spring 이 요청을
> HTTP 로 보고 **`Secure` 쿠키를 안 내린다.** 그러면 로그인이 유지되지 않는다.

---

## 1. 인증

### `POST /api/auth/login` · `POST /api/admin/auth/login`

```jsonc
// 요청
{ "loginId": "user01", "password": "…" }

// 응답 200
{
  "accessToken": "eyJ…",
  "expiresIn": 1800,          // 초. 없으면 프론트가 JWT 의 exp 를 읽는다
  "user": { "id": "u-1", "name": "헌진", "grade": "일반" }   // 관리자는 role: "admin"
}
```

`Set-Cookie` 로 Refresh 쿠키를 함께 내린다.

### `POST /api/auth/refresh` · `POST /api/admin/auth/refresh`

요청 본문 없음. Refresh 쿠키로 판단한다.
응답은 login 과 같은 모양. 실패는 **401**.

> 프론트는 앱이 뜨자마자 이걸 한 번 부른다(새로고침 복구).
> 그리고 만료 60초 전부터 폴링으로 미리 갱신한다 —
> **SSE 스트리밍 중에는 401 재시도가 통하지 않기 때문이다.**

### `POST /api/auth/logout` · `POST /api/admin/auth/logout`

Refresh 쿠키를 만료시킨다. 응답 204.

---

## 2. 사용자 화면

### `GET /api/events`

게시된 이벤트만. 삭제된 것 제외.

```jsonc
{
  "events": [
    {
      "id": "EVT-2026-001",
      "name": "스포츠 응원",
      "category": "스포츠",            // 카테고리 필터에 쓰인다
      "kind": "승부 예측",
      "icon": "trophy",                // 아이콘 키 (아래 부록)
      "templateId": "tpl-1",
      "policy": "once",                // "once" | "daily"
      "audience": "로그인 회원",       // 문자열 그대로 표시 + 등급 판정에 쓰임
      "start": "2026-09-10",
      "end": "2026-09-30",
      "benefit": "국가대표 유니폼 · 치킨 세트 추첨",
      "color": "#213f78",
      "publishedVersion": 2,
      "snapshot": { /* 아래 Snapshot */ }   // 게시 버전의 스냅샷
    }
  ]
}
```

> 목록 화면이 카드마다 썸네일을 그리므로 **`snapshot` 을 목록에 포함**해 달라.
> 빼면 카드 수만큼 추가 요청이 나간다.

### `GET /api/events/{id}`

위 이벤트 객체 하나. 게시 안 됐거나 삭제됐으면 **404**.

### `GET /api/me/participations`

```jsonc
{
  "participations": [
    {
      "id": "PT-901",
      "eventId": "EVT-2026-001",
      "day": "2026-09-21",              // 정책이 daily 일 때 중복 판정 기준
      "at": "2026.09.21 14:32",
      "title": "2026 월드컵 응원 이벤트",  // 참여 시점의 제목 (스냅샷)
      "state": "pending",               // "pending" | "done"
      "result": "대한민국 승리 예측 접수",
      "reward": null,                   // 받은 혜택. 없으면 null
      "selection": "대한민국 승",
      "version": 2                      // 참여 시점의 게시 버전
    }
  ]
}
```

### `POST /api/events/{id}/participations`

```jsonc
// 요청 — 템플릿에 따라 둘 중 하나만 온다
{ "vote": "kor" }        // tpl-1 승부 예측: "kor" | "draw" | "opp"
{ "choice": 2 }          // tpl-2 복주머니: 0~2

// 응답 201 — 위 participation 객체 하나
```

거절 상황은 상태코드로 구분해 달라. `message` 는 그대로 노출된다.

| 상황 | 상태 |
| --- | :-: |
| 로그인 안 됨 | 401 |
| 등급 미달 (`audience` 불일치) | 403 |
| 기간 밖 | 409 |
| 이미 참여함 (정책 위반) | 409 |
| 삭제된 이벤트 | 404 |

---

## 3. 관리자 — 이벤트

### `GET /api/admin/events?status=&q=&deleted=`

| 파라미터 | 값 |
| --- | --- |
| `status` | `all` `draft` `upcoming` `live` `ended` |
| `q` | 이벤트명·ID 검색 |
| `deleted` | `true` 면 휴지통 |

응답은 사용자 목록과 같은 이벤트 객체 + 아래가 더 붙는다.

```jsonc
{
  "publishedVersion": 2,      // 미게시면 null
  "latestVersion": 3,
  "deletedAt": null,          // 소프트 삭제 시각
  "creationMethod": "ai",     // "ai" | "template"
  "snapshot": { /* 최신 버전 스냅샷 — 목록 썸네일용 */ }
}
```

### `POST /api/admin/events`

```jsonc
// 요청
{
  "title": "가을 감사 이벤트",
  "start": "2026-10-01",
  "end": "2026-10-31",
  "audience": "로그인 회원",
  "mode": "template",          // "template" | "ai"
  "templateId": "tpl-2",       // mode=template 일 때
  "prompt": "…"                // mode=ai 일 때, 2000자 이내
}

// 응답 201 — 생성된 이벤트 (versions v1 포함)
```

서버가 정할 것: `id` 채번, v1 스냅샷 생성, `publishedVersion: null`.

> `mode: "ai"` 여도 **이 시점에 LLM 을 부르지 않는다.** v1 은 템플릿 골격이고,
> 실제 생성은 편집 화면에서 `/generate` 로 한다. 프롬프트는 보관만 한다.

### `DELETE /api/admin/events/{id}` — 소프트 삭제

응답 204. 버전과 참여 기록은 보존한다.

### `POST /api/admin/events/{id}/restore`

응답 200 — 복구된 이벤트.

---

## 4. 관리자 — 버전

### `GET /api/admin/events/{id}/versions`

```jsonc
{
  "versions": [
    {
      "v": 3,
      "source": 2,                       // 어느 버전에서 이어졌는지. v1 은 null
      "createdAt": "2026.09.22 09:40",
      "summary": "참여 버튼 문구를 짧게 정리",
      "author": "관리자A",
      "snapshot": { /* Snapshot */ }
    }
  ],
  "publishedVersion": 2
}
```

**저장된 버전은 불변이다.** 수정은 항상 새 버전을 만든다.

### `POST /api/admin/events/{id}/versions`

```jsonc
// 요청
{
  "source": 2,                  // 이 버전에서 이어짐
  "summary": "제목 · 소개 문구 수정",
  "snapshot": { /* Snapshot */ }
}

// 응답 201 — 저장된 버전 (서버가 v 를 채번)
```

### `POST /api/admin/events/{id}/publish`

```jsonc
{ "version": 3 }
// 응답 200 { "publishedVersion": 3 }
```

게시 전 서버도 검증할 것 — 빈 문구, `start > end` 는 **422**.

---

## 5. ★ LLM 생성 — SSE

### `POST /api/admin/events/{id}/generate`

```jsonc
// 요청
{
  "prompt": "제목을 더 짧게 줄여줘",
  "blockKey": "hero",           // 관리자가 클릭한 블록. 없으면 서버가 판단
  "baseVersion": 2
}
```

응답은 `text/event-stream`. 이벤트 타입은 아래 다섯 가지다.

```jsonc
// 진행 상태 — 채팅 패널의 단계 표시
{ "type": "status", "phase": "prompting", "attempt": 1, "maxAttempts": 3 }
//   phase: "prompting" | "generating" | "validating" | "retrying" | "fallback"

// 대기열 (동시 요청이 많을 때만. 없으면 프론트가 무시한다)
{ "type": "queued", "position": 2 }

// 완성된 블록 — 여러 번 올 수 있다
{ "type": "block", "blockKey": "hero",
  "html": "<section class=\"ev-block block-hero\" data-block=\"hero\">…</section>" }

// 종료
{ "type": "done", "version": 4 }

// 실패
{ "type": "error", "code": "VALIDATION_FAILED", "message": "3회 시도했지만 규격에 맞지 않았어요" }
```

### 지켜야 할 것

1. **`html` 은 `<section data-block="…">` 전체(outerHTML)여야 한다.**
   내부 조각만 오면 프론트가 **거부하고 화면을 안 바꾼다**(중첩 section 이 생기면
   `event.css` 레이아웃이 깨진다). `AI_EDIT_RULES.md` 2-1 참고.
2. **`notices` 블록은 보내지 말 것.** 서버 소유다. 프론트도 한 번 더 막는다.
3. **`script` 와 `on*` 속성은 서버가 반드시 제거할 것 (Jsoup Safelist).**
   프론트는 미리보기 iframe 에 `allow-scripts` 를 주고 있다 —
   템플릿의 `newVentReinit` 과 타이머가 동작해야 하기 때문이다.
   **실질 방어선은 iframe sandbox 가 아니라 이 서버 정화다.**
4. **`Content-Type: text/event-stream` + `X-Accel-Buffering: no`** 를 줄 것.
   nginx 쪽은 `proxy_buffering off` 로 맞춰뒀다.
5. 클라이언트가 연결을 끊으면(Stop 버튼) **LLM 호출까지 취소 전파**할 것.
   Bedrock 호출이 그대로 돌면 비용이 나간다.
6. 생성이 길어도 **3초 안에 첫 이벤트**를 하나 흘려보낼 것.
   아무것도 안 오면 프록시와 브라우저가 연결을 의심한다.

---

## 부록 A — Snapshot

이벤트 한 버전의 내용 전체.

```jsonc
{
  "templateId": "tpl-1",

  // LLM 이 만든 블록 HTML. 비어 있으면 아래 필드로 템플릿 슬롯을 채운다.
  // 키가 있는 블록은 폼 필드로 덮어쓰지 않는다.
  "blocks": {
    "hero": "<section class=\"ev-block block-hero\" data-block=\"hero\">…</section>"
  },

  "title": "2026 월드컵 응원 이벤트",
  "intro": "태극전사의 승리를 응원하고…",
  "benefitHeading": "이벤트 혜택",
  "cta": "승리 예측하고 응원하기",
  "start": "2026-09-10",
  "end": "2026-09-30",

  // 관리자가 미리보기에서 직접 고친 문구. 키는 프론트가 부여한다.
  "contentEdits": { "text-3": "바뀐 문구" },

  // CTA 버튼 디자인
  "buttonStyle": { "bg": "#d60076", "color": "#ffffff", "radius": "999px" }
}
```

`blocks` 를 제외한 모든 키는 **필수**다(빈 문자열은 허용, `null` 은 불가).
`contentEdits` · `buttonStyle` 은 없으면 생략해도 된다.

## 부록 B — 블록 키

```
hero  benefits  steps  notices  cta
```

`notices` 는 서버 소유 — LLM 이 건드리지 않는다.

## 부록 C — 아이콘 키

`icon` 필드에 쓰는 값. 프론트가 인라인 SVG 로 그린다.

```
trophy  gift  crown  bolt  rocket  user  layers  clock  search  grid  arrow  back  sparkle
```

목록에 없는 값이 오면 `gift` 로 대체된다.

---

## 부록 D — 테마

테마 클래스는 **`<body>` 가 아니라 `.ev-container` 에 붙인다.**

```html
<div class="ev-container event-page theme-sports">
```

| | |
| --- | --- |
| 값 | `theme-sports` `theme-holiday` `theme-vip` `theme-sale` `theme-launch` |
| 이유 | 블록 조각만 저장·전송해도 테마가 같이 따라다닌다. `<body>` 에 있으면 조각에 안 실려서 프론트가 어느 테마인지 알 수 없다 |
| CSS | **바꿀 것 없다.** `event.css` 의 선택자는 처음부터 `.theme-x` 단독이다 (`body.theme-x` 형태 0건) |

테마가 재정의하는 변수는 다섯 테마 모두 같다 —
`--ev-primary` · `--ev-primary-hover` · `--ev-primary-light` · `--ev-primary-glow` ·
`--ev-gradient-hero` · `--ev-gradient-cta` · `--ev-accent-tag`.
전부 `.ev-container` 안에서만 쓰이므로 컨테이너로 옮겨도 안전하다.
(`body` 는 `--ev-font` · `--ev-bg` · `--ev-text-main` 만 쓰는데 테마가 이 셋을 건드리지 않는다.)

## 부록 E — 백지 생성 시 서버가 심을 class

모델에게 class 를 맡기지 않는다. 오타 하나로 스타일이 통째로 날아가고
검증·재시도가 복잡해진다. **서버가 뼈대를 고정하고 모델은 텍스트만 채운다.**

```
컨테이너   <div class="ev-container event-page theme-{…}">

hero       <section class="ev-block block-hero" data-block="hero">
             <h1 class="hero-title">
             <p class="hero-desc">
             <span data-slot="period">

benefits   <section class="ev-block block-benefits" data-block="benefits">
             <h2 class="title">
             <div class="benefits-list benefits-list-default">
               <article class="benefit-card benefit-card-default">

steps      <section class="ev-block block-steps" data-block="steps">
             <h2 class="title">
             <div class="steps-list steps-list-default">
               <article class="step-card step-card-default">

notices    <section class="ev-block block-notices" data-block="notices">   ← 서버 소유
             <h2 class="title">

cta        <section class="ev-block block-cta" data-block="cta">
             <button type="button" class="cta-btn" data-slot="cta-link">
```

### `-default` 를 꼭 붙일 것

`event.css` 는 **식별 클래스와 표현 클래스를 나눠뒀다.**

```css
/* 공통 식별 클래스: 레이아웃·배경을 강제하지 않음 */
.benefit-card { box-sizing: border-box; }

/* 기본 표현 클래스 */
.benefit-card-default,
:where(.benefit-card:not([class*="sp-"]):not([class*="hl-"])…) { /* 실제 스타일 */ }
```

`:where(:not(…))` 폴백이 있어서 템플릿 고유 접두사(`sp-` `hl-` `vp-` `fs-` `lc-`)가
없는 식별 클래스는 대개 기본 스타일을 자동으로 받는다. **그런데 폴백이 비대칭이다.**

| 식별 클래스 | `:where` 폴백 |
| --- | :-: |
| `benefit-card` | 있음 |
| `steps-list` | 있음 |
| `step-card` | 있음 |
| **`benefits-list`** | **없음** |

`.benefits-list` 는 `box-sizing` 만 받고 그리드 레이아웃을 못 받는다
(`display: grid` 는 `.benefits-grid, .benefits-list-default` 에만 걸려 있다).
그래서 **`-default` 를 명시적으로 붙이는 쪽**이 맞다.
`:where()` 는 특이도가 0 이라 나중에 다른 규칙에 밀릴 수도 있다.

### 인라인 스타일을 넣지 말 것

`AI_EDIT_RULES.md` 2 항 — 스타일은 `event.css` 가 전담한다.
서버가 뼈대를 심을 때도 `style="…"` 없이 class 만 붙인다.

---

## 아직 안 정한 것

| | 정해야 할 것 |
| --- | --- |
| 등급 판정 | `audience` 가 문자열("VIP · FAMILY 회원")이다. 코드값으로 바꿀지 |
| 작성자 | 버전마다 `author` 를 남길지, 이벤트 단위로만 둘지 |
| 페이지네이션 | 관리자 목록. 지금은 전건 조회 전제 |
| 참여 결과 발표 | `state: "pending"` 이 언제 `done` 이 되는지 (배치? 수동?) |
