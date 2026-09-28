# NewVent 프론트 배포 환경 구축 (nginx + HTTPS)

**대상**: EC2 한 대에 nginx 를 올리고 `https://newvent.duckdns.org` 로 서빙하기까지.
이 문서는 **인프라를 처음 한 번 세울 때** 쓴다. 이후 배포(파일 복사)는 별도다.

---

## 0. 먼저 확인할 것

| | |
| --- | --- |
| Elastic IP | EC2 에 할당돼 있는가 (인프라 문서 8장 2번) |
| DuckDNS | `newvent.duckdns.org` 가 그 EIP 를 가리키는가 |
| 보안그룹 | 인바운드 **80·443 만** 열려 있는가 (`:8080` 은 닫는다) |
| Budgets 알람 | 인스턴스 만들기 **전에** 걸었는가 |

DNS 전파 확인:

```bash
dig +short newvent.duckdns.org
```

EIP 와 같은 값이 나와야 한다. **여기서 안 맞으면 certbot 이 반드시 실패한다.**

---

## 1. nginx 설치

Amazon Linux 2023:

```bash
sudo dnf install -y nginx && sudo systemctl enable --now nginx
```

Ubuntu:

```bash
sudo apt update && sudo apt install -y nginx && sudo systemctl enable --now nginx
```

버전 확인 — `http2 on;` 문법은 **1.25.1 이상**에서만 쓸 수 있다.

```bash
nginx -v
```

1.25.1 미만이면 `newvent.conf` 의 `http2 on;` 을 지우고
`listen 443 ssl;` 을 `listen 443 ssl http2;` 로 바꾼다.

---

## 2. 디렉터리와 스니펫 배치

```bash
sudo mkdir -p /srv/web/admin /srv/web/assets /var/www/html
sudo mkdir -p /etc/nginx/snippets

sudo cp deploy/nginx/snippets/security-headers.conf \
        /etc/nginx/snippets/newvent-security-headers.conf
```

> 파일명이 `newvent-` 로 바뀌는 게 맞다. `/etc/nginx/snippets/` 는 공용 디렉터리라
> 다른 설정과 이름이 겹칠 수 있다.

nginx 가 정적 파일을 읽을 수 있어야 한다:

```bash
sudo chown -R nginx:nginx /srv/web    # Ubuntu 는 www-data:www-data
sudo chmod -R 755 /srv/web
```

---

## 3. 인증서 발급 — 2단계로 나눈다

`newvent.conf` 는 `ssl_certificate` 를 참조한다. 인증서가 없는 상태로 올리면
**nginx 가 기동에 실패**하고, nginx 가 안 떠 있으면 certbot 의 HTTP-01 검증도
실패한다. 그래서 HTTP 전용 설정으로 먼저 띄운다.

### 3-1. 임시 설정으로 80 포트만 띄우기

```bash
sudo cp deploy/nginx/bootstrap-http.conf /etc/nginx/conf.d/newvent.conf
sudo nginx -t && sudo systemctl reload nginx
```

외부에서 확인:

```bash
curl -s http://newvent.duckdns.org/
```

`newvent bootstrap ok` 가 나와야 다음으로 간다.
**안 나오면 DNS 나 보안그룹 문제다** — certbot 을 돌려도 똑같이 실패한다.

### 3-2. certbot 설치와 발급

Amazon Linux 2023:

```bash
sudo dnf install -y certbot python3-certbot-nginx
```

Ubuntu:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

발급:

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d newvent.duckdns.org \
  --email <팀메일> --agree-tos --no-eff-email
```

> `--nginx` 대신 `certonly --webroot` 를 쓴다.
> `--nginx` 는 설정 파일을 **제자리에서 고쳐 쓴다.** 우리는 git 으로 관리하는
> `newvent.conf` 를 그대로 올릴 거라, certbot 이 손대지 않는 편이 낫다.

성공하면 이 경로에 생긴다:

```
/etc/letsencrypt/live/newvent.duckdns.org/fullchain.pem
/etc/letsencrypt/live/newvent.duckdns.org/privkey.pem
```

`options-ssl-nginx.conf` 와 `ssl-dhparams.pem` 이 없으면 만들어 준다:

```bash
ls /etc/letsencrypt/options-ssl-nginx.conf /etc/letsencrypt/ssl-dhparams.pem \
  || sudo certbot --version   # 최신 certbot 은 발급 시 함께 생성한다
