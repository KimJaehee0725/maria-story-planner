# 🎬 마리아 스토리 플래너 (Maria Story Planner)

드라마/시나리오 기획을 위한 AI 보조 앱입니다. React/Vite 프론트엔드와 Node.js 파일 저장 서버로 구성되어 있습니다.

**핵심 철학**: 사람의 직접 편집과 LLM 제안을 명확히 분리. 모든 AI 제안은 사용자가 명시적으로 승인한 후에만 프로젝트 데이터에 반영됩니다.

---

## 🚀 빠른 시작

### macOS 앱처럼 설치

터미널을 잘 모르는 사용자는 repo 폴더의 `Install Maria Story Planner.command`를 더블클릭하면 됩니다. 설치기는 Node.js를 확인하고, 필요하면 설치를 시도한 뒤 `~/Applications/Maria Story Planner`에 설치본을 만들고 Desktop 바로가기를 생성합니다.

자세한 내용은 [docs/local-app.md](docs/local-app.md)를 참고하세요.

### 개발 환경

**두 개의 터미널을 열고 각각 실행하세요:**

```bash
# 터미널 1: API 서버
npm run dev:server
# http://127.0.0.1:8765 에서 실행

# 터미널 2: 프론트엔드
npm run dev
# http://localhost:5173 에서 실행
```

Vite dev 서버가 `/api` 요청을 자동으로 백엔드로 프록시합니다.

### 프로덕션 배포

```bash
# 빌드
npm run build

# 실행
npm start
# http://localhost:8765 에서 UI + API 제공
```

**Docker 사용** (권장):
```bash
docker-compose up -d
```

자세한 배포 가이드는 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요.

---

## 🎯 주요 기능

### 📝 기획 데이터 관리
- **기본 엔티티**: 프로젝트, 인물, 사건, 조직, 회차(에피소드)
- **관계 설정**: 인물-인물, 인물-조직, 조직-사건 등 임의 연결
- **메타데이터**: 생성자(사람/AI), 검토 상태, 신뢰도, 메모

### 🤖 LLM 기획 보조
- **OpenAI 호환**: vLLM, Ollama, OpenAI API 모두 지원
- **연구실 Spark 서버**: Qwen3.6-35B-A3B 모델 기본 지원
- **안전한 제안 시스템**: LLM 생성 entity는 `llmIntakes` 초안으로 저장
- **승인 기반 반영**: 모든 AI 제안은 사용자 명시적 승인 필요
- **멱등성 보장**: 같은 operation 중복 적용 방지 (`operationLog`)

### 📊 시각화
- Dashboard: 프로젝트 개요
- Timeline: 시간축 기반 사건 배치
- Characters: 인물 정보 및 관계도
- Graph: 네트워크 시각화
- Episodes: 회차 구성

### 💾 데이터 관리
- **파일 기반 저장**: 데이터베이스 없이 JSON으로 관리
- **원자적 쓰기**: temp 파일 + rename으로 부분 저장 방지
- **버전 제어**: revision 번호로 stale write 감지
- **자동 백업**: 저장 전 기존 파일을 `storage/projects/backups/`로 백업

---

## 🏗️ 아키텍처

### 파일 구조

```
drama-planner/
├── server.js              # Node HTTP 서버, persistence, LLM 프록시
├── data-model.js          # 공유 스키마 (서버 + 브라우저)
├── src/
│   ├── App.tsx            # 메인 셸 (네비, 토픔, detail rail, LLM drawer)
│   ├── state/
│   │   └── planner-state.tsx  # Reducer + API 호출 + dirty state 관리
│   ├── components/
│   │   ├── views.tsx      # Dashboard, Timeline, Characters 등
│   │   ├── DetailRail.tsx # 엔티티 상세 편집 + 저장 상태
│   │   └── editors.tsx    # input, textarea, select 등 컨트롤
│   ├── llm/
│   │   └── LlmDrawer.tsx  # LLM 채팅, operation 카드, 승인 UI
│   ├── types.ts           # TypeScript 타입 (data-model.js 기반)
│   └── seed-project.json  # 초기 샘플 데이터
├── tests/
│   └── e2e/               # Playwright E2E 테스트
├── scripts/
│   ├── model-contract-test.js    # data-model.js ↔ types.ts 동기화 검증
│   ├── backend-smoke-test.js     # 백엔드 기본 기능 테스트
│   └── prepare-e2e-storage.js    # E2E 테스트 데이터 준비
├── docs/
│   ├── architecture.md    # 런타임 구조
│   ├── data-model.md      # 엔티티 스키마
│   ├── backend.md         # API 문서
│   └── agent-handoff.md   # 멀티-에이전트 처리
├── Dockerfile             # 프로덕션 빌드 (멀티 스테이지)
├── docker-compose.yml     # 환경변수 + 볼륨 + 헬스체크
├── .github/workflows/
│   ├── ci.yml            # 자동 테스트 & 빌드
│   └── deploy.yml        # Docker 이미지 빌드 & 배포
├── DEPLOYMENT.md          # 배포 가이드
├── DEPLOY_CHECKLIST.md    # 배포 체크리스트
└── CLAUDE.md              # Claude Code 개발 가이드
```

