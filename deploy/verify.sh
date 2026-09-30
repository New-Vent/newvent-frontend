#!/usr/bin/env bash
#
# nginx · HTTPS 배포 검증. EC2 에 올린 뒤 **로컬에서** 돌린다.
#
#   ./deploy/verify.sh newvent.duckdns.org
#   ./deploy/verify.sh localhost:5174 http     # dev 서버에 돌려볼 때
#
# 6~8번은 :8080 에 deploy/stub-server.mjs 가 떠 있어야 한다.

set -u

HOST="${1:-newvent.duckdns.org}"
SCHEME="${2:-https}"
BASE="$SCHEME://$HOST"

pass=0; fail=0; skip=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$1"; [ $# -gt 1 ] && printf '      %s\n' "$2"; fail=$((fail+1)); }
warn() { printf '  \033[33m–\033[0m %s\n' "$1"; skip=$((skip+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

code() { curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$@" 2>/dev/null; }

echo "대상: $BASE"

# ── 1. DNS · 접속 ────────────────────────────────────────────────
head_ "1. 접속"
ip=$(dig +short "${HOST%%:*}" 2>/dev/null | tail -1)
[ -n "$ip" ] && ok "DNS 해석: $ip" || warn "dig 결과 없음 (localhost 면 정상)"
c=$(code "$BASE/")
[ "$c" = 200 ] && ok "GET / → 200" || no "GET / → $c"

# ── 2. HTTPS · 인증서 ───────────────────────────────────────────
if [ "$SCHEME" = https ]; then
  head_ "2. HTTPS"
  redirect=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "http://$HOST/" 2>/dev/null)
  case "$redirect" in
    30*https://*) ok "HTTP → HTTPS 리다이렉트 ($redirect)" ;;
    *)            no "HTTP 리다이렉트 없음" "$redirect" ;;
  esac

  expiry=$(echo | openssl s_client -connect "${HOST}:443" -servername "$HOST" 2>/dev/null \
           | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$expiry" ]; then
    left=$(( ( $(date -j -f '%b %d %T %Y %Z' "$expiry" +%s 2>/dev/null \
              || date -d "$expiry" +%s 2>/dev/null) - $(date +%s) ) / 86400 ))
    [ "$left" -gt 20 ] 2>/dev/null && ok "인증서 만료까지 ${left}일" \
                                   || no "인증서 만료 임박 (${left}일)" "갱신 타이머를 확인하세요"
  else
    no "인증서를 읽지 못했습니다"
  fi
else
  head_ "2. HTTPS"; warn "http 모드라 건너뜀"
fi

# ── 3. SPA fallback ─────────────────────────────────────────────
head_ "3. SPA fallback · 경로 분기"
for p in / /my /login /events/EVT-2026-001; do
  c=$(code "$BASE$p"); [ "$c" = 200 ] && ok "사용자 $p → 200" || no "사용자 $p → $c"
done
for p in /admin/ /admin/events/new /admin/events/EVT-2026-001/edit; do
  c=$(code "$BASE$p"); [ "$c" = 200 ] && ok "관리자 $p → 200" || no "관리자 $p → $c"
done

r=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "$BASE/admin" 2>/dev/null)
case "$r" in 301*"/admin/") ok "/admin → 301 /admin/" ;; *) no "/admin 끝 슬래시 리다이렉트 없음" "$r" ;; esac

# ── 4. 정적 자산 ────────────────────────────────────────────────
head_ "4. 정적 자산"
c=$(code "$BASE/assets/event.css")
[ "$c" = 200 ] && ok "/assets/event.css → 200" || no "/assets/event.css → $c" "프리뷰 스타일이 깨집니다"

cc=$(curl -sSI --max-time 10 "$BASE/" 2>/dev/null | grep -i '^cache-control' | tr -d '\r')
echo "$cc" | grep -qi 'no-cache' && ok "index.html: $cc" || no "index.html 에 no-cache 없음" "$cc"

