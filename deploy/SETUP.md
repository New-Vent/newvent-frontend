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

## 1. IAM — 먼저 만든다

### ★ EC2 에는 IAM **사용자**가 아니라 **역할(Role)** 을 붙인다

사용자의 액세스 키를 서버에 심으면 키가 유출 경로가 되고 순환도 수동이다.
역할을 붙이면 **자격증명이 어디에도 저장되지 않고** 자동으로 순환된다.
AWS SDK 기본 체인이 알아서 찾으므로 **코드는 한 줄도 안 바뀐다.**

| 용도 | 유형 | 개수 | 자격증명 |
| --- | --- | :-: | --- |
| 팀원 개발용 | IAM **User** | 1인 1개 | `aws configure` → `~/.aws/credentials` |
| EC2 | IAM **Role** + 인스턴스 프로파일 | 1 | 없음 (메타데이터에서 자동) |
| GitHub Actions | IAM **Role** (OIDC) | 1 | 없음 (임시) |

정책 문서는 `deploy/iam/` 에 있다.

### ★ 정책이 두 종류다 — 붙여넣는 자리가 다르다

| 파일 | 종류 | 콘솔에서 붙여넣는 곳 |
| --- | --- | --- |
| `bedrock-invoke-policy.json` | **권한 정책** (identity) | 역할 → **권한** → 인라인 정책 생성 → JSON |
| `ec2-trust-policy.json` | **신뢰 정책** (trust) | 역할 → **신뢰 관계** 탭 → 신뢰 정책 편집 |
| `github-oidc-trust-policy.json` | **신뢰 정책** (trust) | 위와 같음 |

- **권한 정책** = "이 역할이 무엇을 할 수 있나" → `Resource` **필수**, `Principal` **금지**
- **신뢰 정책** = "누가 이 역할을 맡을 수 있나" → `Principal` **필수**, `Resource` 없음

신뢰 정책을 인라인 정책 칸에 넣으면 이렇게 거절된다:

```
Missing Resource: 정책 설명에 Resource 또는 NotResource 요소를 추가합니다.
Unsupported Principal: 정책 유형 IDENTITY_POLICY은(는) Principal 요소를 지원하지 않습니다.
```

> 콘솔로 만들면 **신뢰 정책을 붙여넣을 일이 없다.**
> 역할 생성에서 *신뢰할 수 있는 엔터티 유형: AWS 서비스 → 사용 사례: EC2* 를 고르면
> 같은 내용이 자동으로 들어간다. `deploy/iam/*-trust-policy.json` 은 CLI 용이거나
> 나중에 신뢰 관계를 확인할 때 보는 참고본이다.

### 1-1. 공통 정책 하나 만들기

```bash
aws iam create-policy \
  --policy-name NewVentBedrockInvoke \
  --policy-document file://deploy/iam/bedrock-invoke-policy.json
```

> `bedrock:ListFoundationModels` 만 `Resource: "*"` 다 —
> 이 액션은 리소스 단위 권한을 지원하지 않는다. 모델 호출은 gemma 한 개로 묶여 있다.
> `bedrock:Converse` 라는 IAM 액션은 **없다.** `InvokeModel` 이 Converse 를 인가한다.

### 1-2. 팀원 사용자 (1인 1개)

```bash
for i in 1 2 3 4 5 6 7; do
  aws iam create-user --user-name "newvent$i"
  aws iam attach-user-policy --user-name "newvent$i" \
    --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/NewVentBedrockInvoke
  aws iam attach-user-policy --user-name "newvent$i" \
    --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/NewVentSsmSession
  aws iam create-access-key --user-name "newvent$i"   # 출력된 키를 본인에게만 전달
done
```

> 팀원이 각자 로컬에서 할 일은 [`docs/TEAM-SETUP.md`](../docs/TEAM-SETUP.md) 에 따로 있다.
> 그 문서만 공유하면 된다.

각자 로컬에서:

```bash
aws configure          # region 은 ap-northeast-2, Bedrock 만 us-east-1 (코드가 분리)
aws bedrock list-foundation-models --region us-east-1 --query 'modelSummaries[?contains(modelId,`gemma`)].modelId'
```

> **액세스 키를 Slack·노션·git 에 올리지 말 것.** 올라갔으면 즉시
> `aws iam delete-access-key` 로 지우고 새로 발급한다.

### 1-3. EC2 역할

```bash
aws iam create-role --role-name NewVentEc2Role \
  --assume-role-policy-document file://deploy/iam/ec2-trust-policy.json

aws iam attach-role-policy --role-name NewVentEc2Role \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/NewVentBedrockInvoke

# SSM 접속·배포용 (22번 포트를 안 열기 위해)
aws iam attach-role-policy --role-name NewVentEc2Role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws iam create-instance-profile --instance-profile-name NewVentEc2Profile
aws iam add-role-to-instance-profile \
  --instance-profile-name NewVentEc2Profile --role-name NewVentEc2Role
```

#### 콘솔로 만들 때 (팀 권장 — 인프라 문서가 Terraform 을 안 쓰기로 했다)

