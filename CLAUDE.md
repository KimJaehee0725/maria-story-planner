# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Drama Planner is a drama/screenplay planning assistant app. It combines a React/Vite frontend with a Node.js file-based API server. The core design principle is separation of human-edited data from LLM-proposed changes: users explicitly approve operations (entity creation, field updates, linking) before they affect the project data.

## Quick Start

**Development (two terminals):**
```bash
npm run dev:server       # Terminal 1: API at http://127.0.0.1:8765
npm run dev             # Terminal 2: Frontend at http://localhost:5173
```

Frontend proxies `/api` calls to the backend via Vite config.

**Production/Single Server:**
```bash
npm run build           # TypeScript check + Vite build → dist/
npm start              # Serves UI from dist/ + API on same port
```

## Common Commands

- `npm run check` — TypeScript and Node syntax validation (run before commits)
- `npm run build` — Full production build with type checking
- `npm run test:backend` — Model contract + backend smoke tests
- `npm run test:e2e` — Playwright frontend tests (requires prepared storage)
- `npm run preview` — Local preview of production build

**For vLLM/OpenAI integration:**
```bash
OPENAI_BASE_URL=http://server:port/v1 \
OPENAI_API_KEY=key \
OPENAI_MODEL=model-name \
npm start
```

## Architecture

### Runtime Components

- **`server.js`** (67KB) — HTTP server, file persistence (atomic writes), LLM proxy calls. Handles all `/api/*` routes.
- **`data-model.js`** (14KB) — Shared schema source. Entity defaults, validation, normalization. Used by both server (require) and browser (loaded via `src/model.ts` → `window.DramaPlannerModel`).
- **`src/state/planner-state.tsx`** — Reducer + API calls. All entity edits go through action → reducer → server, never direct. Tracks dirty state and revision conflicts.

### Frontend Structure

- **`src/App.tsx`** — Top-level shell: nav, topbar, detail rail, LLM drawer.
- **`src/components/views.tsx`** — Dashboard, Timeline, Characters, Graph, Episodes, Organizations view components.
- **`src/components/DetailRail.tsx`** — Selected entity detail editor, save status, trash/restore UI.
- **`src/components/editors.tsx`** — Input, textarea, select, range, checklist controls.
- **`src/llm/LlmDrawer.tsx`** — Chat interface, operation preview cards, apply/ignore flow.

### Data Flow

1. View components read from React context (from planner-state reducer)
2. User edits → action → reducer updates local state to "dirty"
3. Save click → `PUT /api/project` with full project + revision
4. LLM message → `POST /api/llm-chat` → draft operations stored as `llmIntakes`
5. Approve operation → `POST /api/operations/apply` (needs `approved: true`)

### Shared Model Boundary

When adding entity types, phases, or LLM operations, update these three in lockstep:
- **`data-model.js`** — Schema, defaults, validation rules
- **`src/types.ts`** — TypeScript types that mirror data-model contracts
- **`scripts/model-contract-test.js`** — Sync check between data-model.js and src/types.ts

### Backend Persistence

- **Atomic writes:** Temp file + rename, never partial writes.
- **Revision control:** `PUT /api/project` compares revision to prevent stale overwrites. Backups in `storage/projects/backups/`.
- **LLM operation safety:** Require explicit `approved: true` + idempotency check via `operationLog`.
- **Validation:** All writes validate against data-model rules before persisting.

## Data Storage

- **Project data:** `storage/projects/default.json` (created at runtime, overwrite protected by revision)
- **Fallback/seed:** `src/seed-project.json` (bundled initial data)
- **Document imports:** `storage/imports/{jobId}/originals/` (uploaded files) + `manifest.json` (extracted text)

## LLM Integration

- Backend proxies OpenAI-compatible endpoints (`/v1/chat/completions`). API key never sent to browser.
- Supported file formats: `.pdf`, `.docx`, `.txt`, `.md` (max 10 files/80MB per import, 25MB per file).
- Operations from LLM are drafted in `llmIntakes`, not applied until user clicks approve.
- Idempotency: `operationLog` tracks applied operations to prevent duplicates on retry.

### Spark Research Server

