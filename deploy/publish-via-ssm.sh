#!/usr/bin/env bash
#
# 빌드 산출물을 SSM Run Command 로 EC2 에 올린다.
#
#   ./deploy/publish-via-ssm.sh
#
# 왜 rsync 가 아니라 이것인가 — 보안그룹에 **22번이 없다.** SSH 가 아예 안 붙는다.
# SSM 은 아웃바운드 443 만 쓰므로 포트를 열지 않아도 된다.
#
# SSM 파라미터에 크기 제한이 있어 tar.gz 를 base64 로 바꿔 **조각내어** 보내고,
# 서버에서 이어 붙여 푼다. 조각 하나가 커지면 `InvalidParameters` 가 난다.
#
# ⚠ 임시 방편이다. 산출물이 더 커지면 S3 경유(권장)나 GitHub Actions 로 옮긴다.

set -euo pipefail
cd "$(dirname "$0")/.."

: "${AWS_PROFILE:=newvent-admin}"
: "${REGION:=ap-northeast-2}"
: "${INSTANCE:=i-04fc2a92b84384a2a}"
: "${CHUNK:=40000}"            # base64 글자 수. 늘리면 SSM 이 거절한다
export AWS_PROFILE

run() {  # run <주석> <명령…>
  local note=$1; shift
  local payload; payload=$(printf '%s\n' "$@" | python3 -c '
import json,sys
print(json.dumps({"commands": sys.stdin.read().splitlines()}))')
  local id
  id=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" \
       --document-name AWS-RunShellScript --comment "$note" \
       --parameters "$payload" --query "Command.CommandId" --output text)
  local s=''
  for _ in $(seq 1 40); do
    s=$(aws ssm get-command-invocation --region "$REGION" --command-id "$id" \
        --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)
    [ "$s" = Success ] && return 0
    [ "$s" = Failed ] && {
      echo "✗ $note"
      aws ssm get-command-invocation --region "$REGION" --command-id "$id" \
        --instance-id "$INSTANCE" --query "StandardErrorContent" --output text
      return 1
    }
    sleep 4
  done
  echo "✗ $note — 시간 초과 ($s)"; return 1
}

send_tar() {  # send_tar <로컬 tar.gz> <서버 대상 디렉터리>
  local tgz=$1 dest=$2
  local b64; b64=$(base64 -i "$tgz" | tr -d '\n')
  local total=${#b64}
  local parts=$(( (total + CHUNK - 1) / CHUNK ))
  echo "  ${dest} — ${total}자 / ${parts}조각"

  run "newvent: ${dest} 조각 초기화" "rm -f /tmp/nv-upload.b64"
  local i=0 off=0
  while [ $off -lt $total ]; do
    i=$((i+1))
    local piece=${b64:$off:$CHUNK}
    run "newvent: ${dest} 조각 ${i}/${parts}" "printf '%s' '${piece}' >> /tmp/nv-upload.b64"
    printf '    %d/%d\n' "$i" "$parts"
    off=$((off + CHUNK))
  done

  # 새로 풀기 전에 비운다 — 예전 해시 번들이 남지 않게
  run "newvent: ${dest} 풀기" \
    "set -e" \
    "base64 -d /tmp/nv-upload.b64 > /tmp/nv-upload.tgz" \
    "mkdir -p ${dest}" \
    "find ${dest} -mindepth 1 -maxdepth 1 ! -name admin -exec rm -rf {} +" \
    "tar xzf /tmp/nv-upload.tgz -C ${dest}" \
    "rm -f /tmp/nv-upload.b64 /tmp/nv-upload.tgz" \
    "find ${dest} \\( -name '._*' -o -name '.DS_Store' \\) -delete" \
    "chown -R www-data:www-data ${dest}"
}

echo "▸ 빌드"
npm run build >/dev/null

echo "▸ 묶기"
# ★ macOS 의 BSD tar 는 리소스 포크를 ._* 파일로 같이 묶는다.
#   그대로 올리면 /srv/web 에 ._index.html 같은 찌꺼기가 쌓이고,
#   nginx 가 그것도 서빙한다. COPYFILE_DISABLE 로 끈다.
export COPYFILE_DISABLE=1
tar --exclude '._*' --exclude '.DS_Store' -czf /tmp/nv-web.tgz   -C dist/user  .
tar --exclude '._*' --exclude '.DS_Store' -czf /tmp/nv-admin.tgz -C dist/admin .

echo "▸ 전송"
send_tar /tmp/nv-web.tgz   /srv/web
send_tar /tmp/nv-admin.tgz /srv/web/admin

run "newvent: 배포 확인" \
  "echo '--- /srv/web ---'; find /srv/web -type f | sort" \
  "nginx -t"

echo "▸ 완료"
rm -f /tmp/nv-web.tgz /tmp/nv-admin.tgz
