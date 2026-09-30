# NewVent Frontend

AI 기반 이벤트 페이지 제작·게시 관리 시스템의 프론트엔드.
**Vite + 바닐라 JS 모듈** — 프레임워크 없이 ES 모듈로 나눠 쓴다.

화면은 전부 구현돼 있고 **목업 데이터로 끝까지 돈다.** 백엔드 연동은 스위치로 켠다.

---

## 빠르게 시작

```bash
npm install
```

```bash
npm run dev          # 사용자  → http://localhost:5173/
```

```bash
npm run dev:admin    # 관리자  → http://localhost:5174/admin/
```

```bash
npm run build        # 두 벌 모두 → dist/user, dist/admin
```

---

## ★ 앱을 두 벌로 빌드한다

이 레포에서 제일 먼저 이해해야 하는 부분이다.

```
APP=user  (기본)  →  base '/'        →  dist/user   →  /srv/web/
APP=admin         →  base '/admin/'  →  dist/admin  →  /srv/web/admin/
```

**왜 나누나** — 관리자 번들(편집 스튜디오·채팅·버전 비교)은 무겁고, 공개
화면에 내려갈 이유가 없다. 한 벌로 빌드하면 관리자 JS 가 `/static/` 에
섞여서, nginx 에서 `/admin/` 에 IP 제한을 걸어도 번들은 그대로 새어 나간다.

`base` 는 dev 서버에도 적용되므로 **개발 중에도 주소가 운영과 같다.**

| | 개발 | 운영 |
| --- | --- | --- |
| 사용자 | `localhost:5173/` | `https://newvent.duckdns.org/` |
| 관리자 | `localhost:5174/admin/` | `https://newvent.duckdns.org/admin/` |
| API | Vite 프록시 → `:8080` | nginx 프록시 → `:8080` |

API 는 양쪽 다 `/api` **상대경로**다. 환경별 분기가 없다.

> ⚠️ `build.assetsDir` 가 `'static'` 인 것은 의도적이다.
> 기본값 `'assets'` 는 `/assets/`(event.css) 와 충돌한다. **되돌리지 말 것.**

---

## 화면

### 사용자 (`src/user/`)

| 라우트 | 화면 | 파일 |
| --- | --- | --- |
| `/` | 이벤트 목록 — 히어로·검색·카테고리·카드 | `views/home.js` |
| `/events/:id` | 이벤트 상세 · 참여 | `views/event.js` |
| `/my` | 내 혜택 — 참여 기록·받은 혜택 | `views/my.js` |
| `/account` | 내 정보 · 멤버십 등급 · 요금제 변경 | `views/account.js` |
| `/signup` | 회원가입 | `views/signup.js` |
| `/login` | 로그인 | `views/login.js` |

### 관리자 (`src/admin/`)

| 라우트 | 화면 | 파일 |
| --- | --- | --- |
| `/admin/` | 이벤트 관리 목록 (탭 3개) | `views/list.js` |
| `/admin/events/new` | 생성 마법사 2단계 | `views/create.js` |
| `/admin/events/:id/edit` | **제작 스튜디오** — 폼·채팅·미리보기 | `views/editor.js` |
| `/admin/events/:id/versions` | 버전 이력 · 저장 지점 · 게시 | `views/versions.js` |
| `/admin/login` | 관리자 로그인 (경로·쿠키가 사용자와 다름) | `views/login.js` |

#### 관리 목록은 탭마다 열도 버튼도 다르다

| 탭 | 열 | 버튼 |
| --- | --- | --- |
| 나의 이벤트 | 이벤트 · 버전 · 관리 | 버전 이력 · 편집하기 · 게시하기 · 삭제하기 |
| 게시중 | 이벤트 · 기간 · 게시버전 · 관리 | 게시 내리기 |
| 휴지통 | 이벤트 · 삭제일 · 관리 | 게시하기 · 영구 삭제하기 |

같은 표를 재사용하지 않고 `tableMine` / `tableLive` / `tableTrash` 로 나눠 둔 이유다.

---

## 구조

