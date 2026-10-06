#!/usr/bin/env bash
#
# 서버에서 도는 배포 스크립트.
# GitHub Actions 가 S3 에 올린 번들을 받아 /srv/web 에 푼다.
#
#   SSM Run Command 가 root 로 이걸 부른다:
#     aws s3 cp s3://newvent-deploy/releases/$SHA/install.sh /tmp/nv-install.sh
#     SHA=$SHA bash /tmp/nv-install.sh
#
# ★ 왜 쉘 스크립트를 워크플로 YAML 안에 넣지 않나
#   YAML → JSON(SSM 파라미터) → 쉘 로 세 겹을 지나면서 따옴표가 반드시 깨진다.
#   여기 두면 git 에서 리뷰되고, 막혔을 때 서버에서 직접 돌려 디버깅할 수 있다.
#
# ★ 왜 S3 를 거치나 — 보안그룹에 22번이 없어서 scp·rsync 가 아예 안 붙는다.
#   SSM 은 명령 채널이라 파일을 보내려면 base64 로 조각내야 하는데(publish-via-ssm.sh),
#   S3 를 쓰면 SSM 이 "가서 받아와라" 지시 한 줄만 나르면 된다.

set -euo pipefail

: "${SHA:?SHA 환경변수가 필요합니다}"
BUCKET=${BUCKET:-newvent-deploy}
REGION=${REGION:-ap-northeast-2}
WEB=/srv/web

echo "▸ 받기 — $SHA"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

aws s3 cp "s3://$BUCKET/releases/$SHA/user.tgz"  . --region "$REGION"
aws s3 cp "s3://$BUCKET/releases/$SHA/admin.tgz" . --region "$REGION"

# ★ 먼저 풀어서 검사하고 나서 교체한다.
#   /srv/web 을 비운 뒤에 번들이 깨진 걸 알면 사이트가 죽은 채로 남는다.
echo "▸ 검증"
mkdir -p stage/user stage/admin
tar xzf user.tgz  -C stage/user
tar xzf admin.tgz -C stage/admin

for f in stage/user/index.html stage/admin/index.html stage/user/assets/event.css; do
  test -s "$f" || { echo "✗ $f 가 없거나 비어 있습니다 — 교체하지 않고 중단"; exit 1; }
done

echo "▸ 교체"
# ★ admin 은 따로 관리한다.
#   사용자 번들을 풀 때 같이 지우면 /admin/ 이 404 가 된다 (publish-via-ssm.sh 와 같은 보호).
find "$WEB" -mindepth 1 -maxdepth 1 ! -name admin -exec rm -rf {} +
cp -a stage/user/. "$WEB"/

mkdir -p "$WEB/admin"
find "$WEB/admin" -mindepth 1 -delete
cp -a stage/admin/. "$WEB/admin"/

chown -R www-data:www-data "$WEB"
nginx -t

echo "▸ 완료"
find "$WEB" -type f | sort
