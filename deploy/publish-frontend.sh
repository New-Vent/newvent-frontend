#!/usr/bin/env bash
#
# 빌드 산출물을 EC2 의 /srv/web 레이아웃으로 올린다.
#
#   ./deploy/publish-frontend.sh ubuntu@newvent.duckdns.org
#   ./deploy/publish-frontend.sh --local /tmp/srv-web      # 레이아웃만 만들어 보기
#
# 디스크 레이아웃 (deploy/nginx/newvent.conf 와 짝)
#   /srv/web/index.html        사용자 SPA
#   /srv/web/static/…          사용자 번들 (해시)
#   /srv/web/assets/…          event.css  ← 사용자 빌드의 public/ 에서 온다
#   /srv/web/admin/index.html  관리자 SPA
#   /srv/web/admin/static/…    관리자 번들 (해시)

set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:?사용법: publish-frontend.sh <user@host> | --local <dir>}"

echo "▸ 빌드"
npm run build

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

echo "▸ 레이아웃 구성"
cp -R dist/user/. "$STAGE/"
mkdir -p "$STAGE/admin"
cp -R dist/admin/. "$STAGE/admin/"

# public/assets/README.md 는 팀 문서다. 공개 경로로 나갈 이유가 없다.
rm -f "$STAGE/assets/README.md"

# 관리자 빌드는 public/ 을 복사하지 않는다(중복 방지). /assets 는 사용자 빌드 것만 남는다.
[ -f "$STAGE/assets/event.css" ] || { echo "✗ assets/event.css 가 없습니다"; exit 1; }
[ -f "$STAGE/admin/index.html" ] || { echo "✗ admin/index.html 이 없습니다"; exit 1; }

grep -q '/admin/static/' "$STAGE/admin/index.html" \
  || { echo "✗ 관리자 번들 경로가 /admin/static/ 이 아닙니다 (vite base 확인)"; exit 1; }

find "$STAGE" -type f | sed "s|$STAGE|  /srv/web|" | sort

if [ "$TARGET" = "--local" ]; then
  DEST="${2:?--local 뒤에 디렉터리를 지정하세요}"
  rm -rf "$DEST"; mkdir -p "$DEST"; cp -R "$STAGE/." "$DEST/"
  echo "▸ 로컬 확인용으로 $DEST 에 복사했습니다"
  exit 0
fi

echo "▸ $TARGET:/srv/web 으로 전송"
# --delete 로 예전 해시 번들을 정리한다. index.html 은 마지막에 덮이도록 순서 주의.
rsync -az --delete --exclude 'index.html' --exclude 'admin/index.html' \
      "$STAGE/" "$TARGET:/srv/web/"
rsync -az "$STAGE/index.html" "$TARGET:/srv/web/index.html"
rsync -az "$STAGE/admin/index.html" "$TARGET:/srv/web/admin/index.html"

echo "▸ 완료. nginx 재시작은 필요 없습니다 (정적 파일만 바뀜)"