### 데이터 흐름

```
사용자 입력 (View)
    ↓
Action dispatch (planner-state)
    ↓
Reducer (dirty 상태 업데이트)
    ↓
저장 클릭
    ↓
PUT /api/project (전체 프로젝트 + revision)
    ↓
Server validation + atomic write
    ↓
Project data 갱신

---

LLM 메시지
    ↓
POST /api/llm-chat
    ↓
Spark 서버 호출
    ↓
Operation 카드 (draft로 표시)
    ↓
사용자 승인
    ↓
POST /api/operations/apply (approved: true)
    ↓
Server validation + idempotency check
    ↓
Project data 반영
```

### 공유 모델 경계

`data-model.js`가 단일 진실 공급원:

1. **Server**: `require("./data-model")`
2. **Browser**: `src/model.ts` → `window.DramaPlannerModel`

새 엔티티/LLM operation 추가 시:
- `data-model.js` 스키마 정의
- `src/types.ts` TypeScript 타입 추가
- `scripts/model-contract-test.js` 테스트 추가

---

## 🔧 주요 명령어

### 개발

```bash
# 개발 서버 (두 터미널)
npm run dev:server      # 백엔드
npm run dev             # 프론트엔드

# 타입 체크
npm run check
```

### 테스트

```bash
# 모델 계약 테스트 (data-model.js ↔ types.ts 동기화)
npm run test:model

# 백엔드 smoke 테스트
npm run test:backend

# E2E 테스트 (Playwright)
npm run test:e2e
```

### 배포

```bash
# 프로덕션 빌드
npm run build

# 빌드 미리보기
npm run preview

# Docker로 실행
docker-compose up -d
```

### Spark 연구실 서버

```bash
# SSH 터널 확인
npm run smoke:spark

# 백엔드 실행 (Spark 환경변수 자동 주입)
npm run dev:server:spark

# 프로덕션 실행 (Spark)
npm run start:spark
```

---

## 🧠 LLM 통합

### 환경 변수

```bash
OPENAI_BASE_URL=http://127.0.0.1:18000/v1    # Spark 연구실
OPENAI_API_KEY=sk-local
OPENAI_MODEL=Qwen/Qwen3.6-35B-A3B-FP8
```

또는 공개 OpenAI API:
```bash
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

### 지원 파일 형식 (문서 가져오기)

- `.pdf` (PDF 텍스트 추출)
- `.docx` (Word 문서)
- `.txt` (텍스트)
- `.md` (마크다운)

**제한**: 파일당 25MB, 회당 10개/80MB

### LLM Operation 타입

```javascript
[
  "create_entity",      // 새 엔티티 생성
  "update_fields",      // 필드 수정
  "link_entities",      // 관계 생성
  "unlink_entities",    // 관계 제거
  "add_suggestion"      // 제안 추가
]
```

모든 operation:
- ✅ draft로 시작 (`llmIntakes`)
- ✅ 사용자 승인 필요 (`approved: true`)
- ✅ 중복 방지 (`operationLog`)

---

## 💾 데이터 저장소

### 프로젝트 데이터

```
storage/projects/default.json        # 현재 프로젝트 (runtime)
storage/projects/backups/            # 자동 백업 (타임스탬프)
```

### 문서 가져오기

```
storage/imports/{jobId}/
├── originals/          # 업로드된 원본 파일
└── manifest.json       # 추출 텍스트 + 메타데이터
```

### 초기 데이터

```
src/seed-project.json   # 샘플 데이터 (브라우저 fallback)
```

---

## 🚀 배포 (Docker)

### 가장 간단한 방법

```bash
docker-compose up -d
```

이것으로:
- ✅ 프로덕션 빌드 자동
- ✅ 포트 8765 열림
- ✅ 스토리지 영속성 보장
- ✅ 자동 헬스체크
- ✅ LLM 환경변수 주입

### 커스텀 설정

`.env.production` 생성:
```bash
OPENAI_BASE_URL=http://127.0.0.1:18000/v1
OPENAI_API_KEY=sk-local
OPENAI_MODEL=Qwen/Qwen3.6-35B-A3B-FP8
PORT=8765
```

그 후:
```bash
docker-compose up -d
```

자세한 배포 가이드는 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요.

---

## 🔄 CI/CD

### GitHub Actions

**`ci.yml`** - PR/Push 시 자동 실행:
- TypeScript & Node 체크
- 모델 계약 테스트
- 백엔드 smoke 테스트
- 프로덕션 빌드

**`deploy.yml`** - Main 브랜치 푸시 시:
- Docker 이미지 빌드
- ghcr.io로 푸시

### 배포 흐름

```
Git Push to main
    ↓
