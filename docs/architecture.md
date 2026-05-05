# Architecture

이 앱은 React/Vite/TypeScript 프론트엔드와 파일 저장 기반 Node HTTP 서버로 구성된다. 현재 목표는 기획 데이터 편집과 LLM 제안을 분리해, 사람이 승인한 operation만 프로젝트 데이터에 반영하는 것이다.

## Runtime Layout

- `server.js`: API, 파일 저장, production 정적 파일 서빙, OpenAI-compatible LLM 호출을 담당한다.
- `data-model.js`: 프로젝트 스키마, 엔티티 기본값, 정규화, 검증의 단일 출처다.
- `src/main.tsx`: React 진입점이며 `styles.css`를 그대로 로드한다.
- `src/App.tsx`: 전체 shell, 내비게이션, topbar, 오른쪽 detail rail, 하단 LLM drawer 배치를 조립한다.
- `src/state/planner-state.tsx`: reducer, 클라이언트 상태, 서버 API 호출, 저장/로드/LLM apply action을 담당한다.
- `src/components/views/`: Dashboard, Timeline, Characters, Graph, Episodes, Organizations 화면 컴포넌트를 둔다.
- `src/components/DetailRail.tsx`: 선택 항목 상세 편집, 저장 bar, 휴지통/복구 UI를 둔다.
- `src/components/editors.tsx`: input, textarea, select, range, relation checklist 같은 편집 컨트롤을 둔다.
- `src/llm/LlmDrawer.tsx`: assistant-ui runtime, composer, operation card, apply/ignore UI를 둔다.
- `src/seed-project.json`: 브라우저 초기 fallback 샘플이다. 런타임 저장 파일인 `storage/projects/default.json`을 프론트 번들에 직접 포함하지 않는다.

## Shared Model Boundary

`data-model.js`는 서버와 브라우저가 공유하는 모델 계층이다.

- 서버는 `require("./data-model")`로 사용한다.
- 브라우저는 `src/model.ts`가 `data-model.js`를 로드한 뒤 `window.DramaPlannerModel`을 typed bridge로 노출한다.
- 새 엔티티 타입, phase, LLM operation type을 추가할 때는 `data-model.js`, `src/types.ts`, `scripts/model-contract-test.js`를 함께 확인한다.

## Frontend State Boundary

`src/state/planner-state.tsx`는 클라이언트 데이터 변경의 중심이다. 화면 컴포넌트는 직접 서버에 저장하지 않고 action을 호출한다.

- 필드 수정, relation checkbox 변경, 생성/복제/삭제/복구는 reducer에서 `dirty` 상태를 만든다.
- 저장은 `PUT /api/project`로 전체 프로젝트를 보내며 revision conflict를 UI 상태로 표시한다.
- LLM 메시지 전송은 `POST /api/llm-chat`만 호출하고, 응답 operation은 `llmIntakes`에 저장된 draft로 표시한다.
- LLM operation 적용은 `POST /api/operations/apply`를 `approved: true`와 함께 호출한 뒤 서버 프로젝트를 다시 로드한다.

## Backend Boundary

`server.js`는 HTTP orchestration과 persistence만 담당해야 한다. 엔티티 모양을 직접 만들 때도 shared model의 `normalizeProjectData`, `normalizeCollectionEntity`, `validateProjectData`를 거쳐야 한다.

저장 원칙:

- 전체 프로젝트 저장은 `revision`을 비교해 stale overwrite를 거부한다.
- 파일 쓰기는 queue로 직렬화하고 atomic rename을 사용한다.
- 저장 전 validation이 실패하면 파일을 쓰지 않는다.
- LLM operation은 명시 승인과 idempotency 검사를 통과해야 적용된다.

## Development Vs Production

개발 중에는 서버와 Vite를 분리한다.

```bash
npm run dev:server
npm run dev
```

배포 또는 단일 서버 실행은 build 결과를 먼저 만든다.

```bash
npm run build
npm start
```

`npm start`는 `dist/index.html`이 있으면 production UI를 서빙한다. `dist/`가 없으면 API는 계속 제공하고, 루트 화면에는 Vite 개발 서버를 켜라는 안내 HTML을 보여준다.
