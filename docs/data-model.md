# Data Model

이 모델은 드라마 기획자가 직접 편집한 정보와 LLM이 자연어에서 추출하거나 제안한 정보를 같은 구조 안에서 다루기 위한 초안이다.

## Core Entities

- `project`: 작품 단위 메타데이터. 제목, 장르, 로그라인, 톤, 언어, 상태를 가진다.
- `character`: 인물. 욕망, 상처, 비밀, 내적 모순, 심리 아크를 가진다.
- `organization`: 제작사, 경찰서, 기업, 공공기관 같은 조직/기관. 목적, 압박 수단, 리스크를 가진다.
- `event`: 사건. 시점, 구간, 개요, 관련 인물/조직, 사건별 심리 변화, 서사 영향도를 가진다.
- `episode`: 회차 또는 Act 카드. Hook, 전환점, 떡밥 회수, 연결 사건/인물을 가진다.
- `link`: 인물-인물, 인물-조직, 조직-사건 등 임의 두 엔티티의 관계.
- `issue`: 설정 보강이 필요한 점검 항목.
- `suggestion`: LLM이 만든 아이디어 또는 수정 제안.
- `llmIntakes`: 자연어 입력, LLM 채팅 turn, 문서 가져오기 turn, 검토용 operation 묶음.
- `revision`: 프로젝트 전체 저장 버전. 브라우저가 오래된 데이터를 덮어쓰지 않도록 `PUT /api/project`에서 비교한다.
- `savedAt`: 마지막 저장 시각.

## LLM Compatibility

모든 주요 엔티티는 다음 메타데이터를 공통으로 가진다.

- `createdBy`: `human` 또는 `llm`
- `provenance`: 자연어 입력 원문, 출처, 입력 시점
- `review`: 사람이 검토했는지와 LLM confidence
- `status`: `active`, `draft`, `archived` 등 작업 상태. 삭제 UI는 실제 제거 대신 `archived`로 바꾸고 휴지통에서 복구한다.
- `notes`: 사람이 남긴 추가 메모

LLM 백엔드는 자연어 입력을 바로 DB에 반영하지 않고, 먼저 다음 operation으로 변환하는 것을 기본값으로 둔다.

- `create_entity`
- `update_fields`
- `link_entities`
- `unlink_entities`
- `add_suggestion`

초기 구현에서는 모든 LLM operation을 `requiresReview: true`로 만들고, `POST /api/operations/apply`에 `approved: true`가 들어온 경우에만 실제 데이터에 반영한다. 적용한 operation id는 `operationLog`에 남겨 재전송 시 중복 적용을 막는다.

`POST /api/llm-chat`과 `POST /api/document-imports`로 저장되는 `llmIntakes` 항목은 turn 단위다. 최소 필드:

- `id`
- `userMessage`
- `assistantMessage`
- `scope`
- `selectedType`
- `selectedId`
- `operations`
- `status`
- `createdAt`
- `provider`
- `provenance`

`provenance`는 사용자 입력 원문 또는 문서 import 출처, 서버 prompt, LLM raw content를 보존한다. 문서 import turn의 `provenance.source`는 `document_import`이며, `importJobId`, 원본 저장 경로, manifest 경로, 파일 메타데이터, prompt text truncation 여부를 추가로 가진다. 이 기록은 추적용이며, 실제 엔티티 변경은 승인된 operation이 `operationLog`에 남은 뒤에만 발생한다.

문서 import manifest는 `storage/imports/{jobId}/manifest.json`에 저장된다. manifest의 파일 항목에는 원본 파일명, 저장 파일명, MIME, 크기, sha256, 추출 텍스트, 추출 텍스트 길이, warning, 파일별 오류가 포함될 수 있다. API 응답용 `importJob`은 추출 텍스트 본문을 제외한다.
