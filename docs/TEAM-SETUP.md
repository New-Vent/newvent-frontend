# 팀원 로컬 세팅 (AWS)

**받은 것**: 액세스 키 ID + 시크릿 액세스 키 (`newvent1` ~ `newvent7` 중 본인 것)

이 문서대로 하면 두 가지가 된다.
1. 로컬에서 **Bedrock API** 호출 (백엔드 개발용)
2. **EC2 서버 접속** (SSH 아님 — SSM 세션)

> ⚠ **액세스 키를 Slack·노션·git 에 올리지 말 것.**
> 올라갔으면 바로 조장에게 말하고 키를 재발급받는다. 지우는 게 아니라 **새로 받는다.**

---

## 1. 도구 설치

### macOS

```bash
brew install awscli
brew install --cask session-manager-plugin
```

### Windows (PowerShell, 관리자)

```powershell
winget install --id Amazon.AWSCLI -e
winget install --id Amazon.SessionManagerPlugin -e
```

### 설치 확인

```bash
aws --version
session-manager-plugin
```

`aws-cli/2.x` 와 `The Session Manager plugin is installed successfully` 가 나오면 된다.
Windows 는 설치 후 **터미널을 새로 열어야** PATH 가 잡힌다.

---

## 2. 자격증명 등록

프로젝트 전용 프로필로 넣는다. 다른 AWS 작업과 섞이지 않는다.

```bash
aws configure --profile newvent
```

```
AWS Access Key ID     : (받은 키 ID)
AWS Secret Access Key : (받은 시크릿)
Default region name   : ap-northeast-2
Default output format : json
```

매번 `--profile newvent` 를 치기 싫으면 기본값으로 지정한다.

```bash
# macOS / Linux — ~/.zshrc 나 ~/.bashrc 에 추가
export AWS_PROFILE=newvent
```

```powershell
# Windows PowerShell — 프로필에 추가
[Environment]::SetEnvironmentVariable('AWS_PROFILE', 'newvent', 'User')
```

### 확인

```bash
aws sts get-caller-identity
```

```jsonc
{
  "UserId": "AIDA…",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/newvent3"   // 본인 이름이 나와야 한다
}
```

---

## 3. Bedrock 확인

**리전이 다르다.** 앱은 서울(`ap-northeast-2`)이지만 **Bedrock 만 버지니아(`us-east-1`)** 다.
서울에 gemma 가 없어서 그렇다. 코드에 `BEDROCK_REGION` 으로 분리돼 있다.

### 모델이 보이는지

```bash
aws bedrock list-foundation-models --region us-east-1 \
  --query "modelSummaries[?contains(modelId,'gemma')].modelId" --output table
```

`google.gemma-3-27b-it` 가 보이면 권한이 정상이다.

### 실제로 호출되는지

```bash
aws bedrock-runtime converse \
  --region us-east-1 \
  --model-id google.gemma-3-27b-it \
  --messages '[{"role":"user","content":[{"text":"한 문장으로 자기소개 해줘"}]}]' \
  --inference-config '{"maxTokens":100}' \
  --query 'output.message.content[0].text' --output text
```

응답이 나오면 로컬 개발 준비 끝이다.

> 호출 1회에 약 0.3원이다. **테스트를 반복 실행하지 말 것** —
> 비용 알람이 걸려 있고, 예측이 6배 빗나간 전례가 있다.

### Java 쪽

`BedrockClient` 코드를 고칠 게 없다. AWS SDK 기본 자격증명 체인이
로컬에서는 `~/.aws/credentials` 를, EC2 에서는 인스턴스 역할을 알아서 찾는다.
`AWS_PROFILE` 만 맞춰두면 된다.

---

## 4. EC2 접속

**SSH 가 아니다.** 22번 포트를 안 열기로 했고, 키페어도 없다.
SSM 세션으로 들어간다 — 자격증명은 위에서 등록한 것을 그대로 쓴다.

### 인스턴스 ID 찾기

```bash
aws ec2 describe-instances --region ap-northeast-2 \
  --query "Reservations[].Instances[].[InstanceId,State.Name,PublicIpAddress]" \
  --output table
```

### 접속

```bash
aws ssm start-session --region ap-northeast-2 --target i-0abc123def456
```

`ssm-user` 로 들어간다. 루트 작업은:

```bash
sudo su -
```

나올 때는 `exit` 를 두 번 (루트 → ssm-user → 세션 종료).

### 로그 보기 (자주 쓰는 것)

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
sudo systemctl status nginx
sudo docker compose logs -f --tail=100     # 백엔드 컨테이너
```

### 서버의 포트를 로컬로 끌어오기

`:8080` 은 밖으로 안 열려 있다. 로컬 브라우저로 직접 보고 싶을 때만 쓴다.

```bash
aws ssm start-session --region ap-northeast-2 \
  --target i-0abc123def456 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8080"],"localPortNumber":["18080"]}'
```

열어둔 동안 로컬에서 `http://localhost:18080` 으로 붙는다.

---

## 5. 안 될 때

| 증상 | 원인 · 조치 |
| --- | --- |
| `aws: command not found` | 터미널을 새로 연다 (PATH) |
| `The config profile (newvent) could not be found` | `aws configure --profile newvent` 를 다시 |
| `sts get-caller-identity` 에서 `InvalidClientTokenId` | 키를 잘못 붙여넣음. 앞뒤 공백 확인 |
| Bedrock 에서 `AccessDeniedException` | `--region us-east-1` 을 빠뜨렸는지 확인. 그래도 나면 조장에게 |
| `SessionManagerPlugin is not found` | 플러그인 미설치. 1장으로 |
| `TargetNotConnected` | 인스턴스가 SSM 에 안 붙음. **조장이 확인할 문제** — 인스턴스 역할과 아웃바운드 443 |
| `AccessDeniedException` (start-session) | SSM 정책이 아직 안 붙음. 조장에게 |
| 인스턴스 목록이 비어 있음 | 리전을 확인 (`ap-northeast-2`) |

---

## 6. 조장이 준비해야 하는 것 (참고)

팀원 각자가 아니라 **조장이 한 번** 하는 것들이다.

```bash
# Bedrock 호출 권한
aws iam create-policy --policy-name NewVentBedrockInvoke \
  --policy-document file://deploy/iam/bedrock-invoke-policy.json

# EC2 접속 권한
aws iam create-policy --policy-name NewVentSsmSession \
  --policy-document file://deploy/iam/ssm-session-policy.json

# 사용자 7명에게 둘 다 연결
for i in 1 2 3 4 5 6 7; do
  aws iam attach-user-policy --user-name "newvent$i" \
    --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/NewVentBedrockInvoke
  aws iam attach-user-policy --user-name "newvent$i" \
    --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/NewVentSsmSession
done
```

`<ACCOUNT_ID>` 는 `aws sts get-caller-identity --query Account --output text` 로 확인한다.
`ssm-session-policy.json` 안의 `<ACCOUNT_ID>` 도 같이 바꿔야 한다.