```

없다면 `newvent.conf` 의 해당 `include` · `ssl_dhparam` 두 줄을 주석 처리해도 된다.

### 3-3. 본 설정으로 교체

```bash
sudo cp deploy/nginx/newvent.conf /etc/nginx/conf.d/newvent.conf
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. 갱신 자동화를 첫날에 확인한다

Let's Encrypt 인증서는 **90일**짜리다. 발표가 그 안에 있어도,
갱신이 안 걸려 있으면 다음 학기에 조용히 죽는다.

타이머가 살아 있는지:

```bash
systemctl list-timers | grep -i certbot
```

아무것도 안 나오면 직접 켠다:

```bash
sudo systemctl enable --now certbot-renew.timer   # 배포판에 따라 certbot.timer
```

**실제로 갱신이 되는지** 확인 (진짜 발급은 하지 않는다):

```bash
sudo certbot renew --dry-run
```

갱신 후 nginx 가 새 인증서를 집도록 훅을 건다:

```bash
echo -e '#!/bin/sh\nsystemctl reload nginx' \
  | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

> `--webroot` 로 발급했으므로 갱신 검증도 `/var/www/html` 로 들어온다.
> `newvent.conf` 의 80 포트 블록에 `/.well-known/acme-challenge/` 를
> **리다이렉트보다 먼저** 둔 이유가 이것이다.

---

## 5. 동작 확인 체크리스트

배포물을 올리기 전에도 아래까지는 확인할 수 있다.

```bash
# HTTPS 가 뜨는가
curl -I https://newvent.duckdns.org/

# HTTP 가 443 으로 넘어가는가 (301 + Location)
curl -I http://newvent.duckdns.org/

# 인증서 만료일
echo | openssl s_client -connect newvent.duckdns.org:443 \
       -servername newvent.duckdns.org 2>/dev/null \
  | openssl x509 -noout -dates

# 보안 헤더가 붙는가
curl -sI https://newvent.duckdns.org/ | grep -iE 'x-frame|x-content|referrer|cache-control'

# :8080 이 밖에서 안 열리는가 (연결이 거부/타임아웃 되어야 정상)
curl -m 5 http://newvent.duckdns.org:8080/ ; echo "exit=$?"
```

백엔드가 올라온 뒤:

```bash
# API 프록시
curl -i https://newvent.duckdns.org/api/health

# ★ Secure 쿠키가 내려오는가 — X-Forwarded-Proto 가 제대로 전달되는지의 증거
curl -i -X POST https://newvent.duckdns.org/api/auth/login \
     -H 'Content-Type: application/json' -d '{...}' | grep -i set-cookie
```

`Set-Cookie` 에 `Secure` 가 **빠져 있으면** Spring 이 요청을 HTTP 로 보고 있다는 뜻이다.
`application.yml` 에 아래가 있는지 확인한다.

```yaml
server:
  forward-headers-strategy: framework
```

SSE 확인 (생성 API 가 붙은 뒤):

```bash
# 이벤트가 한 번에 쏟아지지 않고 하나씩 흘러나와야 한다
curl -N https://newvent.duckdns.org/api/admin/events/1/generate
```

---

## 6. 자주 걸리는 것

| 증상 | 원인 |
| --- | --- |
| certbot 이 검증 실패 | DNS 가 EIP 를 안 가리킴, 또는 보안그룹 80 이 닫힘 |
| nginx 기동 실패 (`ssl_certificate` 못 찾음) | 3-1 을 건너뛰고 바로 `newvent.conf` 를 올림 |
| 로그인이 유지 안 됨 | `X-Forwarded-Proto` 누락 → `Secure` 쿠키 미발급 |
| 생성 진행 표시가 안 움직임 | `proxy_buffering off` 누락 |
| 60초쯤 지나 504 | `proxy_read_timeout` 기본값(60s) |
| 배포했는데 화면이 그대로 | `index.html` 이 캐시됨 → `Cache-Control: no-cache` 확인 |
| 없는 JS 요청에 200 + HTML | 정적 경로에 `try_files … =404` 누락 |
| `/admin` 이 404 | 끝 슬래시 없는 요청 → `location = /admin` 리다이렉트 확인 |

---

## 7. 이 문서가 다루지 않는 것

- **소스 구조·빌드 설정** — Vite 진입점 2개(사용자·관리자), `assetsDir: 'static'`
- **배포 워크플로** — GitHub Actions OIDC + SSM Run Command (인프라 문서 5장)
- **백엔드 Dockerfile** — 인프라 문서 8장 3번

셋 다 아직 없다. 특히 `assetsDir` 는 **빌드 설정을 잡을 때 반드시 같이** 정해야
`/assets/` 가 event.css 와 충돌하지 않는다.