GitHub Actions CI
    ✅ npm run check
    ✅ npm run test:backend
    ✅ npm run build
    ↓
GitHub Actions Deploy
    🐳 docker build & push
    ↓
Your Server
    docker-compose pull
    docker-compose up -d
    ↓
Girlfriend's Browser
    http://<server-ip>:8765
```

---

## 🛠️ 개발

### 새 엔티티 타입 추가

1. `data-model.js`에서 스키마 정의
2. `src/types.ts`에 TypeScript 타입 추가
3. `scripts/model-contract-test.js`에 테스트 추가
4. `src/components/views.tsx`에 view 컴포넌트 추가
5. `src/components/editors.tsx`에 editor 추가

### 새 LLM Operation 추가

1. `data-model.js`에서 operation 형식 정의
2. `src/types.ts`에 union 타입 추가
3. `src/llm/LlmDrawer.tsx`에 미리보기 처리
4. `src/state/planner-state.tsx`에 apply 로직 추가
5. `npm run test:backend` 테스트

### 버그 수정

1. `data-model.js` 스키마/검증 확인
2. `server.js` persistence 로직 확인
3. `src/state/planner-state.tsx` state flow 추적
4. `scripts/backend-smoke-test.js`에 회귀 테스트 추가

더 자세한 개발 가이드는 [CLAUDE.md](CLAUDE.md)를 참고하세요.

---

## 🎯 사용 시나리오

### 시나리오 1: 당신이 소유한 서버에 배포

1. **서버 준비**
   - Docker & Docker Compose 설치
   - 포트 8765 방화벽 오픈

2. **배포**
   ```bash
   git clone https://github.com/KimJaehee0725/maria-story-planner.git
   cd maria-story-planner
   cp .env.example .env.production
   # 필요시 OPENAI_* 환경변수 수정
   docker-compose up -d
   ```

3. **접근**
   - 당신: `http://localhost:8765`
   - 여자친구: `http://<당신의서버IP>:8765` (같은 네트워크)

### 시나리오 2: 로컬 개발

```bash
git clone https://github.com/KimJaehee0725/maria-story-planner.git
cd maria-story-planner
npm install

# 터미널 1
npm run dev:server

# 터미널 2
npm run dev
```

http://localhost:5173 에서 앱 열기

---

## 🔐 보안

⚠️ **현재 프로토타입 상태**
- 인증 없음
- 로컬 네트워크 사용 권장
- 공개 인터넷 노출 금지

**향후 추가 예정**:
- OAuth2 인증
- HTTPS/SSL
- 접근 제어
- 감사 로그

---

## 📋 API 엔드포인트

전체 API 문서는 [docs/backend.md](docs/backend.md)를 참고하세요.

### 주요 엔드포인트

| Method | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/health` | 서버 상태 |
| `GET` | `/api/project` | 전체 프로젝트 로드 |
| `PUT` | `/api/project` | 프로젝트 저장 (revision 확인) |
| `POST` | `/api/llm-chat` | LLM 메시지 (draft operations 반환) |
| `POST` | `/api/document-imports` | 문서 가져오기 |
| `POST` | `/api/operations/apply` | Operation 적용 (approved: true 필요) |

---

## 📞 지원

### 문제 해결

- **TypeScript 에러**: `npm run check` 실행
- **모델 동기화 문제**: `npm run test:model` 실행
- **백엔드 문제**: `npm run test:backend` 실행
- **빌드 문제**: `npm run build` 실행

### 관련 문서

- [개발 가이드](CLAUDE.md)
- [배포 가이드](DEPLOYMENT.md)
- [배포 체크리스트](DEPLOY_CHECKLIST.md)
- [아키텍처](docs/architecture.md)
- [데이터 모델](docs/data-model.md)
- [API 참고](docs/backend.md)

---

## 📄 라이선스

MIT License

---

## 🙋 기여

이것은 개인 프로젝트입니다. Fork & modify 자유롭게 하세요!

---

**Made with ❤️ for drama planning**
