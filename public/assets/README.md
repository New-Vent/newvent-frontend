# /assets — 이벤트 템플릿 공용 자산

`event.css` · `event.js` 가 여기 들어간다. 배포하면 `/assets/…` 로 서빙된다.

`public/` 은 Vite 가 해시 없이 그대로 복사하는 디렉터리라, 게시된 이벤트
페이지(`/e/{slug}`, 서버 렌더)가 고정된 주소로 참조할 수 있다.

Vite 번들 산출물은 `/static/` 에 따로 나간다 (`build.assetsDir: 'static'`).
두 경로를 갈라놓지 않으면 배포할 때마다 서로 덮어쓴다.
