# NewVent Frontend

AI 기반 이벤트 페이지 제작·게시 관리 시스템의 프론트엔드.
**Vite + 바닐라 JS 모듈** — 프레임워크 없이 ES 모듈로 나눠 쓴다.

---

## 한눈에 보기

```
frontend/
├── src/
│   ├── user/                  ← 사용자 앱   빌드 → dist/user   → /srv/web/
│   │   ├── index.html
│   │   ├── main.js            라우터·스토어·API 조립
│   │   └── views/             home · event · my · login · notFound
│   │
│   ├── admin/                 ← 관리자 앱   빌드 → dist/admin  → /srv/web/admin/
│   │   ├── index.html
│   │   ├── main.js
│   │   └── views/             list · editor · versions · create · login · notFound
│   │
│   └── shared/                ← 양쪽이 같이 쓰는 것
│       ├── dom.js             $ · html`` · escape · delegate · mount
│       ├── router.js          History API 라우터 (base 인식)
│       ├── store.js           구독형 상태 저장소
│       ├── api.js             fetch 래퍼 · Access 토큰 · 401 자동 refresh
│       └── format.js          날짜 · 기간 · 상태 라벨
│
├── public/
│   └── assets/                event.css · event.js  → 그대로 /assets/ 로
│
├── deploy/
│   ├── SETUP.md               nginx · HTTPS 구축 절차
│   └── nginx/
│       ├── newvent.conf       본 설정
│       ├── bootstrap-http.conf 인증서 발급 전 임시 설정
│       └── snippets/security-headers.conf
│
├── vite.config.js             ★ 두 벌 빌드 (APP=user | admin)
├── jsconfig.json              @shared 별칭 · 에디터 인텔리센스
└── package.json
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

---

## 실행

```bash
npm install
```

```bash
npm run dev          # 사용자 앱  → http://localhost:5173/
```

```bash
npm run dev:admin    # 관리자 앱  → http://localhost:5174/admin/
```

백엔드가 다른 곳에 있으면:

```bash
API_PROXY_TARGET=http://192.168.0.10:8080 npm run dev
```

빌드:

```bash
npm run build        # 두 벌 모두 → dist/user, dist/admin
```

---

## 디렉터리 역할

| 경로 | 역할 | 건드리는 사람 |
| --- | --- | --- |
| `src/user/views/` | 사용자 화면 | 사용자 화면 담당 |
| `src/admin/views/` | 관리자 화면 | 관리자 화면 담당 |
| `src/shared/` | 공통 유틸 | **바꾸기 전에 팀에 공유** — 양쪽이 깨진다 |
| `public/assets/` | event.css · event.js | 템플릿 담당 |
| `deploy/` | nginx · HTTPS | 인프라 담당 |

`src/shared/` 만 조심하면 나머지는 파일이 갈려 있어서 **머지 충돌이 잘 안 난다.**
프로토타입이 단일 파일이었던 걸 나눈 이유가 이것이다.

---

## 프로토타입 → 모듈 이식 지도

화면 로직은 `newvent-design.html`(바닐라 SPA 목업)에 **이미 다 있다.**
여기로 함수를 옮겨오면 된다. 새로 설계할 게 아니라 **옮기는 작업**이다.

| 옮길 곳 | 원본 함수 |
| --- | --- |
| `user/views/home.js` | `homeView` `eventCard` `filteredEvents` `resultsHTML` |
| `user/views/event.js` | `eventView` `participationAccess` `participationControl` `participate` `showResult` |
| `user/views/my.js` | `myView` `activity` `metric` `personalBadge` `currentParticipation` |
| `user/views/login.js` | `loginView` `showLoginPrompt` |
| `admin/views/list.js` | `adminView` `adminTable` `adminFilteredEvents` |
| `admin/views/editor.js` | `editorView` `chatBody` `refreshChat` `addChat` `handlePrompt` `stopRequest` `applySelection` `markEditableText` `buttonEditor` `bindFrame` `templateDocument` |
| `admin/views/versions.js` | `versionsView` `previewVersion` `chooseVersion` `saveVersion` `publicationChecks` `showPublish` |
| `admin/views/create.js` | `creationView` `validateCreation` `startCreation` `finishCreation` |
| `shared/format.js` | `shortDate` `daysBetween` `eventStatus` `statusLabel` `policyLabel` |
| `shared/dom.js` | `$` `button` `field` `icon` |

### 옮기면서 같이 고쳐야 하는 것

1. **XSS** — 프로토타입은 문자열 연결로 HTML 을 만들면서 이스케이프가 없다.
   `html\`\`` 태그드 템플릿을 쓰면 값이 자동으로 이스케이프된다.
   이미 HTML 인 조각만 `raw()` 로 감싼다.
2. **목업 → 실 API** — `localStorage` · `initialDatabase` · `localResponse` 를
   `shared/api.js` 호출로 바꾼다. 프로토타입에는 `fetch` 가 **한 곳도 없다.**
3. **생성 진행 표시** — `localResponse` 의 가짜 지연을 SSE 로 바꾸고,
   Stop 을 `AbortController` 에 연결한다. 서버까지 취소가 전파돼야 한다.
4. **`notices` 블록** — 서버 소유라 편집 모드에서 클릭 대상에서 빼야 한다.

---

## 아직 없는 것

| | 비고 |
| --- | --- |
| 스타일 | 프로토타입의 `<style>` 40KB 를 `src/shared/styles/` 로 쪼개야 한다 |
| 배포 워크플로 | GitHub Actions OIDC + SSM Run Command (인프라 문서 5장) |
| SSE 클라이언트 | 생성 진행 스트림. 이벤트 스키마를 백엔드와 먼저 합의 |
| 테스트 | 없음 |

`.github/workflows/deploy-frontend.yml` 은 **이전 프로젝트에서 온 GitHub Pages
배포본**이다. 우리 구성(EC2 + nginx)과 맞지 않으므로 다시 써야 한다.

---

## 관련 문서

- [`deploy/SETUP.md`](deploy/SETUP.md) — nginx · HTTPS 구축 절차
- `NewVent_인프라.md` — AWS 구성 전체 (레포 바깥, 워크스페이스 루트)
