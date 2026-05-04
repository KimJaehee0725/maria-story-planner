# 🚀 Drama Planner - Deployment Checklist

## 배포 전 확인사항

### ✅ 코드 품질

- [ ] `npm run check` 통과 (TypeScript + Node 체크)
- [ ] `npm run test:model` 통과 (모델 계약)
- [ ] `npm run test:backend` 통과 (백엔드 smoke)
- [ ] `npm run build` 성공 (프로덕션 번들)

### ✅ Docker 이미지

- [ ] `docker build -t drama-planner:latest .` 성공
- [ ] `docker run drama-planner:latest` 정상 실행
- [ ] `curl http://localhost:8765/api/health` 응답

### ✅ 당신의 개인 서버 준비

- [ ] Docker & Docker Compose 설치
- [ ] 포트 8765 방화벽 오픈 (또는 특정 IP만)
- [ ] `.env.production` 파일 생성 및 설정
- [ ] SSH 터널 설정 (Spark LLM 접근)

### ✅ 배포 실행

```bash
# 1. 저장소 클론
git clone <repo-url>
cd drama-planner

# 2. 환경 파일 생성
cp .env.example .env.production
# 필요시 수정: OPENAI_BASE_URL, OPENAI_API_KEY 등

# 3. SSH 터널 시작 (백그라운드)
ssh -N spark-llm &

# 4. Docker 컨테이너 실행
docker-compose up -d

# 5. 상태 확인
docker-compose ps
curl http://localhost:8765/api/health
```

### ✅ 여자친구 접근 테스트

- [ ] `http://<your-server-ip>:8765` 브라우저 접근
- [ ] 프로젝트 대시보드 로딩 확인
- [ ] 데이터 생성/수정 테스트
- [ ] LLM 채팅 테스트 (설정 후)

---

## 🔄 CI/CD 파이프라인

### 자동 실행되는 조건

| 이벤트 | 워크플로우 | 단계 |
|-------|---------|------|
| PR to main/develop | `ci.yml` | 체크, 테스트, 빌드 |
| Push to main | `deploy.yml` | Docker 이미지 빌드 & ghcr.io 푸시 |
| Tag (v*) | `deploy.yml` | 버전 태그 이미지 생성 |

### 수동 배포

```bash
# 1. 최신 코드 받기
git pull origin main

# 2. 컨테이너 재시작 (새 이미지 빌드)
docker-compose down
docker-compose up -d --build

# 3. 로그 확인
docker-compose logs -f
```

---

## 📊 배포 후 점검

### 헬스 체크

```bash
# API 상태
curl -s http://localhost:8765/api/health | jq .

# 스토리지
docker-compose exec drama-planner du -sh /app/storage/

# 백업
docker-compose exec drama-planner ls -lh /app/storage/projects/backups/
```

### 로그 모니터링

```bash
# 실시간 로그
docker-compose logs -f drama-planner

# 지난 1시간 로그
docker-compose logs --since 1h drama-planner

# 에러만 필터
docker-compose logs drama-planner 2>&1 | grep -i error
```

### 성능 확인

```bash
# Docker 리소스 사용량
docker stats drama-planner

# 저장 용량
docker volume inspect drama-planner_drama-planner-storage
```

---

## 🔐 보안 체크리스트

- [ ] 방화벽 설정 (필요한 포트만 오픈)
- [ ] 환경 파일 `.env.production` 커밋 안 함
- [ ] Git 저장소가 비공개 (또는 민감 데이터 제거)
- [ ] 주기적 백업 (프로젝트 데이터)
- [ ] SSH 키 기반 인증 (비밀번호 제거)

---

## 🆘 문제 해결

### 포트 충돌
```bash
docker-compose down
docker-compose up -d -e PORT=9000
```

### LLM 연결 실패
```bash
# SSH 터널 확인
curl http://127.0.0.1:18000/v1/models

# 재연결
pkill -f "ssh -N spark-llm"
ssh -N spark-llm &
```

### 스토리지 부족
```bash
# 오래된 백업 정리
docker-compose exec drama-planner rm /app/storage/projects/backups/*-7days-ago
```

---

## 📱 사용자 가이드 (여자친구)

### 접근 방법
1. 브라우저 열기
2. `http://<당신의서버IP>:8765` 입력
3. 기획 채팅 시작

### 주의사항
- 같은 네트워크 필요
- 당신의 서버 켜짐 확인
- 인증 없음 (로컬 네트워크만)

---

## 🎯 다음 단계

### 버전 관리
```bash
# 태그 추가
git tag -a v1.0.0 -m "Initial production release"
git push origin v1.0.0

# Docker 이미지 버전 지정
docker build -t drama-planner:v1.0.0 .
```

### 자동 배포 (선택사항)
- GitHub Actions로 자동 빌드
- Watchtower로 자동 이미지 업데이트
- Prometheus + Grafana로 모니터링

### 확장 (미래)
- 데이터베이스 (PostgreSQL)
- 사용자 인증 (OAuth2)
- CDN (static assets)
- 로드 밸런싱 (여러 인스턴스)

---

**최종 확인**: 모든 체크리스트 항목이 완료되면 프로덕션 배포 준비 완료! ✅
