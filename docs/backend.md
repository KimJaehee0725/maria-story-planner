# Backend API

이 백엔드는 Node HTTP 서버다. 연구실 로컬 서버에 올린 뒤 `npm start`로 실행하면 정적 UI와 API를 함께 제공한다. LLM 응답 wire schema 검증에는 `zod`를 사용하고, 프로젝트/대상 id/collection 검증은 서버의 도메인 검증 함수에서 처리한다.

## Storage

- 기본 저장 파일: `storage/projects/default.json`
- 백업 경로: `storage/projects/backups/`
- 자연어 입력 로그: `storage/llm-intakes.jsonl`
- 문서 가져오기 보관 경로: `storage/imports/{jobId}/originals/`
- 문서 가져오기 manifest: `storage/imports/{jobId}/manifest.json`
- `STORAGE_DIR=/path/to/storage npm start`로 저장 경로를 바꿀 수 있다.
- 기본 listen host는 `127.0.0.1`이다. LAN 공유가 꼭 필요할 때만 `HOST=0.0.0.0 npm start`를 사용한다. 현재 인증 계층은 없으므로 공개 네트워크에 노출하면 안 된다.

## LLM Provider

하단 채팅은 OpenAI-compatible `/chat/completions` API를 서버에서 호출한다. 필요한 환경변수:

- `OPENAI_BASE_URL`: compatible endpoint base URL. 없으면 `https://api.openai.com/v1`을 사용한다.
- `OPENAI_API_KEY`: provider API key. 브라우저로 내려보내지 않는다.
- `OPENAI_MODEL`: provider에 전달할 모델 이름.

예시:

```bash
OPENAI_BASE_URL=http://127.0.0.1:8000/v1 \
OPENAI_API_KEY=local-key \
OPENAI_MODEL=local-model \
npm start
```

로컬 vLLM도 같은 OpenAI-compatible contract로 연결한다. 현재 앱 코드에는 LiteLLM을 도입하지 않는다.

`OPENAI_API_KEY` 또는 `OPENAI_MODEL`이 없으면 `POST /api/llm-chat`은 `503 LLM_DISABLED`를 반환한다. 이 상태에서도 `POST /api/llm-intakes` 휴리스틱 경로는 테스트/개발 fallback으로 사용할 수 있다.

vLLM smoke 절차:

1. `OPENAI_BASE_URL=http://server:port/v1`, non-empty `OPENAI_API_KEY`, `OPENAI_MODEL=...`로 서버를 실행한다.
2. 하단 LLM drawer에서 메시지를 전송한다.
3. 응답 operation이 승인 전 프로젝트 엔티티에 반영되지 않는지 확인한다.
4. `POST /api/operations/apply` 또는 UI의 `반영` 버튼으로 `approved: true`를 보낸 뒤 1회 반영되는지 확인한다.
5. 같은 operation id를 다시 apply하면 `skipped: true`, `reason: already_applied`가 반환되는지 확인한다.

## Project API

- `GET /api/project`: 전체 프로젝트 로드
- `PUT /api/project`: 전체 프로젝트 저장
- 저장 시 `revision`, `project.updatedAt`, `savedAt`이 갱신되고 기존 파일은 백업된다.
- `PUT /api/project`는 요청 body의 `revision`이 현재 저장 파일과 같을 때만 성공한다. 다르면 `409 REVISION_CONFLICT`를 반환한다.
- 참조 무결성이나 중복 id 검증에 실패하면 저장하지 않고 `400 VALIDATION_FAILED`를 반환한다.
- 저장 파일 JSON이 깨진 경우 최신 valid backup을 찾아 복구하고 `recoveredFromBackup: true`를 반환한다.

## Entity API

지원 collection:

- `characters`
- `organizations`
- `events`
- `episodes`
- `links`
- `issues`
- `suggestions`

엔드포인트:

- `GET /api/entities/:collection`
- `POST /api/entities/:collection`
- `GET /api/entities/:collection/:id`
- `PATCH /api/entities/:collection/:id`
- `DELETE /api/entities/:collection/:id`

삭제는 hard delete가 아니라 `status: archived`로 변경한다. 참조는 유지되며, 프론트 UI에서는 일반 목록에서 숨기고 휴지통에서 복구한다.

## LLM Chat Flow

`POST /api/llm-chat`은 자연어 메시지와 현재 선택 항목을 LLM에 보내고, 검토 가능한 operation 묶음을 프로젝트의 `llmIntakes`에 채팅 turn으로 저장한다. LLM output은 직접 프로젝트 엔티티를 수정하지 않는다.

요청 예시:

```json
{
  "message": "윤하라는 인물을 추가하고 지유의 과거 보육원 친구로 설정해줘.",
  "scope": "characters",
  "selectedType": "character",
  "selectedId": ""
}
```

성공 응답:

```json
{
  "ok": true,
  "assistantMessage": "윤하 인물 초안을 만들었습니다.",
  "operations": [
    {
      "id": "op-chat-example-0",
      "type": "create_entity",
      "requiresReview": true,
      "payload": {
        "entityType": "character",
        "collection": "characters",
        "fields": {
          "name": "윤하",
          "createdBy": "llm",
          "review": { "state": "needs_review", "confidence": 0.82 }
        }
      }
    }
  ],
  "revision": 12
}
```

