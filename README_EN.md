# Drama Planner Prototype

드라마 기획 보조 앱 프로토타입입니다. React/Vite 프론트엔드와 Node 파일 저장 서버로 구성되어 있습니다.

## Development

개발 중에는 API 서버와 Vite dev server를 각각 실행합니다.

```bash
npm run dev:server
```

다른 터미널:

```bash
npm run dev
```

기본 URL:

```text
http://localhost:5173
```

Vite dev server는 `/api` 요청을 `http://127.0.0.1:8765`로 proxy합니다.

## Production / Single Server

단일 Node 서버로 UI와 API를 같이 제공하려면 먼저 빌드합니다.

```bash
npm run build
npm start
```

기본 URL:

```text
http://localhost:8765
```

`npm start`는 `dist/index.html`이 있으면 production UI를 서빙합니다. `dist/`가 없으면 API는 실행한 채 루트 화면에 개발 실행 안내를 보여줍니다.

기본 서버는 `127.0.0.1`에서만 열립니다. 같은 네트워크에서 접속해야 할 때만 `HOST=0.0.0.0 npm start`를 사용하세요. 현재 프로토타입에는 인증이 없으므로 공개 네트워크에 노출하지 마세요.

## Storage

저장 버튼을 누르면 프로젝트 데이터가 `storage/projects/default.json`에 기록됩니다. 기존 파일이 있으면 덮어쓰기 전에 `storage/projects/backups/`에 백업을 남깁니다. 저장 파일에는 `revision`이 함께 기록되어 오래된 브라우저 화면이 최신 저장 내용을 덮어쓰지 못하게 막습니다.

프론트 초기 fallback 샘플은 `src/seed-project.json`입니다. `storage/projects/default.json`은 런타임 저장 데이터로만 취급하며, 프론트 번들에서 직접 import하지 않습니다.

## LLM Chat

LLM 채팅은 OpenAI-compatible `/chat/completions` endpoint를 서버에서 호출합니다. API 키는 브라우저로 내려가지 않습니다.

```bash
OPENAI_BASE_URL=http://server:port/v1 \
OPENAI_API_KEY=non-empty-key \
OPENAI_MODEL=your-model-name \
npm start
```

로컬 vLLM도 같은 env contract로 연결합니다. LiteLLM은 현재 앱 코드에 도입하지 않습니다.

`OPENAI_API_KEY` 또는 `OPENAI_MODEL`이 없으면 하단 채팅은 `503 LLM_DISABLED`를 반환합니다. 기존 `POST /api/llm-intakes` 휴리스틱 경로는 로컬 테스트/개발 fallback으로 남아 있습니다. `/api/llm-chat`은 LLM 응답의 operation wire schema를 Zod로 검증한 뒤, 승인 전에는 프로젝트 엔티티에 반영하지 않습니다.

LLM drawer의 문서 가져오기는 같은 provider 설정을 사용합니다. 지원 파일은 `.pdf`, `.docx`, `.txt`, `.md`이며, legacy `.doc`, 스캔 PDF, 이미지 OCR은 v1에서 지원하지 않습니다. 파일 1개는 25MB, 한 번의 가져오기는 10개 파일/80MB까지 허용됩니다.

업로드 원본은 `storage/imports/{jobId}/originals/`에 보관되고, 추출 텍스트와 파일 메타데이터는 `storage/imports/{jobId}/manifest.json`에 저장됩니다. 문서에서 생성된 operation도 승인 전에는 엔티티에 반영되지 않으며, 기존 `반영`/`무시` 카드 흐름을 그대로 사용합니다.

DGX Spark 연구실 서버를 쓸 때는 SSH 터널을 먼저 열어둔 뒤 Spark 전용 스크립트를 사용합니다.

```bash
ssh -N spark-llm
```

다른 터미널:

```bash
npm run smoke:spark
npm run dev:server:spark
```

프론트엔드 개발 서버는 평소처럼 별도 터미널에서 실행합니다.

```bash
npm run dev
```

단일 production 서버로 실행할 때는 `npm run build` 후 `npm run start:spark`를 사용합니다. Spark 스크립트는 `OPENAI_BASE_URL=http://127.0.0.1:18000/v1`, `OPENAI_API_KEY=sk-local`, `OPENAI_MODEL=Qwen/Qwen3.6-35B-A3B-FP8`를 서버에 주입합니다.

vLLM smoke 절차:

1. `OPENAI_BASE_URL=http://server:port/v1`, non-empty `OPENAI_API_KEY`, `OPENAI_MODEL=...`로 서버를 실행합니다.
2. 하단 `기획 채팅` drawer를 열고 메시지를 전송합니다.
3. operation 카드가 승인 전에는 엔티티에 반영되지 않는지 확인합니다.
4. `반영`을 눌러 1회만 적용되는지 확인합니다.
5. 같은 operation을 다시 apply하면 서버 응답의 result가 `skipped: true`, `reason: already_applied`인지 확인합니다.

## Scripts

- `npm run check`: Node syntax check와 TypeScript check
- `npm run build`: TypeScript check 후 Vite production build
- `npm run test:backend`: model contract와 backend smoke test
- `npm run test:e2e`: Playwright frontend smoke test
- `npm run test:frontend`: `test:e2e` alias

## API

- `GET /api/health`: 서버/저장소 상태 확인
- `GET /api/schema`: 엔티티 타입과 LLM operation 스키마 확인
- `GET /api/project`, `PUT /api/project`: 프로젝트 전체 로드/저장
- `GET /api/entities/:collection`: 인물, 사건, 조직 등 목록 조회
- `POST /api/entities/:collection`: 개별 엔티티 생성
- `GET /api/entities/:collection/:id`: 개별 엔티티 조회
- `PATCH /api/entities/:collection/:id`: 개별 엔티티 수정
- `DELETE /api/entities/:collection/:id`: 개별 엔티티를 휴지통 상태(`status: archived`)로 변경
- `POST /api/llm-chat`: 서버 LLM 설정으로 검토 가능한 operation 제안 생성
- `POST /api/document-imports`: 여러 문서에서 텍스트를 추출해 검토 가능한 operation 제안 생성
- `GET /api/document-imports/:jobId`: 문서 가져오기 작업 상태와 파일별 메타데이터 조회
- `POST /api/llm-intakes`: 자연어 입력 저장 및 검토용 operation 초안 생성
- `POST /api/operations/apply`: 승인된 operation을 실제 프로젝트 데이터에 반영

데이터 모델 설명은 `docs/data-model.md`, 백엔드 API 설명은 `docs/backend.md`, 코드 구조와 유지보수 경계는 `docs/architecture.md`를 참고하세요.
