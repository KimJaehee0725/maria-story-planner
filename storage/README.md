# Local Storage

The local server writes project data here.

- `projects/default.json`: current project data
- `projects/backups/`: timestamped backups created before overwriting `default.json`
- `llm-intakes.jsonl`: natural-language fallback intakes and LLM chat turns with proposed operations
- `imports/{jobId}/originals/`: original files uploaded through document import
- `imports/{jobId}/manifest.json`: extracted text, file metadata, import status, and generated chat turn id

`default.json` includes a top-level `revision` used to reject stale browser saves. If `default.json` becomes invalid JSON, the server attempts to restore the latest valid backup and quarantines the corrupt file beside it.

Run the app through `node server.js` or `npm start`; opening `index.html` directly cannot write files.