# 해시 번들 하나를 실제로 찾아서 확인
bundle=$(curl -sS --max-time 10 "$BASE/" 2>/dev/null | grep -o '/static/[^"]*\.js' | head -1)
if [ -n "$bundle" ]; then
  cc=$(curl -sSI --max-time 10 "$BASE$bundle" 2>/dev/null | grep -i '^cache-control' | tr -d '\r')
  echo "$cc" | grep -qi 'immutable' && ok "번들: $cc" || no "번들에 immutable 없음" "$cc"
else
  warn "번들 경로를 못 찾음"
fi

c=$(code "$BASE/static/존재하지-않는-파일.js")
[ "$c" = 404 ] && ok "없는 정적 파일 → 404 (index.html 로 안 떨어짐)" || no "없는 정적 파일 → $c" "try_files … =404 확인"

# ── 5. 보안 헤더 ────────────────────────────────────────────────
head_ "5. 보안 헤더"
h=$(curl -sSI --max-time 10 "$BASE/" 2>/dev/null | tr -d '\r')
echo "$h" | grep -qi 'x-content-type-options: *nosniff' && ok "X-Content-Type-Options" || no "X-Content-Type-Options 없음"
echo "$h" | grep -qi 'x-frame-options: *SAMEORIGIN'     && ok "X-Frame-Options: SAMEORIGIN" || no "X-Frame-Options 가 SAMEORIGIN 이 아님" "DENY 면 편집 프리뷰가 막힙니다"
echo "$h" | grep -qi 'referrer-policy'                  && ok "Referrer-Policy" || no "Referrer-Policy 없음"

# ── 6~8. 백엔드 경유 (스텁 필요) ────────────────────────────────
head_ "6. API 프록시 · X-Forwarded-Proto"
body=$(curl -sS --max-time 15 -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{}' 2>/dev/null)
if [ -z "$body" ]; then
  warn "백엔드(또는 스텁)가 없어 건너뜀 — node deploy/stub-server.mjs"
else
  echo "$body" | grep -q '"secureApplied":true' \
    && ok "X-Forwarded-Proto 전달됨 → Secure 쿠키 발급" \
    || no "Secure 쿠키가 안 붙습니다" "nginx 의 X-Forwarded-Proto 와 Spring 의 forward-headers-strategy 를 확인"
  curl -sSI --max-time 15 -X POST "$BASE/api/auth/login" 2>/dev/null | grep -qi 'set-cookie:.*httponly' \
    && ok "HttpOnly 쿠키 내려옴" || no "Set-Cookie 에 HttpOnly 없음"
fi

head_ "7. SSE 버퍼링"
if [ -z "$body" ]; then
  warn "스텁 없음 — 건너뜀"
else
  tmp=$(mktemp)
  ( curl -sS -N --max-time 12 -X POST "$BASE/api/admin/events/1/generate?count=6&interval=1500" > "$tmp" 2>/dev/null & )
  sleep 5
  got=$(grep -c '^data:' "$tmp" 2>/dev/null || echo 0)
  if [ "$got" -ge 2 ] && [ "$got" -le 5 ]; then
    ok "5초 동안 이벤트 ${got}개 수신 — 스트리밍됨"
  elif [ "$got" = 0 ]; then
    no "5초 동안 아무것도 안 옴" "proxy_buffering off 가 빠졌거나 프록시가 모아두고 있습니다"
  else
    warn "5초 동안 ${got}개 — 간격을 다시 확인하세요"
  fi
  rm -f "$tmp"
fi

head_ "8. proxy_read_timeout"
if [ -z "$body" ]; then
  warn "스텁 없음 — 건너뜀"
else
  echo "      (90초 걸립니다…)"
  c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 120 "$BASE/api/slow?sec=90" 2>/dev/null)
  [ "$c" = 200 ] && ok "90초 응답 → 200" || no "90초 응답 → $c" "504 면 proxy_read_timeout 이 짧습니다"
fi

printf '\n\033[1m결과\033[0m  통과 %d · 실패 %d · 건너뜀 %d\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ]