`operations`는 `create_entity`, `update_fields`, `link_entities`, `unlink_entities`, `add_suggestion`만 허용한다. 서버는 LLM JSON을 파싱한 뒤 Zod로 operation wire schema를 검증하고, 이어서 대상 id와 collection 같은 도메인 조건을 검증한다. 모든 operation은 `requiresReview: true`로 저장된다. Provider 500은 `502 LLM_PROVIDER_ERROR`, JSON 파싱 실패는 `502 LLM_BAD_JSON`, operation 검증 실패는 `502 LLM_BAD_OPERATION`으로 반환한다.

각 채팅 turn은 `id`, `userMessage`, `assistantMessage`, `scope`, `selectedType`, `selectedId`, `operations`, `status`, `createdAt`, `provider`, `provenance`를 가진다. `provenance`에는 사용자 입력, 서버가 보낸 prompt, LLM raw content, usage가 저장되어 나중에 어떤 자연어 입력에서 제안이 만들어졌는지 추적할 수 있다.

## Document Import Flow

`POST /api/document-imports`는 `multipart/form-data`로 여러 문서를 받아 서버에서 텍스트를 추출한 뒤, 문서 기반 LLM prompt를 호출하고 기존 LLM 채팅 turn과 같은 `llmIntakes` 항목으로 저장한다. 생성된 operation은 승인 전 프로젝트 엔티티에 반영되지 않는다.

요청 필드:

- `files[]`: 필수, 최대 10개
- `scope`: 선택, 기본값 `project`
- `selectedType`: 선택
- `selectedId`: 선택
- `instruction`: 선택, 문서 이식 지시

지원 파일:

- `.pdf`: `application/pdf`, 추출 가능한 텍스트가 있는 PDF
- `.docx`: Word OpenXML 문서
- `.txt`: UTF-8 텍스트
- `.md`: UTF-8 Markdown

제한:

- 파일 1개 최대 25MB
- job 전체 최대 80MB
- LLM prompt에는 파일별 앞부분을 합산 120k chars까지 전달한다. 초과분은 `truncated: true`로 manifest와 provenance에 기록한다.

성공 응답은 `{ ok, importJob, chatTurn, operations, revision, savedAt }`이다. `importJob.files`에는 파일명, MIME, 크기, sha256, 추출 텍스트 길이, 파일별 warning이 들어간다. 원본 파일은 `storage/imports/{jobId}/originals/`, 추출 텍스트와 전체 메타데이터는 `storage/imports/{jobId}/manifest.json`에 저장된다.

`GET /api/document-imports/:jobId`는 job 상태, 파일별 메타데이터, 오류, `chatTurnId`를 반환한다. 응답용 `importJob`은 추출 텍스트 본문을 제외한다.

주요 오류:

- `415 UNSUPPORTED_DOCUMENT_TYPE`: 지원하지 않는 확장자/MIME, legacy `.doc`
- `422 DOCUMENT_TEXT_EMPTY`: 스캔 PDF처럼 추출 가능한 텍스트가 없음
- `422 DOCUMENT_TEXT_EXTRACT_FAILED`: 파서가 텍스트 추출에 실패
- `413 DOCUMENT_FILE_TOO_LARGE`: 파일 1개 25MB 초과
- `413 DOCUMENT_IMPORT_TOO_LARGE`: job 전체 80MB 초과
- `413 TOO_MANY_DOCUMENTS`: 10개 초과
- `502 LLM_PROVIDER_ERROR`, `502 LLM_BAD_JSON`, `502 LLM_BAD_OPERATION`: LLM 호출/응답 검증 실패

## LLM Intake Fallback

`POST /api/llm-intakes`는 자연어 입력을 저장하고 휴리스틱으로 검토용 operation 초안을 만든다. provider 없이 빠르게 operation apply 흐름을 테스트할 때 사용한다.

요청 예시:

```json
{
  "text": "새 인물 이름은 윤하. 지유와 과거 보육원에서 만난 친구로 설정해줘.",
  "intent": "parse_and_suggest",
  "scope": "project"
}
```

응답에는 `operations`가 포함된다. 이 operation은 바로 반영하지 않고 사용자가 승인한 뒤 `POST /api/operations/apply`로 적용한다.

## Operation Apply

지원 operation:

- `create_entity`
- `update_fields`
- `link_entities`
- `unlink_entities`
- `add_suggestion`

요청 예시:

```json
{
  "approved": true,
  "operation": {
    "id": "op-example",
    "type": "create_entity",
    "requiresReview": true,
    "payload": {
      "entityType": "character",
      "collection": "characters",
      "fields": {
        "name": "윤하",
        "role": "보육원 친구",
        "createdBy": "llm",
        "review": { "state": "needs_review", "confidence": 0.6 }
      }
    }
  }
}
```

`requiresReview: true`인 operation은 `approved: true`가 없으면 `400 OPERATION_REQUIRES_APPROVAL`로 거부된다. 같은 operation id를 다시 보내면 중복 적용하지 않고 skipped result를 반환한다.
