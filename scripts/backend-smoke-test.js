const { spawn } = require("child_process");
const fs = require("fs/promises");
const http = require("http");
const os = require("os");
const path = require("path");
const JSZip = require("jszip");

async function waitForHealth(baseUrl, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw new Error("Timed out waiting for backend health check");
}

async function requestRaw(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function request(baseUrl, pathname, options = {}) {
  const { response, payload } = await requestRaw(baseUrl, pathname, options);
  if (!response.ok || payload.ok === false) {
    throw new Error(`${options.method || "GET"} ${pathname} failed: ${payload.message || response.status}`);
  }
  return payload;
}

async function requestMultipartRaw(baseUrl, pathname, formData) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { accept: "application/json" },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function requestMultipart(baseUrl, pathname, formData) {
  const { response, payload } = await requestMultipartRaw(baseUrl, pathname, formData);
  if (!response.ok || payload.ok === false) {
    throw new Error(`POST ${pathname} failed: ${payload.message || response.status}`);
  }
  return payload;
}

function expectStatus(result, status, label) {
  if (result.response.status !== status) {
    throw new Error(`${label}: expected ${status}, got ${result.response.status}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function appendBuffer(formData, filename, buffer, type) {
  formData.append("files[]", new Blob([buffer], { type }), filename);
}

async function makeDocxBuffer(text) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.folder("_rels").file(
    ".rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.folder("word").file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

function makePdfBuffer(text) {
  const escaped = text.replace(/[\\()]/g, (match) => `\\${match}`);
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += object;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function latestProject(baseUrl) {
  return request(baseUrl, "/api/project");
}

async function putProject(baseUrl, project) {
  return request(baseUrl, "/api/project", {
    method: "PUT",
    body: JSON.stringify(project),
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function startMockLlmServer() {
  const server = http.createServer(async (req, res) => {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const userContent = payload.messages?.find((message) => message.role === "user")?.content || "";

    if (req.url !== "/chat/completions") {
      sendJson(res, 404, { error: { message: "not found" } });
      return;
    }

    if (userContent.includes("provider-500")) {
      sendJson(res, 500, { error: { message: "mock provider failure" } });
      return;
    }

    if (userContent.includes("malformed-json")) {
      sendJson(res, 200, {
        choices: [{ message: { content: "이 응답은 JSON이 아닙니다." } }],
      });
      return;
    }

    if (userContent.includes("unsupported-operation-type")) {
      sendJson(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantMessage: "지원하지 않는 operation입니다.",
                operations: [{ type: "delete_entity", payload: { id: "c1" } }],
              }),
            },
          },
        ],
      });
      return;
    }

    if (userContent.includes("missing-target-id")) {
      sendJson(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantMessage: "대상 id가 빠진 수정 제안입니다.",
                operations: [
                  {
                    type: "update_fields",
                    confidence: 0.6,
                    payload: {
                      entityType: "character",
                      fields: { role: "대상 없는 수정" },
                    },
                  },
                ],
              }),
            },
          },
        ],
      });
      return;
    }

    if (userContent.includes("missing-suggestion-target-id")) {
      sendJson(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantMessage: "대상 id가 빠진 제안입니다.",
                operations: [
                  {
                    type: "add_suggestion",
                    confidence: 0.7,
                    payload: {
                      title: "대상 없는 제안",
                      body: "인물에 붙일 제안이지만 targetId가 없다.",
                      targetType: "character",
                    },
                  },
                ],
              }),
            },
          },
        ],
      });
      return;
    }

    if (userContent.includes("unknown-collection")) {
      sendJson(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantMessage: "알 수 없는 collection 제안입니다.",
                operations: [
                  {
                    type: "create_entity",
                    confidence: 0.6,
                    payload: {
                      collection: "unknowns",
                      fields: { title: "잘못된 collection" },
                    },
                  },
                ],
              }),
            },
          },
        ],
      });
      return;
    }

    sendJson(res, 200, {
      model: payload.model,
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantMessage: "윤하 인물 초안을 만들었습니다.",
              operations: [
                {
                  type: "create_entity",
                  confidence: 0.82,
                  payload: {
                    entityType: "character",
                    fields: {
                      name: "윤하",
                      role: "과거 보육원 친구",
                      desire: "지유가 잊은 과거를 함께 확인하려 한다.",
                      tags: ["LLM 초안"],
                    },
                  },
                },
              ],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function closeHttpServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function runLlmProviderSmokeTest() {
  const mock = await startMockLlmServer();
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "mbeatshit-llm-storage-"));
  const port = 9200 + Math.floor(Math.random() * 400);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      STORAGE_DIR: storageDir,
      OPENAI_BASE_URL: mock.baseUrl,
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "mock-model",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth(baseUrl);
    await putProject(baseUrl, {
      project: {
        id: "project-llm",
        title: "LLM 테스트 프로젝트",
        genre: "테스트",
        logline: "LLM chat smoke test",
        tone: ["테스트"],
      },
      characters: [],
      organizations: [],
      events: [],
      episodes: [],
      links: [],
      issues: [],
      suggestions: [],
    });

    const chat = await request(baseUrl, "/api/llm-chat", {
      method: "POST",
      body: JSON.stringify({
        message: "새 인물 윤하를 과거 보육원 친구로 추가해줘.",
        scope: "characters",
        selectedType: "character",
        selectedId: "",
      }),
    });
    if (!chat.chatTurn?.userMessage) throw new Error("Expected stored chat turn");
    if (chat.operations[0]?.requiresReview !== true) throw new Error("Expected LLM operation to require review");
    if (chat.operations[0]?.payload.fields.name !== "윤하") throw new Error("Expected normalized LLM operation");

    const afterChat = await latestProject(baseUrl);
    if (afterChat.project.characters.length !== 0) {
      throw new Error("LLM chat should not apply operations before approval");
    }
    if (!afterChat.project.llmIntakes.length) throw new Error("Expected LLM chat turn in project data");

    const unapproved = await requestRaw(baseUrl, "/api/operations/apply", {
      method: "POST",
      body: JSON.stringify({ operation: chat.operations[0] }),
    });
    expectStatus(unapproved, 400, "llm chat unapproved apply");

    await request(baseUrl, "/api/operations/apply", {
      method: "POST",
      body: JSON.stringify({ operation: chat.operations[0], approved: true }),
    });
    const appliedProject = await latestProject(baseUrl);
    if (appliedProject.project.characters[0]?.name !== "윤하") {
      throw new Error("Expected approved LLM operation to create 윤하");
    }
    let llmIntakeCount = appliedProject.project.llmIntakes.length;

    const replay = await request(baseUrl, "/api/operations/apply", {
      method: "POST",
      body: JSON.stringify({ operation: chat.operations[0], approved: true }),
    });
    if (!replay.results[0]?.skipped) throw new Error("Expected approved LLM operation replay to be skipped");

    const beforeImportProject = await latestProject(baseUrl);
    const importForm = new FormData();
    appendBuffer(importForm, "notes.txt", Buffer.from("Txt Character Mina", "utf8"), "text/plain");
    appendBuffer(importForm, "outline.md", Buffer.from("# Md Organization Arc", "utf8"), "text/markdown");
    appendBuffer(
      importForm,
      "brief.docx",
      await makeDocxBuffer("Docx Episode Hook"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    appendBuffer(importForm, "scene.pdf", makePdfBuffer("Pdf Event Reveal"), "application/pdf");
    importForm.set("scope", "project");
    importForm.set("instruction", "문서 내용을 기획 보드 operation으로 이식해줘.");

    const documentImport = await requestMultipart(baseUrl, "/api/document-imports", importForm);
    if (documentImport.importJob?.status !== "completed") throw new Error("Expected completed document import job");
    if (documentImport.importJob.files.length !== 4) throw new Error("Expected four imported document files");
    if (documentImport.chatTurn?.provenance?.source !== "document_import") {
      throw new Error("Expected document import provenance on chat turn");
    }
    if (documentImport.operations[0]?.requiresReview !== true) {
      throw new Error("Expected document import operation to require review");
    }

    const importJobStatus = await request(baseUrl, `/api/document-imports/${documentImport.importJob.id}`);
    if (importJobStatus.importJob?.chatTurnId !== documentImport.chatTurn.id) {
      throw new Error("Expected import job status to expose chat turn id");
    }
    const manifestBody = await fs.readFile(
      path.join(storageDir, "imports", documentImport.importJob.id, "manifest.json"),
      "utf8",
    );
    if (!manifestBody.includes("Txt Character Mina") || !manifestBody.includes("Pdf Event Reveal")) {
      throw new Error("Expected import manifest to store extracted text");
    }

    const afterImportDraft = await latestProject(baseUrl);
    if (afterImportDraft.project.characters.length !== beforeImportProject.project.characters.length) {
      throw new Error("Document import should not apply operations before approval");
    }
    await request(baseUrl, "/api/operations/apply", {
      method: "POST",
      body: JSON.stringify({ operation: documentImport.operations[0], approved: true }),
    });
    const afterImportApply = await latestProject(baseUrl);
    if (afterImportApply.project.characters.length !== beforeImportProject.project.characters.length + 1) {
      throw new Error("Expected approved document import operation to create a character");
    }
    const importReplay = await request(baseUrl, "/api/operations/apply", {
      method: "POST",
      body: JSON.stringify({ operation: documentImport.operations[0], approved: true }),
    });
    if (!importReplay.results[0]?.skipped) throw new Error("Expected document import replay to be skipped");

    const unsupportedForm = new FormData();
    appendBuffer(unsupportedForm, "legacy.doc", Buffer.from("legacy", "utf8"), "application/msword");
    const unsupportedImport = await requestMultipartRaw(baseUrl, "/api/document-imports", unsupportedForm);
    expectStatus(unsupportedImport, 415, "unsupported legacy doc import");
    if (unsupportedImport.payload.code !== "UNSUPPORTED_DOCUMENT_TYPE") {
      throw new Error("Expected unsupported document type code");
    }

    const emptyPdfForm = new FormData();
    appendBuffer(emptyPdfForm, "empty.pdf", makePdfBuffer(""), "application/pdf");
    const emptyPdfImport = await requestMultipartRaw(baseUrl, "/api/document-imports", emptyPdfForm);
    expectStatus(emptyPdfImport, 422, "empty pdf import");
    if (emptyPdfImport.payload.code !== "DOCUMENT_TEXT_EMPTY") {
      throw new Error("Expected empty document text code");
    }

    const providerFailureForm = new FormData();
    appendBuffer(providerFailureForm, "provider.txt", Buffer.from("provider-500", "utf8"), "text/plain");
    const providerImportError = await requestMultipartRaw(baseUrl, "/api/document-imports", providerFailureForm);
    expectStatus(providerImportError, 502, "document import provider 500");
    if (providerImportError.payload.code !== "LLM_PROVIDER_ERROR") {
      throw new Error("Expected document import provider error code");
    }
    llmIntakeCount = (await latestProject(baseUrl)).project.llmIntakes.length;

    const malformed = await requestRaw(baseUrl, "/api/llm-chat", {
      method: "POST",
      body: JSON.stringify({ message: "malformed-json" }),
    });
    expectStatus(malformed, 502, "malformed llm json");
    if (malformed.payload.code !== "LLM_BAD_JSON") throw new Error("Expected malformed JSON code");

    const unsupportedType = await requestRaw(baseUrl, "/api/llm-chat", {
      method: "POST",
      body: JSON.stringify({ message: "unsupported-operation-type" }),
    });
    expectStatus(unsupportedType, 502, "unsupported llm operation type");
    if (unsupportedType.payload.code !== "LLM_BAD_OPERATION") {
      throw new Error("Expected unsupported operation type code");
    }

    const missingTargetId = await requestRaw(baseUrl, "/api/llm-chat", {
      method: "POST",
      body: JSON.stringify({ message: "missing-target-id" }),
    });
    expectStatus(missingTargetId, 502, "missing llm target id");
    if (missingTargetId.payload.code !== "LLM_BAD_OPERATION") {
      throw new Error("Expected missing target id operation code");
    }

    const missingSuggestionTargetId = await requestRaw(baseUrl, "/api/llm-chat", {
      method: "POST",
      body: JSON.stringify({ message: "missing-suggestion-target-id" }),
    });
    expectStatus(missingSuggestionTargetId, 502, "missing suggestion target id");
    if (missingSuggestionTargetId.payload.code !== "LLM_BAD_OPERATION") {
      throw new Error("Expected missing suggestion target id operation code");
    }

    const unknownCollection = await requestRaw(baseUrl, "/api/llm-chat", {
      method: "POST",
      body: JSON.stringify({ message: "unknown-collection" }),
    });
    expectStatus(unknownCollection, 502, "unknown llm collection");
    if (unknownCollection.payload.code !== "LLM_BAD_OPERATION") {
      throw new Error("Expected unknown collection operation code");
    }

    const afterBadOperations = await latestProject(baseUrl);
    if (afterBadOperations.project.llmIntakes.length !== llmIntakeCount) {
      throw new Error("Rejected LLM operations should not be stored as chat turns");
    }

    const providerError = await requestRaw(baseUrl, "/api/llm-chat", {
      method: "POST",
      body: JSON.stringify({ message: "provider-500" }),
    });
    expectStatus(providerError, 502, "provider 500");
    if (providerError.payload.code !== "LLM_PROVIDER_ERROR") throw new Error("Expected provider error code");

    console.log("LLM chat smoke test passed");
  } finally {
    server.kill("SIGTERM");
    await closeHttpServer(mock.server);
    await fs.rm(storageDir, { recursive: true, force: true });
  }

  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
}

async function runLlmProviderNetworkFailureTest() {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "mbeatshit-llm-network-storage-"));
  const port = 9600 + Math.floor(Math.random() * 400);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      STORAGE_DIR: storageDir,
      OPENAI_BASE_URL: "http://127.0.0.1:1/v1",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "mock-model",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth(baseUrl);
    await putProject(baseUrl, {
      project: {
        id: "project-llm-network",
        title: "LLM 네트워크 실패 테스트",
        genre: "테스트",
        logline: "LLM provider network failure smoke test",
        tone: ["테스트"],
      },
      characters: [],
      organizations: [],
      events: [],
      episodes: [],
      links: [],
      issues: [],
      suggestions: [],
    });

    const providerError = await requestRaw(baseUrl, "/api/llm-chat", {
      method: "POST",
      body: JSON.stringify({ message: "provider network failure" }),
    });
    expectStatus(providerError, 502, "provider network failure");
    if (providerError.payload.code !== "LLM_PROVIDER_ERROR") {
      throw new Error("Expected provider network failure code");
    }
  } finally {
    server.kill("SIGTERM");
    await fs.rm(storageDir, { recursive: true, force: true });
  }

  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
}

async function main() {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "mbeatshit-storage-"));
  const port = 8800 + Math.floor(Math.random() * 400);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      STORAGE_DIR: storageDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth(baseUrl);

    const disabledChat = await requestRaw(baseUrl, "/api/llm-chat", {
      method: "POST",
      body: JSON.stringify({ message: "LLM 비활성 상태 확인" }),
    });
    expectStatus(disabledChat, 503, "llm disabled");
    if (disabledChat.payload.code !== "LLM_DISABLED") throw new Error("Expected disabled LLM code");

    await putProject(baseUrl, {
      project: {
        id: "project-test",
        title: "테스트 프로젝트",
        genre: "테스트",
        logline: "백엔드 smoke test",
        tone: ["테스트"],
      },
      characters: [],
      organizations: [],
      events: [],
      episodes: [],
      links: [],
      issues: [],
      suggestions: [],
    });

    const character = await request(baseUrl, "/api/entities/characters", {
      method: "POST",
      body: JSON.stringify({ name: "테스트 인물", role: "검증용" }),
    });

    const duplicate = await requestRaw(baseUrl, "/api/entities/characters", {
      method: "POST",
      body: JSON.stringify({ id: character.item.id, name: "중복 인물" }),
    });
    expectStatus(duplicate, 409, "duplicate id");

    await request(baseUrl, `/api/entities/characters/${character.item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ desire: "백엔드가 파일에 저장되는지 확인한다." }),
    });

    const beforeInvalid = await latestProject(baseUrl);
    const invalid = clone(beforeInvalid.project);
    invalid.events.push({
      id: "e_bad",
      entityType: "event",
      status: "active",
      title: "잘못된 연결 사건",
      date: "테스트",
      phase: "Act 1",
      summary: "존재하지 않는 인물을 참조한다.",
      characters: ["missing-character"],
      organizations: [],
      emotion: "검증",
      impact: 5,
      tags: ["테스트"],
    });
    const invalidSave = await requestRaw(baseUrl, "/api/project", {
      method: "PUT",
      body: JSON.stringify(invalid),
    });
    expectStatus(invalidSave, 400, "invalid project save");

    const stale = clone(beforeInvalid.project);
    stale.project.title = "오래된 화면 저장";
    stale.revision = 0;
    const staleSave = await requestRaw(baseUrl, "/api/project", {
      method: "PUT",
      body: JSON.stringify(stale),
    });
    expectStatus(staleSave, 409, "stale project save");

    const intake = await request(baseUrl, "/api/llm-intakes", {
      method: "POST",
      body: JSON.stringify({ text: "새 사건 테스트 폭로 장면을 추가하고 싶어." }),
    });

    const unapproved = await requestRaw(baseUrl, "/api/operations/apply", {
      method: "POST",
      body: JSON.stringify({ operation: intake.operations[0] }),
    });
    expectStatus(unapproved, 400, "unapproved operation apply");

    await request(baseUrl, "/api/operations/apply", {
      method: "POST",
      body: JSON.stringify({ operation: intake.operations[0], approved: true }),
    });

    const replay = await request(baseUrl, "/api/operations/apply", {
      method: "POST",
      body: JSON.stringify({ operation: intake.operations[0], approved: true }),
    });
    if (!replay.results[0]?.skipped) throw new Error("Expected operation replay to be skipped");

    const namedIntake = await request(baseUrl, "/api/llm-intakes", {
      method: "POST",
      body: JSON.stringify({ text: "새 인물 이름은 윤하. 주인공의 과거 친구로 설정해줘." }),
    });
    if (namedIntake.operations[0].payload.fields.name !== "윤하") {
      throw new Error("Expected natural-language name extraction to return 윤하");
    }

    const concurrentBase = await latestProject(baseUrl);
    const concurrentPayloads = Array.from({ length: 12 }, (_, index) => {
      const project = clone(concurrentBase.project);
      project.project.title = `동시 저장 ${index}`;
      return project;
    });
    const concurrentResults = await Promise.all(
      concurrentPayloads.map((project) =>
        requestRaw(baseUrl, "/api/project", {
          method: "PUT",
          body: JSON.stringify(project),
        }),
      ),
    );
    if (concurrentResults.some((result) => result.response.status >= 500)) {
      throw new Error("Concurrent saves should not produce 5xx responses");
    }
    if (!concurrentResults.some((result) => result.response.status === 200)) {
      throw new Error("Expected one concurrent save to succeed");
    }
    if (!concurrentResults.some((result) => result.response.status === 409)) {
      throw new Error("Expected stale concurrent saves to return 409");
    }

    const firstBackupBase = await latestProject(baseUrl);
    const firstBackupSave = clone(firstBackupBase.project);
    firstBackupSave.project.genre = "백업 검증 1";
    await putProject(baseUrl, firstBackupSave);
    const secondBackupBase = await latestProject(baseUrl);
    const secondBackupSave = clone(secondBackupBase.project);
    secondBackupSave.project.genre = "백업 검증 2";
    await putProject(baseUrl, secondBackupSave);
    await fs.writeFile(path.join(storageDir, "projects", "default.json"), "{ broken json", "utf8");
    const recovered = await latestProject(baseUrl);
    if (!recovered.recoveredFromBackup) throw new Error("Expected corrupt project recovery from backup");

    const project = await latestProject(baseUrl);
    if (project.project.characters.length !== 1) throw new Error("Expected one character");
    if (project.project.events.length !== 1) throw new Error("Expected one event from approved operation apply");
    if (!project.project.llmIntakes.length) throw new Error("Expected stored LLM intake");

    console.log("Backend smoke test passed");
  } finally {
    server.kill("SIGTERM");
    await fs.rm(storageDir, { recursive: true, force: true });
  }

  if (stderr.trim()) {
    process.stderr.write(stderr);
  }

  await runLlmProviderSmokeTest();
  await runLlmProviderNetworkFailureTest();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