For DGX Spark vLLM testing:
```bash
ssh -N spark-llm                    # Terminal 1: open SSH tunnel
npm run smoke:spark                 # Verify Qwen model available
npm run dev:server:spark            # Terminal 2: backend with Spark env vars
npm run dev                         # Terminal 3: frontend (normal)
```

Production on Spark: `npm run build` then `npm run start:spark`.

## Testing

- **Backend contract:** `npm run test:model` verifies data-model.js ↔ types.ts sync
- **Backend smoke:** `npm run test:backend` also runs backend-smoke-test.js
- **E2E frontend:** `npm run test:e2e` uses Playwright (runs prepare-e2e-storage.js first)

Tests are in `scripts/` (backend) and `tests/e2e/` (Playwright).

## Key Design Decisions

### Revision Control, Not Optimistic Merge

Project saves use explicit revision numbers. A stale browser tab cannot overwrite fresh saves. Conflict shown in UI rather than silent loss.

### LLM Operations Require Approval

All LLM-generated changes (create_entity, update_fields, link_entities, etc.) are drafted and require explicit user approval before affecting the project. This prevents accidental data corruption from hallucinations.

### Shared Model Between Server and Browser

The `data-model.js` file is the single source of truth for schema. Both Node and browser validate against the same rules. Adding a new field means updating data-model.js first, then types.ts and tests.

### File-Based Persistence

No database. Projects saved as single JSON file with atomic write semantics. Backups auto-created before overwrites. Simpler local dev, but rev-control and offline resilience are manual (backups in storage/projects/backups/).

## Common Workflows

**Adding a new entity type:**
1. Define in `data-model.js` (schema, defaults, normalizer)
2. Add TypeScript type in `src/types.ts`
3. Add contract test in `scripts/model-contract-test.js`
4. Create view component in `src/components/views.tsx`
5. Add editor in `src/components/editors.tsx`

**Adding an LLM operation:**
1. Define operation shape in `data-model.js` under LLM operations
2. Add to `src/types.ts` operation union
3. Handle in `src/llm/LlmDrawer.tsx` operation preview
4. Handle in `src/state/planner-state.tsx` apply logic (call `POST /api/operations/apply`)
5. Test via `npm run test:backend` and manual smoke test

**Fixing a bug in data persistence:**
- Check `data-model.js` for schema/validation first
- Verify backend logic in `server.js` (not skipping normalizeProjectData)
- Trace state flow in `src/state/planner-state.tsx`
- Add to `scripts/backend-smoke-test.js` to prevent regression

## API Endpoints

Full reference in `docs/backend.md`. Key ones:
- `GET /api/health` — Server/storage status
- `GET/PUT /api/project` — Load/save entire project (with revision check)
- `GET /api/entities/:collection` — List (characters, events, etc.)
- `POST /api/entities/:collection` — Create
- `PATCH /api/entities/:collection/:id` — Update
- `DELETE /api/entities/:collection/:id` — Archive (soft delete)
- `POST /api/llm-chat` — LLM message, returns draft operations
- `POST /api/document-imports` — Import multiple documents
- `POST /api/operations/apply` — Apply approved operation to project

## Documentation Files

- `docs/data-model.md` — Entity schemas, LLM operation types, metadata fields
- `docs/backend.md` — API route reference and behavior
- `docs/architecture.md` — Runtime layout and persistence principles
- `docs/agent-handoff.md` — Multi-agent scenario handling

## Debugging Tips

- **TypeScript errors:** Run `npm run check` before testing; `tsconfig.json` uses strict mode.
- **Model sync issues:** Run `npm run test:model` to verify data-model.js ↔ types.ts alignment.
- **State not updating:** Check that action was dispatched from reducer, not direct mutation. Verify server `PUT /api/project` succeeded and revision was returned.
- **LLM operation not applying:** Verify `approved: true` was sent in `POST /api/operations/apply`, and operation ID is not already in `operationLog`.
- **File not persisting:** Check `storage/` directory exists and is writable. Verify `npm run test:backend` passes.
- **Dev server proxy issues:** Vite proxies `/api` to `http://127.0.0.1:8765`. Ensure backend is running on correct port.

## Notes for Future Work

- No authentication (prototype stage). Do not expose over public networks.
- OCR and legacy `.doc` format not supported in v1.
- Backend defaults to 127.0.0.1. Use `HOST=0.0.0.0` to expose on local network if needed (use with caution).