```
frontend/
├── src/
│   ├── user/                    사용자 앱 → dist/user → /srv/web/
│   │   ├── index.html  main.js  styles.css  actions.js
│   │   └── views/               home · event · my · account · signup · login
│   │
│   ├── admin/                   관리자 앱 → dist/admin → /srv/web/admin/
│   │   ├── index.html  main.js  styles.css
│   │   └── views/               list · editor · versions · create · login
│   │
│   └── shared/                  ⚠️ 바꾸기 전에 팀에 공유
│       ├── state.js             전역 state(db) · ui
│       ├── persist.js           localStorage 저장
│       ├── selectors.js         eventById · published · currentDraft · isDirty …
│       ├── constants.js         DEMO_DATE · LABELS · BLOCK_LABELS
│       ├── format.js            날짜 · 상태 라벨
│       ├── dom.js               $ · esc · html`` · delegate
│       ├── icons.js             인라인 SVG
│       ├── router.js            History API 라우터 (base 인식)
│       ├── navigate.js          ★ 뷰 → main.js 화면이동 다리
│       ├── participation.js     참여 가능 판정 (미리보기도 쓴다)
│       ├── editor-state.js      편집 화면 상태 (미리보기도 쓴다)
│       ├── api.js               HTTP · Access 토큰 · 401 재시도 · 만료 전 갱신
│       ├── repo.js              ★ 데이터 접근 계층 (목업 ↔ 서버)
│       ├── login-form.js        로그인 제출 공통
│       ├── ui/                  toast · modal · controls
│       ├── preview/             document · frame · editable
│       ├── mock/                configs · fixtures · templates
│       └── styles/              base · layout · components · user · admin · editor · responsive
│
├── public/assets/event.css      이벤트 페이지 스타일 → /assets/event.css
├── deploy/                      nginx · certbot · IAM · 검증 스크립트
├── docs/                        API 계약 · 백엔드 실측 · 팀 세팅
└── vite.config.js               ★ 두 벌 빌드
```

### `shared/` 에 있는데 왜 공통인가

몇 개는 이름만 보면 특정 화면 것 같은데 공통이다. **미리보기 iframe 이 쓰기 때문**이다.

- `participation.js` — 미리보기가 이 판정으로 버튼을 잠근다
- `editor-state.js` — 미리보기 프레임이 선택 상태를 여기서 읽는다
- `navigate.js` — 뷰가 `main.js` 를 import 하면 순환이 된다. `main.js` 가
  시작할 때 자기 구현을 등록하고, 뷰는 이 모듈만 부른다

---

## 백엔드 연동 스위치

기본은 **목업**이다. `.env.local` 에 넣거나 명령 앞에 붙인다.

```bash
# .env.local  (gitignore 대상)
VITE_API_AUTH=on
VITE_API_DATA=on
```

| 스위치 | 켜면 | 끄면 (기본) |
| --- | --- | --- |
| `VITE_API_AUTH=on` | 아이디·비밀번호 로그인, 부팅 시 선제 refresh, 만료 전 폴링 | "체험하기" 목업 로그인 |
| `VITE_API_DATA=on` | 이벤트·참여 데이터를 서버에서 (`shared/repo.js`) | 목업 (`shared/mock/`) |

백엔드를 로컬에 띄우려면 (백엔드 레포에서):

```bash
docker compose up -d && sh gradlew bootRun
```

계정 `admin` / `admin1234!`. `LLM_PROVIDER=mock` 이면 Bedrock 비용이 0 이다.

> 실측과 계약의 차이는 [`docs/백엔드-실측-현황.md`](docs/백엔드-실측-현황.md) 에 A-1~A-9 로 정리돼 있다.
> **아직 반영 전이다.**

---

## 미리보기 — 이 프로젝트의 핵심

편집 화면은 이벤트 HTML 을 `iframe` 에 띄우고, 관리자가 클릭한 **블록만** 갈아끼운다.

```
snapshot ─ templateDocument() ─→ 문서 문자열 ─→ frame.srcdoc
                                                    │
블록 수정 ── replaceBlock(frame, key, html) ────────┘
                    └→ contentWindow.newVentReinit(key)   타이머·카운터 재연결
```