1. IAM → **역할** → 역할 생성
2. 신뢰할 수 있는 엔터티 유형: **AWS 서비스** / 사용 사례: **EC2** → 다음
   *(여기서 신뢰 정책이 자동 생성된다. `ec2-trust-policy.json` 을 붙여넣지 않는다.)*
3. 권한 추가: `NewVentBedrockInvoke` 와 `AmazonSSMManagedInstanceCore` 선택
4. 역할 이름 `NewVentEc2Role` → 생성
5. EC2 인스턴스 → 작업 → 보안 → **IAM 역할 수정** 에서 이 역할을 붙인다
   *(인스턴스 프로파일은 콘솔이 알아서 만든다)*

관리형 정책 대신 **인라인 정책**으로 넣고 싶다면
역할 상세 → 권한 → 권한 추가 → **인라인 정책 생성** → JSON 탭에
`deploy/iam/bedrock-invoke-policy.json` 내용을 붙여넣는다.

EC2 를 만들 때 이 인스턴스 프로파일을 지정한다(나중에 붙여도 된다).

서버에서 확인:

```bash
aws sts get-caller-identity          # Arn 에 assumed-role/NewVentEc2Role 이 보여야 한다
ls ~/.aws 2>/dev/null                # 아무것도 없어야 정상이다
```


### 1-4. GitHub Actions 역할 (배포 자동화 때)

`deploy/iam/github-oidc-trust-policy.json` 의 `<ACCOUNT_ID>` 와 저장소 경로를 채운 뒤
역할을 만들고 ECR push · SSM SendCommand 권한을 붙인다.
**GitHub Secrets 에 AWS 장기 키를 넣지 않는다.**

### 1-5. 팀원에게 SSM 접속 권한 (EC2 에 들어가려면 필요)

`NewVentBedrockInvoke` 는 Bedrock 만 허용한다. 서버에 들어가려면 이게 따로 필요하다.

```bash
aws iam create-policy \
  --policy-name NewVentSsmSession \
  --policy-document file://deploy/iam/ssm-session-policy.json

aws iam attach-user-policy --user-name newvent1 \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/NewVentSsmSession
```

`Resource` 가 `instance/*` 라 이 계정의 EC2 면 다 접속된다. 인스턴스가 한 대라
지금은 이걸로 충분하고, 늘어나면 인스턴스 ID 를 직접 박아 좁히면 된다.

`ManageOwnSessionsOnly` 는 `${aws:username}` 으로 **자기 세션만** 끊게 한다 —
남의 작업 세션을 끊지 못한다.


---

## 2. nginx 설치

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

## 3. 디렉터리와 스니펫 배치

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

## 4. 인증서 발급 — 2단계로 나눈다

`newvent.conf` 는 `ssl_certificate` 를 참조한다. 인증서가 없는 상태로 올리면
**nginx 가 기동에 실패**하고, nginx 가 안 떠 있으면 certbot 의 HTTP-01 검증도
실패한다. 그래서 HTTP 전용 설정으로 먼저 띄운다.

### 4-1. 임시 설정으로 80 포트만 띄우기

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

### 4-2. certbot 설치와 발급

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

### 4-3. 본 설정으로 교체

```bash
sudo cp deploy/nginx/newvent.conf /etc/nginx/conf.d/newvent.conf
sudo nginx -t && sudo systemctl reload nginx
```

---

## 5. 갱신 자동화를 첫날에 확인한다

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

## 6. 동작 확인 체크리스트

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

## 7. 자주 걸리는 것

| 증상 | 원인 |
| --- | --- |
| certbot 이 검증 실패 | DNS 가 EIP 를 안 가리킴, 또는 보안그룹 80 이 닫힘 |
| nginx 기동 실패 (`ssl_certificate` 못 찾음) | 4-1 을 건너뛰고 바로 `newvent.conf` 를 올림 |
| 로그인이 유지 안 됨 | `X-Forwarded-Proto` 누락 → `Secure` 쿠키 미발급 |
| 생성 진행 표시가 안 움직임 | `proxy_buffering off` 누락 |
| 60초쯤 지나 504 | `proxy_read_timeout` 기본값(60s) |
| 배포했는데 화면이 그대로 | `index.html` 이 캐시됨 → `Cache-Control: no-cache` 확인 |
| 없는 JS 요청에 200 + HTML | 정적 경로에 `try_files … =404` 누락 |
| `/admin` 이 404 | 끝 슬래시 없는 요청 → `location = /admin` 리다이렉트 확인 |

---

## 8. 이 문서가 다루지 않는 것

- **소스 구조·빌드 설정** — Vite 진입점 2개(사용자·관리자), `assetsDir: 'static'`
- **배포 워크플로** — GitHub Actions OIDC + SSM Run Command (인프라 문서 5장)
- **백엔드 Dockerfile** — 인프라 문서 8장 3번

셋 다 아직 없다. 특히 `assetsDir` 는 **빌드 설정을 잡을 때 반드시 같이** 정해야
`/assets/` 가 event.css 와 충돌하지 않는다.
