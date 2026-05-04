# Drama Planner - Deployment Guide

드라마 플래너 앱을 당신의 개인 서버에 배포하고, 여자친구의 노트북에서 접근 가능하게 설정하는 가이드입니다.

## 📋 아키텍처

```
Spark LLM Server (연구실)
    ↓
Your Personal Server (Docker)
    ↓
Girlfriend's Laptop (Browser)
```

---

## 🚀 빠른 시작 (Docker)

### 전제조건

- Docker & Docker Compose 설치
- LLM 서버 접근 가능 (SSH 터널 또는 네트워크)

### 1️⃣ 당신의 개인 서버에서

```bash
git clone <repo-url>
cd drama-planner
```

### 2️⃣ 환경 설정

`.env.production` 파일 생성:

```bash
cat > .env.production <<EOF
# LLM Configuration (Spark 연구실 서버)
OPENAI_BASE_URL=http://127.0.0.1:18000/v1
OPENAI_API_KEY=sk-local
OPENAI_MODEL=Qwen/Qwen3.6-35B-A3B-FP8

# Server Configuration
HOST=0.0.0.0
PORT=8765
NODE_ENV=production
EOF
```

**SSH 터널 설정** (개인 서버에서 Spark에 접근하려면):

```bash
# 백그라운드에서 SSH 터널 유지
ssh -N spark-llm &
```

또는 systemd 서비스로 자동화 (아래 참조).

### 3️⃣ Docker 컨테이너 실행

```bash
docker-compose up -d
```

**상태 확인:**
```bash
docker-compose ps
curl http://localhost:8765/api/health
```

### 4️⃣ 여자친구의 노트북에서 접근

브라우저:
```
http://<your-server-ip>:8765
```

예: `http://192.168.1.100:8765` (같은 네트워크)

---

## 🔒 보안 설정

### 방화벽 설정

```bash
# 같은 네트워크에서만 허용
sudo ufw allow from 192.168.0.0/16 to any port 8765

# 또는 특정 IP만
sudo ufw allow from 192.168.1.50 to any port 8765
```

### HTTPS (선택사항)

Nginx 리버스 프록시 + Let's Encrypt:

```bash
# nginx.conf 예제
upstream drama_planner {
    server localhost:8765;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://drama_planner;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🔄 CI/CD 자동화

### GitHub Actions 워크플로우

**`main` 브랜치 푸시 시 자동 실행:**

1. ✅ TypeScript & Node 검사
2. ✅ 모델 계약 테스트
3. ✅ 백엔드 smoke 테스트
4. ✅ 프로덕션 빌드
5. 🐳 Docker 이미지 빌드 & 푸시 (ghcr.io)

### 수동 배포

```bash
# 당신의 개인 서버에서
cd drama-planner
git pull origin main
docker-compose down
docker-compose up -d --build
```

---

## 🔐 SSH 터널 자동화 (systemd)

Spark 서버에 지속적으로 연결하려면:

### 1️⃣ SSH 키 기반 인증 설정

```bash
ssh-copy-id -i ~/.ssh/id_ed25519 -p 2222 jaeheekim@147.46.94.169
```

### 2️⃣ systemd 서비스 파일

`/etc/systemd/system/spark-tunnel.service`:

```ini
[Unit]
Description=SSH Tunnel to Spark LLM Server
After=network.target

[Service]
Type=simple
User=your-username
ExecStart=/usr/bin/ssh -N -o ServerAliveInterval=60 -o ServerAliveCountMax=3 spark-llm
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 3️⃣ 활성화

```bash
sudo systemctl daemon-reload
sudo systemctl enable spark-tunnel
sudo systemctl start spark-tunnel

# 상태 확인
sudo systemctl status spark-tunnel
```

---

## 📊 모니터링

### 로그 확인

```bash
# Docker 로그
docker-compose logs -f drama-planner

# 특정 기간 로그
docker-compose logs --since 1h drama-planner
```

### 스토리지 확인

```bash
# 프로젝트 데이터
docker-compose exec drama-planner ls -lh /app/storage/projects/

# 백업
docker-compose exec drama-planner ls -lh /app/storage/projects/backups/
```

### 헬스 체크

```bash
curl http://localhost:8765/api/health | jq .
```

---

## 🛠️ 트러블슈팅

### 포트 충돌

```bash
# 포트 8765가 사용 중인 경우
docker-compose down
docker-compose up -d -e PORT=9000
```

### LLM 연결 실패

```bash
# SSH 터널 확인
curl http://127.0.0.1:18000/v1/models

# 터널이 없으면
ssh -N spark-llm &
```

### 스토리지 문제

```bash
# Docker 볼륨 확인
docker volume ls | grep drama

# 볼륨 정리 (주의: 데이터 손실)
docker volume rm drama-planner_drama-planner-storage
```

---

## 📱 여자친구 사용 가이드

### 접근 방법

1. 브라우저 열기
2. 주소창에 `http://<당신의서버IP>:8765` 입력
3. 기획 채팅 시작!

### 주의사항

- 같은 WiFi 네트워크 필요 (또는 VPN)
- 당신의 서버가 켜져 있어야 함
- LLM 질문은 당신의 서버에서 Spark로 전송됨 (비공개)

---

## 🚨 보안 주의사항

⚠️ **현재 프로토타입 상태**
- 인증 없음
- 로컬 네트워크 사용 권장
- 공개 인터넷 노출 금지

---

## 📦 버전 관리

```bash
# Docker 이미지 태그
docker build -t drama-planner:v1.0.0 .
docker push ghcr.io/your-username/drama-planner:v1.0.0

# docker-compose에서 사용
# image: ghcr.io/your-username/drama-planner:v1.0.0
```

---

## 🔗 참고

- CLAUDE.md - 개발 가이드
- docs/backend.md - API 문서
- .github/workflows/ - CI/CD 설정