지켜야 하는 것 (`AI_EDIT_RULES.md`):

1. LLM 응답은 **`<section data-block="…">` 전체(outerHTML)** 여야 한다.
   조각만 오면 `replaceBlock` 이 거부한다 — 중첩 section 은 레이아웃을 깬다
2. **`notices` 는 서버 소유.** 클릭 대상에서 빠지고, 교체도 막혀 있다
3. 테마(`theme-*`)는 `<body>` 가 아니라 **`.ev-container`** 에 붙는다.
   블록 조각만 저장·전송해도 테마가 따라다니게
4. iframe sandbox 는 `allow-same-origin allow-scripts` 다.
   템플릿의 타이머와 `newVentReinit` 이 살아야 하기 때문이며,
   **실질 방어선은 sandbox 가 아니라 서버의 Jsoup 정화다**

---

## 디렉터리 역할

| 경로 | 역할 | 건드리는 사람 |
| --- | --- | --- |
| `src/user/views/` | 사용자 화면 | 사용자 화면 담당 |
| `src/admin/views/` | 관리자 화면 | 관리자 화면 담당 |
| `src/shared/` | 공통 | **바꾸기 전에 팀에 공유** — 양쪽이 깨진다 |
| `public/assets/` | event.css | 템플릿 담당 |
| `deploy/` | nginx · HTTPS · IAM | 인프라 담당 |
| `docs/` | API 계약 · 팀 세팅 | 전원 |

`src/shared/` 만 조심하면 나머지는 파일이 갈려 있어 **머지 충돌이 잘 안 난다.**
프로토타입이 단일 파일이었던 걸 나눈 이유가 이것이다.

---

## 아직 없는 것

| | 비고 |
| --- | --- |
| 백엔드 실연동 | `docs/백엔드-실측-현황.md` A-1~A-9. **A-6(SSE→폴링)이 가장 큼** |
| 배포 워크플로 | `.github/workflows/deploy-frontend.yml` 이 아직 **GitHub Pages 배포본**이다 |
| 배포 스크립트 | `deploy/publish-frontend.sh` 가 rsync/SSH 기반인데 보안그룹에 22번이 없다. SSM 경유로 다시 써야 한다 |
| 응답 상태 (검수중·승인·거절) | 백엔드 스펙 미정 |
| 테스트 | 없음 |

---

## 겪은 함정 (다시 밟지 말 것)

| 증상 | 원인 |
| --- | --- |
| 버튼을 눌러도 아무 반응이 없다 | 뷰가 `navigate`·`clone` 을 import 안 해 `ReferenceError`. `@shared/navigate.js` 로 해결 |
| `/events/:id` 가 502 | Vite 프록시 `'/e'` 가 접두사 매칭. `'^/e/'` 정규식으로 |
| 관리자 dev 에서 `/assets/event.css` 404 | Vite dev 는 `public/` 을 base 아래에 서빙한다. `serveAssetsAtRoot` 가 dev 에서만 메운다 |
| iframe 안 `SyntaxError: Unexpected token '<'` | 템플릿 데이터의 `<\/script>` 이스케이프 |
| `nginx -t` 실패 (`http2`) | Ubuntu 24.04 는 nginx 1.24.0. `http2 on;` 은 1.25.1+ |
| 관리자 화면이 무스타일 | 공통 요소를 `user.css` 로 분류했었다 → `components.css` |

---

## 관련 문서

| | |
| --- | --- |
| [`TODO.md`](TODO.md) | 진행 상황 · 다음 작업 |
| [`docs/API.md`](docs/API.md) | 프론트가 제안한 API 계약 |
| [`docs/백엔드-실측-현황.md`](docs/백엔드-실측-현황.md) | 실측과 계약의 차이 (A-1~A-9) |
| [`docs/TEAM-SETUP.md`](docs/TEAM-SETUP.md) | 팀원 로컬 세팅 (AWS CLI · Bedrock · SSM) |
| [`deploy/SETUP.md`](deploy/SETUP.md) | IAM · nginx · certbot 구축 절차 |
