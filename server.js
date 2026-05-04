const http = require("http");
const fss = require("fs");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");
const Busboy = require("busboy");
const mammoth = require("mammoth");
const { PDFParse } = require("pdf-parse");
const { z } = require("zod");

const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || "127.0.0.1";
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(ROOT, "storage"));
const PROJECT_DIR = path.join(STORAGE_DIR, "projects");
const PROJECT_FILE = path.join(PROJECT_DIR, "default.json");
const LLM_INTAKE_FILE = path.join(STORAGE_DIR, "llm-intakes.jsonl");
const BACKUP_DIR = path.join(PROJECT_DIR, "backups");
const IMPORTS_DIR = path.join(STORAGE_DIR, "imports");
const LLM_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const LLM_API_KEY = process.env.OPENAI_API_KEY || "";
const LLM_MODEL = process.env.OPENAI_MODEL || "";
const model = require("./data-model");

const DOCUMENT_IMPORT_LIMITS = {
  maxFiles: 10,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 80 * 1024 * 1024,
  promptTextChars: 120000,
};

const DOCUMENT_TYPE_CONFIG = {
  ".pdf": {
    kind: "pdf",
    mimes: ["application/pdf", "application/x-pdf", "application/octet-stream"],
  },
  ".docx": {
    kind: "docx",
    mimes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream",
    ],
  },
  ".txt": {
    kind: "text",
    mimes: ["text/plain", "application/octet-stream"],
  },
  ".md": {
    kind: "markdown",
    mimes: ["text/markdown", "text/x-markdown", "text/plain", "application/octet-stream"],
  },
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const {
  COLLECTIONS,
  ENTITY_TO_COLLECTION,
  PHASES,
  LLM_OPERATION_TYPES,
  nowIso,
  revisionValue,
  createCollectionId,
  normalizeCollectionEntity,
  normalizeProjectData,
  validateProjectData,
} = model;

const LLM_FIELD_OBJECT_SCHEMA = z.record(z.string(), z.unknown());
const LLM_STRING_ID_SCHEMA = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0, { message: "id is required" });
const LLM_OPTIONAL_STRING_SCHEMA = z.string().trim().min(1).nullish();
const LLM_CONFIDENCE_SCHEMA = z.union([z.number(), z.string()]).nullish();
const LLM_OPERATION_BASE_SCHEMA = {
  id: LLM_OPTIONAL_STRING_SCHEMA,
  confidence: LLM_CONFIDENCE_SCHEMA,
  requiresReview: z.boolean().optional(),
};
const LLM_CREATE_ENTITY_PAYLOAD_SCHEMA = z
  .object({
    entityType: LLM_OPTIONAL_STRING_SCHEMA,
    collection: LLM_OPTIONAL_STRING_SCHEMA,
    fields: LLM_FIELD_OBJECT_SCHEMA.default({}),
  })
  .passthrough()
  .refine((payload) => payload.entityType || payload.collection, {
    message: "create_entity requires entityType or collection",
  });
const LLM_UPDATE_FIELDS_PAYLOAD_SCHEMA = z
  .object({
    entityType: LLM_OPTIONAL_STRING_SCHEMA,
    collection: LLM_OPTIONAL_STRING_SCHEMA,
    id: LLM_STRING_ID_SCHEMA,
    fields: LLM_FIELD_OBJECT_SCHEMA.default({}),
  })
  .passthrough();
const LLM_LINK_ENTITIES_PAYLOAD_SCHEMA = z
  .object({
    from: LLM_STRING_ID_SCHEMA,
    to: LLM_STRING_ID_SCHEMA,
    type: LLM_OPTIONAL_STRING_SCHEMA,
    relationshipType: LLM_OPTIONAL_STRING_SCHEMA,
    label: LLM_OPTIONAL_STRING_SCHEMA,
  })
  .passthrough();
const LLM_ADD_SUGGESTION_PAYLOAD_SCHEMA = z
  .object({
    title: z.string().nullish(),
    body: z.string().nullish(),
    summary: z.string().nullish(),
    targetType: LLM_OPTIONAL_STRING_SCHEMA,
    targetId: LLM_STRING_ID_SCHEMA.optional(),
    operation: z.unknown().optional(),
  })
  .passthrough();
const LLM_OPERATION_SCHEMA = z.discriminatedUnion("type", [
  z
    .object({
      ...LLM_OPERATION_BASE_SCHEMA,
      type: z.literal("create_entity"),
      payload: LLM_CREATE_ENTITY_PAYLOAD_SCHEMA,
    })
    .passthrough(),
  z
    .object({
      ...LLM_OPERATION_BASE_SCHEMA,
      type: z.literal("update_fields"),
      payload: LLM_UPDATE_FIELDS_PAYLOAD_SCHEMA,
    })
    .passthrough(),
  z
    .object({
      ...LLM_OPERATION_BASE_SCHEMA,
      type: z.literal("link_entities"),
      payload: LLM_LINK_ENTITIES_PAYLOAD_SCHEMA,
    })
    .passthrough(),
  z
    .object({
      ...LLM_OPERATION_BASE_SCHEMA,
      type: z.literal("unlink_entities"),
      payload: LLM_LINK_ENTITIES_PAYLOAD_SCHEMA,
    })
    .passthrough(),
  z
    .object({
      ...LLM_OPERATION_BASE_SCHEMA,
      type: z.literal("add_suggestion"),
      payload: LLM_ADD_SUGGESTION_PAYLOAD_SCHEMA,
    })
    .passthrough(),
]);
const LLM_CHAT_RESPONSE_SCHEMA = z
  .object({
    assistantMessage: z.string().optional(),
    operations: z.array(z.unknown()).default([]),
  })
  .passthrough();

let writeQueue = Promise.resolve();

class HttpError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

function queueWrite(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

async function readBody(req, maxBytes = 10 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(req) {
  const rawBody = await readBody(req);
  if (!rawBody.trim()) return {};
  return JSON.parse(rawBody);
}

function createImportJobId() {
  return `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function importJobPaths(jobId) {
  const root = path.join(IMPORTS_DIR, jobId);
  return {
    root,
    originals: path.join(root, "originals"),
    manifest: path.join(root, "manifest.json"),
  };
}

function assertSafeImportJobId(jobId) {
  if (!/^[A-Za-z0-9._-]+$/.test(jobId || "")) {
    throw new HttpError(400, "INVALID_IMPORT_JOB_ID", "Invalid import job id");
  }
}

function safeDocumentFilename(filename, index) {
  const base = path.basename(String(filename || "document").replace(/\\/g, "/"));
  const ext = path.extname(base).toLowerCase();
  const stem = path.basename(base, ext).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  const safeStem = stem || "document";
  return `${String(index).padStart(2, "0")}-${safeStem.slice(0, 80)}${ext}`;
}

function documentTypeForUpload(filename, mimeType) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  if (ext === ".doc") {
    throw new HttpError(
      415,
      "UNSUPPORTED_DOCUMENT_TYPE",
      "legacy .doc 파일은 아직 지원하지 않습니다. .docx, PDF, TXT, MD 파일을 사용하세요.",
      { filename },
    );
  }
  const config = DOCUMENT_TYPE_CONFIG[ext];
  if (!config) {
    throw new HttpError(415, "UNSUPPORTED_DOCUMENT_TYPE", "지원하지 않는 문서 형식입니다.", {
      filename,
      allowedExtensions: Object.keys(DOCUMENT_TYPE_CONFIG),
    });
  }
  const normalizedMime = String(mimeType || "").toLowerCase();
  if (!normalizedMime || !config.mimes.includes(normalizedMime)) {
    throw new HttpError(415, "UNSUPPORTED_DOCUMENT_TYPE", "문서 MIME 타입이 확장자와 맞지 않습니다.", {
      filename,
      mime: mimeType || "",
      extension: ext,
    });
  }
  return {
    ext,
    kind: config.kind,
    warnings: normalizedMime === "application/octet-stream" ? ["generic_mime_type"] : [],
  };
}

function publicImportFile(file) {
  const { absolutePath, text, ...publicFile } = file;
  return publicFile;
}

function manifestImportFile(file) {
  const { absolutePath, ...manifestFile } = file;
  return manifestFile;
}

function publicImportJob(importJob) {
  if (!importJob) return null;
  return {
    ...importJob,
    files: (importJob.files || []).map(publicImportFile),
  };
}

function importErrorPayload(error) {
  if (error instanceof HttpError) {
    return { code: error.code, message: error.message, ...error.details };
  }
  return { code: "DOCUMENT_IMPORT_FAILED", message: error.message || "문서 가져오기에 실패했습니다." };
}

async function writeImportManifest(importJob) {
  await writeJsonAtomic(importJobPaths(importJob.id).manifest, importJob);
}

function normalizeExtractedText(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n?--\s+\d+\s+of\s+\d+\s+--\s*/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function rejectedFileTask(error) {
  const task = Promise.reject(error);
  task.catch(() => {});
  return task;
}

async function parseDocumentImportRequest(req, { jobId, originalsDir }) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("multipart/form-data")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "multipart/form-data 요청이 필요합니다.");
  }

  await fs.mkdir(originalsDir, { recursive: true });

  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          files: DOCUMENT_IMPORT_LIMITS.maxFiles + 1,
          fileSize: DOCUMENT_IMPORT_LIMITS.maxFileBytes + 1,
          fields: 20,
          fieldSize: 32 * 1024,
        },
      });
    } catch (error) {
      reject(new HttpError(400, "MULTIPART_PARSE_FAILED", "multipart 요청을 읽지 못했습니다.", { detail: error.message }));
      return;
    }

    const fields = {};
    const fileTasks = [];
    let fileCount = 0;
    let totalBytes = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error instanceof HttpError ? error : new HttpError(400, "MULTIPART_PARSE_FAILED", "multipart 요청을 읽지 못했습니다.", { detail: error.message }));
    };

    busboy.on("field", (name, value) => {
      if (!["scope", "selectedType", "selectedId", "instruction"].includes(name)) return;
      fields[name] = String(value || "").slice(0, 8000);
    });

    busboy.on("file", (fieldName, file, info) => {
      fileCount += 1;
      const originalFilename = String(info.filename || "").trim();
      const mime = String(info.mimeType || "").toLowerCase();

      if (fieldName !== "files[]" && fieldName !== "files") {
        file.resume();
        fileTasks.push(rejectedFileTask(new HttpError(400, "UNEXPECTED_FILE_FIELD", "files[] 필드로 문서를 업로드하세요.", { fieldName })));
        return;
      }

      if (fileCount > DOCUMENT_IMPORT_LIMITS.maxFiles) {
        file.resume();
        fileTasks.push(rejectedFileTask(new HttpError(413, "TOO_MANY_DOCUMENTS", "한 번에 최대 10개 문서까지 가져올 수 있습니다.", { maxFiles: DOCUMENT_IMPORT_LIMITS.maxFiles })));
        return;
      }

      let typeInfo;
      try {
        typeInfo = documentTypeForUpload(originalFilename, mime);
      } catch (error) {
        file.resume();
        fileTasks.push(rejectedFileTask(error));
        return;
      }

      const storedFilename = safeDocumentFilename(originalFilename, fileCount);
      const absolutePath = path.join(originalsDir, storedFilename);
      const hash = crypto.createHash("sha256");
      let size = 0;

      const limitAndHash = new Transform({
        transform(chunk, encoding, callback) {
          size += chunk.length;
          totalBytes += chunk.length;
          if (size > DOCUMENT_IMPORT_LIMITS.maxFileBytes) {
            callback(new HttpError(413, "DOCUMENT_FILE_TOO_LARGE", "문서 한 개는 25MB를 넘을 수 없습니다.", { filename: originalFilename }));
            return;
          }
          if (totalBytes > DOCUMENT_IMPORT_LIMITS.maxTotalBytes) {
            callback(new HttpError(413, "DOCUMENT_IMPORT_TOO_LARGE", "문서 가져오기 전체 크기는 80MB를 넘을 수 없습니다.", { maxTotalBytes: DOCUMENT_IMPORT_LIMITS.maxTotalBytes }));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });

      const task = pipeline(file, limitAndHash, fss.createWriteStream(absolutePath, { flags: "wx" })).then(() => ({
        filename: originalFilename,
        storedFilename,
        mime,
        ext: typeInfo.ext,
        kind: typeInfo.kind,
        size,
        sha256: hash.digest("hex"),
        path: path.relative(ROOT, absolutePath),
        absolutePath,
        warnings: typeInfo.warnings,
      }));
      fileTasks.push(task);
    });

    busboy.on("filesLimit", () => {
      fail(new HttpError(413, "TOO_MANY_DOCUMENTS", "한 번에 최대 10개 문서까지 가져올 수 있습니다.", { maxFiles: DOCUMENT_IMPORT_LIMITS.maxFiles }));
    });
    busboy.on("error", fail);
    busboy.on("finish", () => {
      Promise.all(fileTasks)
        .then((files) => {
          if (settled) return;
          settled = true;
          if (!files.length) {
            reject(new HttpError(400, "DOCUMENT_FILE_REQUIRED", "files[] 문서가 필요합니다."));
            return;
          }
          resolve({ fields, files });
        })
        .catch(fail);
    });

    req.pipe(busboy);
  });
}

async function extractTextFromDocument(file) {
  let text = "";
  const warnings = [...(file.warnings || [])];
  try {
    if (file.kind === "text" || file.kind === "markdown") {
      text = await fs.readFile(file.absolutePath, "utf8");
    } else if (file.kind === "docx") {
      const result = await mammoth.extractRawText({ path: file.absolutePath });
      text = result.value || "";
      (result.messages || []).forEach((message) => warnings.push(message.message || String(message)));
    } else if (file.kind === "pdf") {
      const buffer = await fs.readFile(file.absolutePath);
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        text = result.text || "";
      } finally {
        await parser.destroy();
      }
    }
  } catch (error) {
    throw new HttpError(422, "DOCUMENT_TEXT_EXTRACT_FAILED", "문서 텍스트 추출에 실패했습니다.", {
      filename: file.filename,
      detail: error.message,
    });
  }

  const normalized = normalizeExtractedText(text);
  if (!normalized) {
    throw new HttpError(422, "DOCUMENT_TEXT_EMPTY", "문서에서 추출 가능한 텍스트가 없습니다.", {
      filename: file.filename,
    });
  }

  return {
    ...file,
    text: normalized,
    textLength: normalized.length,
    warnings,
  };
}

function prepareDocumentsForPrompt(files) {
  let remaining = DOCUMENT_IMPORT_LIMITS.promptTextChars;
  let truncated = false;
  const documents = files.map((file) => {
    const fullText = file.text || "";
    const text = remaining > 0 ? fullText.slice(0, remaining) : "";
    remaining -= text.length;
    const fileTruncated = text.length < fullText.length;
    truncated = truncated || fileTruncated;
    return {
      filename: file.filename,
      mime: file.mime,
      text,
      textLength: file.textLength,
      truncated: fileTruncated,
    };
  });
  return { documents, truncated };
}

function buildDocumentImportMessages({ instruction, scope, selectedType, selectedId, projectData, files }) {
  const systemPrompt = [
    "너는 한국어 드라마 기획 보드의 문서 기반 기획 이식 어시스턴트다.",
    "업로드된 문서에서 작품 설정, 인물, 조직, 사건, 회차, 관계, 보강 제안을 추출한다.",
    "원문을 바로 저장하지 말고, 사람이 검토한 뒤 적용할 수 있는 operation 초안만 만든다.",
    "반드시 JSON 객체 하나만 응답하고, 마크다운 코드블록이나 설명 문장을 JSON 밖에 쓰지 않는다.",
    "허용 operation type은 create_entity, update_fields, link_entities, unlink_entities, add_suggestion 뿐이다.",
    "모든 operation은 requiresReview가 true인 검토 대상이라고 가정한다.",
    "새 엔티티를 만들 때 id는 만들지 않는다. 서버가 적용 시 id를 배정한다.",
    "이미 존재하는 항목을 수정하거나 연결할 때는 projectContext에 있는 id만 사용한다.",
    "문서에 근거가 약하거나 기존 항목과 충돌할 수 있으면 add_suggestion으로 남긴다.",
    "응답 JSON 형식: {\"assistantMessage\":\"사용자에게 보여줄 짧은 한국어 답변\",\"operations\":[{\"type\":\"create_entity\",\"confidence\":0.6,\"payload\":{...}}]}",
    "create_entity payload: {\"entityType\":\"character|organization|event|episode|suggestion\",\"fields\":{...}}",
    "update_fields payload: {\"entityType\":\"character|organization|event|episode\",\"id\":\"기존 id\",\"fields\":{...}}",
    "link_entities payload: {\"from\":\"기존 id\",\"to\":\"기존 id\",\"type\":\"관계 유형\",\"label\":\"짧은 라벨\"}",
    "unlink_entities payload: {\"from\":\"기존 id\",\"to\":\"기존 id\"}",
    "add_suggestion payload: {\"title\":\"제안 제목\",\"body\":\"제안 내용\",\"targetType\":\"project|character|organization|event|episode\",\"targetId\":\"기존 id\"}",
  ].join("\n");

  const prepared = prepareDocumentsForPrompt(files);
  const userPrompt = JSON.stringify(
    {
      instruction,
      scope,
      selectedType,
      selectedId,
      projectContext: compactProjectContext(projectData),
      documents: prepared.documents,
      truncated: prepared.truncated,
    },
    null,
    2,
  );

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    promptDocuments: prepared.documents,
    truncated: prepared.truncated,
  };
}

function documentImportSourceText(importJob) {
  const names = (importJob.files || []).map((file) => file.filename).join(", ");
  return [importJob.instruction, names ? `문서: ${names}` : ""].filter(Boolean).join("\n").trim();
}

function documentImportOperationProvenance(importJob, createdAt, turnId) {
  return {
    source: "document_import",
    sourceText: documentImportSourceText(importJob),
    sourceRange: null,
    importedAt: createdAt,
    turnId,
    importJobId: importJob.id,
    files: (importJob.files || []).map((file) => ({
      filename: file.filename,
      mime: file.mime,
      size: file.size,
      sha256: file.sha256,
      textLength: file.textLength,
      path: file.path,
    })),
    originalsPath: importJob.paths.originals,
    manifestPath: importJob.paths.manifest,
    truncated: Boolean(importJob.truncated),
  };
}

function createEmptyProject() {
  const createdAt = nowIso();
  return normalizeProjectData({
    project: {
      id: "project-1",
      title: "무제",
      genre: "",
      logline: "",
      tone: [],
      createdAt,
      updatedAt: createdAt,
    },
  });
}

function assertProjectShape(projectData) {
  const requiredArrays = [
    "characters",
    "organizations",
    "events",
    "episodes",
    "links",
    "issues",
    "suggestions",
  ];
  if (!projectData || typeof projectData !== "object") {
    throw new Error("Project payload must be an object");
  }
  if (!projectData.project || typeof projectData.project !== "object") {
    throw new Error("Project payload must include project metadata");
  }
  requiredArrays.forEach((key) => {
    if (projectData[key] && !Array.isArray(projectData[key])) {
      throw new Error(`Project payload ${key} must be an array`);
    }
  });
}

function allEntityIds(projectData) {
  return new Set(
    Object.keys(COLLECTIONS).flatMap((collection) =>
      (projectData[collection] || []).map((item) => item.id).filter(Boolean),
    ),
  );
}

function assertValidationOk(projectData) {
  const validation = validateProjectData(projectData);
  if (!validation.ok) {
    throw new HttpError(400, "VALIDATION_FAILED", "Project validation failed", { validation });
  }
  return validation;
}

function assertUniqueEntityId(projectData, id, currentId = "") {
  if (!id) throw new HttpError(400, "MISSING_ID", "Entity id is required");
  if (id !== currentId && allEntityIds(projectData).has(id)) {
    throw new HttpError(409, "DUPLICATE_ID", `Entity id already exists: ${id}`);
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const token = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const tmpPath = `${filePath}.${token}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function saveBackupIfExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return;
  }
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.copyFile(filePath, path.join(BACKUP_DIR, `default-${stamp}.json`));
}

async function readLatestValidBackup() {
  let names;
  try {
    names = await fs.readdir(BACKUP_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const backupNames = names
    .filter((name) => name.startsWith("default-") && name.endsWith(".json"))
    .sort()
    .reverse();

  for (const name of backupNames) {
    const filePath = path.join(BACKUP_DIR, name);
    try {
      const body = await fs.readFile(filePath, "utf8");
      return { filePath, body, data: JSON.parse(body) };
    } catch {
      // Keep scanning older backups until a valid JSON backup is found.
    }
  }
  return null;
}

async function recoverProjectFromBackup(parseError) {
  const backup = await readLatestValidBackup();
  if (!backup) throw parseError;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const corruptPath = `${PROJECT_FILE}.corrupt-${stamp}`;
  try {
    await fs.rename(PROJECT_FILE, corruptPath);
  } catch {
    // The next copy still restores service if quarantine fails due to a race.
  }
  await fs.copyFile(backup.filePath, PROJECT_FILE);

  const recovered = normalizeProjectData(backup.data);
  Object.defineProperty(recovered, "__recoveredFromBackup", {
    value: true,
    enumerable: false,
  });
  return recovered;
}

async function readProjectData({ allowEmpty = false } = {}) {
  try {
    const body = await fs.readFile(PROJECT_FILE, "utf8");
    return normalizeProjectData(JSON.parse(body));
  } catch (error) {
    if (error.code === "ENOENT" && allowEmpty) return createEmptyProject();
    if (error instanceof SyntaxError) return recoverProjectFromBackup(error);
    throw error;
  }
}

async function saveProjectData(projectData, { backup = true, currentRevision = null } = {}) {
  assertProjectShape(projectData);
  const baseRevision = revisionValue(currentRevision, revisionValue(projectData.revision));
  const savedAt = nowIso();
  const normalized = normalizeProjectData({
    ...projectData,
    revision: baseRevision + 1,
    project: {
      ...projectData.project,
      updatedAt: savedAt,
    },
    savedAt,
  });
  const validation = assertValidationOk(normalized);
  if (backup) await saveBackupIfExists(PROJECT_FILE);
  await writeJsonAtomic(PROJECT_FILE, normalized);
  return { projectData: normalized, savedAt, validation };
}

function sendProjectNotFound(res) {
  sendJson(res, 404, {
    ok: false,
    code: "PROJECT_NOT_CREATED",
    message: "No saved project file yet. Save the browser seed data or PUT /api/project first.",
  });
}

function projectApiPayload(project) {
  return {
    ok: true,
    project,
    revision: project.revision,
    savedAt: project.savedAt,
    recoveredFromBackup: Boolean(project.__recoveredFromBackup),
    validation: validateProjectData(project),
    path: path.relative(ROOT, PROJECT_FILE),
  };
}

function collectionFromPathPart(part) {
  if (COLLECTIONS[part]) return part;
  return ENTITY_TO_COLLECTION[part] || null;
}

function pruneDeletedReferences(projectData, deletedId, collection) {
  if (collection === "characters") {
    projectData.events.forEach((event) => {
      event.characters = event.characters.filter((id) => id !== deletedId);
    });
    projectData.episodes.forEach((episode) => {
      episode.characters = episode.characters.filter((id) => id !== deletedId);
    });
  }

  if (collection === "organizations") {
    projectData.events.forEach((event) => {
      event.organizations = event.organizations.filter((id) => id !== deletedId);
    });
  }

  if (collection === "events") {
    projectData.episodes.forEach((episode) => {
      episode.events = episode.events.filter((id) => id !== deletedId);
    });
  }

  projectData.links = projectData.links.filter((link) => link.from !== deletedId && link.to !== deletedId);
  projectData.issues.forEach((issue) => {
    if (issue.target === deletedId) issue.resolved = true;
  });
}

function createEntity(projectData, collection, payload = {}) {
  const config = COLLECTIONS[collection];
  const id = payload.id || createCollectionId(collection, projectData);
  assertUniqueEntityId(projectData, id);
  const item = normalizeCollectionEntity(collection, {
    ...payload,
    id,
    createdBy: payload.createdBy || "human",
    updatedAt: nowIso(),
  });
  projectData[collection].push(item);
  return item;
}

function updateEntity(projectData, collection, id, fields = {}) {
  const index = projectData[collection].findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = projectData[collection][index];
  const next = normalizeCollectionEntity(collection, {
    ...current,
    ...fields,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  });
  projectData[collection][index] = next;
  return next;
}

function deleteEntity(projectData, collection, id) {
  const index = projectData[collection].findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = projectData[collection][index];
  const archived = normalizeCollectionEntity(collection, {
    ...current,
    status: "archived",
    updatedAt: nowIso(),
  });
  projectData[collection][index] = archived;
  return archived;
}

function getEntityTitle(projectData, id) {
  for (const [collection, config] of Object.entries(COLLECTIONS)) {
    const item = projectData[collection]?.find((entity) => entity.id === id);
    if (item) return item[config.titleField] || item.id;
  }
  return id;
}

function llmConfig() {
  return {
    enabled: Boolean(LLM_API_KEY && LLM_MODEL),
    baseUrl: LLM_BASE_URL,
    model: LLM_MODEL,
  };
}

function compactEntityList(projectData, collection, limit = 20) {
  const config = COLLECTIONS[collection];
  return (projectData[collection] || [])
    .filter((item) => item.status !== "archived")
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      title: item[config.titleField] || item.id,
      type: item.entityType,
    }));
}

function compactProjectContext(projectData) {
  return {
    project: {
      id: projectData.project.id,
      title: projectData.project.title,
      genre: projectData.project.genre,
      logline: projectData.project.logline,
      tone: projectData.project.tone,
    },
    characters: compactEntityList(projectData, "characters"),
    organizations: compactEntityList(projectData, "organizations"),
    events: compactEntityList(projectData, "events"),
    episodes: compactEntityList(projectData, "episodes"),
  };
}

function buildLlmChatMessages({ message, scope, selectedType, selectedId, projectData }) {
  const systemPrompt = [
    "너는 한국어 드라마 기획 보드의 검토용 LLM 어시스턴트다.",
    "사용자의 자연어 지시를 바로 저장하지 말고, 사람이 검토한 뒤 적용할 수 있는 operation 초안만 만든다.",
    "반드시 JSON 객체 하나만 응답하고, 마크다운 코드블록이나 설명 문장을 JSON 밖에 쓰지 않는다.",
    "허용 operation type은 create_entity, update_fields, link_entities, unlink_entities, add_suggestion 뿐이다.",
    "모든 operation은 requiresReview가 true인 검토 대상이라고 가정한다.",
    "새 엔티티를 만들 때 id는 만들지 않는다. 서버가 적용 시 id를 배정한다.",
    "이미 존재하는 항목을 수정하거나 연결할 때는 projectContext에 있는 id만 사용한다.",
    "응답 JSON 형식: {\"assistantMessage\":\"사용자에게 보여줄 짧은 한국어 답변\",\"operations\":[{\"type\":\"create_entity\",\"confidence\":0.6,\"payload\":{...}}]}",
    "create_entity payload: {\"entityType\":\"character|organization|event|episode|suggestion\",\"fields\":{...}}",
    "update_fields payload: {\"entityType\":\"character|organization|event|episode\",\"id\":\"기존 id\",\"fields\":{...}}",
    "link_entities payload: {\"from\":\"기존 id\",\"to\":\"기존 id\",\"type\":\"관계 유형\",\"label\":\"짧은 라벨\"}",
    "unlink_entities payload: {\"from\":\"기존 id\",\"to\":\"기존 id\"}",
    "add_suggestion payload: {\"title\":\"제안 제목\",\"body\":\"제안 내용\",\"targetType\":\"project|character|organization|event|episode\",\"targetId\":\"기존 id\"}",
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      userMessage: message,
      scope,
      selectedType,
      selectedId,
      projectContext: compactProjectContext(projectData),
    },
    null,
    2,
  );

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}

function parseJsonObjectFromText(content) {
  const text = String(content || "").trim();
  if (!text) throw new Error("LLM response content is empty");

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw firstError;
  }
}

function formatZodError(error) {
  return error.issues
    .map((issue) => {
      const pathLabel = issue.path.length ? issue.path.join(".") : "root";
      return `${pathLabel}: ${issue.message}`;
    })
    .join("; ");
}

function parseLlmChatResponseWire(rawResponse) {
  const result = LLM_CHAT_RESPONSE_SCHEMA.safeParse(rawResponse);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

function parseLlmOperationWire(rawOperation, index) {
  const result = LLM_OPERATION_SCHEMA.safeParse(rawOperation);
  if (!result.success) {
    throw new Error(`operation ${index + 1} schema invalid: ${formatZodError(result.error)}`);
  }
  return result.data;
}

async function callOpenAiCompatibleChat(messages) {
  const config = llmConfig();
  if (!config.enabled) {
    throw new HttpError(
      503,
      "LLM_DISABLED",
      "LLM 기능이 꺼져 있습니다. 서버에 OPENAI_API_KEY와 OPENAI_MODEL을 설정한 뒤 다시 실행하세요.",
      { disabled: true },
    );
  }

  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
      }),
    });
  } catch (error) {
    const providerMessage = error instanceof Error ? error.message : String(error || "fetch failed");
    throw new HttpError(502, "LLM_PROVIDER_ERROR", "LLM provider 호출에 실패했습니다.", {
      providerMessage,
    });
  }
  const rawBody = await response.text();
  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = { rawBody };
  }

  if (!response.ok) {
    throw new HttpError(502, "LLM_PROVIDER_ERROR", "LLM provider 호출에 실패했습니다.", {
      providerStatus: response.status,
      providerMessage: payload.error?.message || rawBody.slice(0, 240),
    });
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new HttpError(502, "LLM_EMPTY_RESPONSE", "LLM provider가 비어 있는 응답을 반환했습니다.");
  }

  return {
    content,
    model: payload.model || config.model,
    usage: payload.usage || null,
  };
}

function collectionFromOperationPayload(payload = {}) {
  const collection = payload.collection || ENTITY_TO_COLLECTION[payload.entityType] || payload.entityType;
  return collectionFromPathPart(collection);
}

function entityExists(projectData, id) {
  return Object.keys(COLLECTIONS).some((collection) =>
    (projectData[collection] || []).some((item) => item.id === id && item.status !== "archived"),
  );
}

function operationTargetExists(projectData, targetType, targetId) {
  if (targetType === "project") return targetId === projectData.project.id;
  const collection = collectionFromPathPart(targetType);
  if (!collection || !projectData[collection]) return false;
  return projectData[collection].some((item) => item.id === targetId && item.status !== "archived");
}

function normalizeOperationConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.6;
  return Math.max(0, Math.min(1, numeric));
}

function llmProvenance(sourceText, createdAt, turnId) {
  return {
    source: "llm_chat",
    sourceText,
    sourceRange: null,
    importedAt: createdAt,
    turnId,
  };
}

function withEntityReview(fields, confidence, provenance) {
  return {
    ...fields,
    id: undefined,
    createdBy: "llm",
    provenance: fields.provenance || provenance,
    review: fields.review || { state: "needs_review", confidence },
  };
}

function validateLlmOperation(inputOperation, { projectData, sourceText, createdAt, turnId, index, provenance: providedProvenance }) {
  const rawOperation = parseLlmOperationWire(inputOperation, index);
  const type = rawOperation.type;
  const confidence = normalizeOperationConfidence(rawOperation.confidence);
  const provenance = providedProvenance || llmProvenance(sourceText, createdAt, turnId);
  const rawPayload = rawOperation.payload;
  let payload;

  if (type === "create_entity") {
    const entityType = rawPayload.entityType;
    const collection = collectionFromOperationPayload(rawPayload);
    if (!collection || !COLLECTIONS[collection]) {
      throw new Error("create_entity requires a valid entityType or collection");
    }
    const fields = rawPayload.fields && typeof rawPayload.fields === "object" ? rawPayload.fields : {};
    payload = {
      entityType: entityType || COLLECTIONS[collection].entityType,
      collection,
      fields: withEntityReview(fields, confidence, provenance),
      provenance,
    };
    delete payload.fields.id;
  } else if (type === "update_fields") {
    const collection = collectionFromOperationPayload(rawPayload);
    const id = String(rawPayload.id || "");
    if (!collection || !COLLECTIONS[collection]) throw new Error("update_fields requires a valid collection");
    if (!id || !projectData[collection].some((item) => item.id === id && item.status !== "archived")) {
      throw new Error(`update_fields target not found: ${id || "(empty)"}`);
    }
    const fields = rawPayload.fields && typeof rawPayload.fields === "object" ? rawPayload.fields : {};
    payload = {
      entityType: COLLECTIONS[collection].entityType,
      collection,
      id,
      fields: { ...fields, id: undefined, updatedAt: undefined },
      provenance,
    };
    delete payload.fields.id;
    delete payload.fields.updatedAt;
  } else if (type === "link_entities") {
    const from = String(rawPayload.from || "");
    const to = String(rawPayload.to || "");
    if (!from || !to || !entityExists(projectData, from) || !entityExists(projectData, to)) {
      throw new Error("link_entities requires existing from/to ids");
    }
    payload = {
      from,
      to,
      type: rawPayload.type || rawPayload.relationshipType || "관계",
      relationshipType: rawPayload.relationshipType || rawPayload.type || "관계",
      label: rawPayload.label || `${getEntityTitle(projectData, from)} ↔ ${getEntityTitle(projectData, to)}`,
      createdBy: "llm",
      provenance,
      review: { state: "needs_review", confidence },
    };
  } else if (type === "unlink_entities") {
    const from = String(rawPayload.from || "");
    const to = String(rawPayload.to || "");
    if (!from || !to || !entityExists(projectData, from) || !entityExists(projectData, to)) {
      throw new Error("unlink_entities requires existing from/to ids");
    }
    payload = { from, to, provenance };
  } else {
    const targetType = rawPayload.targetType || "project";
    const targetId = rawPayload.targetId || (targetType === "project" ? projectData.project.id : "");
    if (!targetId) {
      throw new Error(`add_suggestion target id is required for ${targetType}`);
    }
    if (!operationTargetExists(projectData, targetType, targetId)) {
      throw new Error(`add_suggestion target not found: ${targetId}`);
    }
    payload = {
      title: rawPayload.title || "LLM 제안",
      body: rawPayload.body || rawPayload.summary || sourceText,
      targetType,
      targetId,
      operation: rawPayload.operation || null,
      createdBy: "llm",
      provenance,
      review: { state: "needs_review", confidence },
    };
  }

  return {
    id: rawOperation.id || `op-${turnId}-${index}`,
    type,
    confidence,
    requiresReview: true,
    payload,
    provenance,
    createdAt,
  };
}

function validateLlmOperations(rawOperations, options) {
  if (!Array.isArray(rawOperations)) {
    throw new Error("LLM response operations must be an array");
  }
  return rawOperations
    .slice(0, 8)
    .map((operation, index) => validateLlmOperation(operation, { ...options, index }));
}

function inferEntityType(text) {
  if (/인물|캐릭터|주인공|형사|작가|PD|피디|빌런|악역/.test(text)) return "character";
  if (/조직|기관|회사|경찰|제작사|기업|학교|병원|재단/.test(text)) return "organization";
  if (/회차|에피소드|[0-9]+화|막|act/i.test(text)) return "episode";
  if (/사건|화재|실종|발견|폭로|반전|장면|시퀀스/.test(text)) return "event";
  return "suggestion";
}

function extractQuotedName(text) {
  const quoted = text.match(/[“"']([^“"']{1,40})[”"']/);
  if (quoted) return quoted[1].trim();
  const explicitName = text.match(/(?:이름|제목)\s*(?:은|는|:|=)\s*([가-힣A-Za-z0-9_-]{2,30})/);
  if (explicitName) return explicitName[1].trim();
  const named = text.match(
    /(?:인물|캐릭터|조직|기관|사건|회차)\s*(?:이름|제목)?\s*(?:은|는|:|=)?\s*([가-힣A-Za-z0-9_-]{2,30})/,
  );
  return named ? named[1].trim() : "";
}

function draftOperationsFromText({ text, intent = "parse_and_suggest", scope = "project", projectData }) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Natural-language text is required");

  const entityType = inferEntityType(trimmed);
  const name = extractQuotedName(trimmed);
  const createdAt = nowIso();
  const baseProvenance = {
    source: "llm_intake",
    sourceText: trimmed,
    sourceRange: null,
    importedAt: createdAt,
  };
  const operations = [];

  if (entityType !== "suggestion") {
    const collection = ENTITY_TO_COLLECTION[entityType];
    const titleField = COLLECTIONS[collection].titleField;
    const entityPayload = {
      [titleField]: name || `${entityType} 후보`,
      createdBy: "llm",
      provenance: baseProvenance,
      review: { state: "needs_review", confidence: 0.45 },
      tags: ["LLM 초안"],
    };

    if (entityType === "event") {
      entityPayload.summary = trimmed;
      entityPayload.emotion = "";
      entityPayload.impact = 5;
    }
    if (entityType === "character") {
      entityPayload.role = "역할 미정";
      entityPayload.desire = trimmed;
    }
    if (entityType === "organization") {
      entityPayload.agenda = trimmed;
    }
    if (entityType === "episode") {
      entityPayload.hook = trimmed;
    }

    operations.push({
      id: `op-${Date.now()}-${operations.length}`,
      type: "create_entity",
      confidence: 0.45,
      requiresReview: true,
      payload: { entityType, collection, fields: entityPayload },
      createdAt,
    });
  }

  operations.push({
    id: `op-${Date.now()}-${operations.length}`,
    type: "add_suggestion",
    confidence: entityType === "suggestion" ? 0.7 : 0.55,
    requiresReview: true,
    payload: {
      title: name || "자연어 입력 검토",
      body: trimmed,
      targetType: scope,
      targetId: projectData.project.id,
      operation: null,
      createdBy: "llm",
      provenance: baseProvenance,
      review: { state: "needs_review", confidence: entityType === "suggestion" ? 0.7 : 0.55 },
    },
    createdAt,
  });

  return { intent, operations };
}

async function appendJsonLine(filePath, record) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

async function readJsonLines(filePath, limit = 100) {
  try {
    const body = await fs.readFile(filePath, "utf8");
    return body
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function applyOperation(projectData, operation) {
  if (!operation || !LLM_OPERATION_TYPES.includes(operation.type)) {
    throw new Error("Unsupported operation type");
  }

  if (operation.type === "create_entity") {
    const collection =
      operation.payload.collection || ENTITY_TO_COLLECTION[operation.payload.entityType] || null;
    if (!collection || !COLLECTIONS[collection]) throw new Error("create_entity requires a valid collection");
    return { entity: createEntity(projectData, collection, operation.payload.fields || {}) };
  }

  if (operation.type === "update_fields") {
    const collection = operation.payload.collection || ENTITY_TO_COLLECTION[operation.payload.entityType];
    const entity = updateEntity(projectData, collection, operation.payload.id, operation.payload.fields || {});
    if (!entity) throw new Error("update_fields target not found");
    return { entity };
  }

  if (operation.type === "link_entities") {
    const link = createEntity(projectData, "links", {
      from: operation.payload.from,
      to: operation.payload.to,
      type: operation.payload.relationshipType || operation.payload.type || "관계",
      label:
        operation.payload.label ||
        `${getEntityTitle(projectData, operation.payload.from)} ↔ ${getEntityTitle(projectData, operation.payload.to)}`,
      createdBy: operation.payload.createdBy || "llm",
      provenance: operation.payload.provenance,
      review: operation.payload.review || { state: "needs_review", confidence: operation.confidence || 0.6 },
    });
    return { entity: link };
  }

  if (operation.type === "unlink_entities") {
    const before = projectData.links.length;
    projectData.links = projectData.links.filter(
      (link) =>
        !(
          (link.from === operation.payload.from && link.to === operation.payload.to) ||
          (link.from === operation.payload.to && link.to === operation.payload.from)
        ),
    );
    return { removed: before - projectData.links.length };
  }

  const suggestion = createEntity(projectData, "suggestions", operation.payload || {});
  return { entity: suggestion };
}

async function handleProjectApi(req, res) {
  if (req.method === "GET") {
    try {
      const project = await readProjectData();
      sendJson(res, 200, projectApiPayload(project));
    } catch (error) {
      if (error.code === "ENOENT") {
        sendProjectNotFound(res);
        return;
      }
      throw error;
    }
    return;
  }

  if (req.method === "PUT") {
    const payload = await readJsonBody(req);
    const { projectData, savedAt, validation } = await queueWrite(async () => {
      const current = await readProjectData({ allowEmpty: true });
      const expectedRevision = revisionValue(payload.revision);
      if (expectedRevision !== current.revision) {
        throw new HttpError(409, "REVISION_CONFLICT", "Project was updated elsewhere. Reload before saving.", {
          latestRevision: current.revision,
        });
      }
      return saveProjectData(payload, { currentRevision: current.revision });
    });
    sendJson(res, 200, {
      ok: true,
      savedAt,
      revision: projectData.revision,
      validation,
      path: path.relative(ROOT, PROJECT_FILE),
    });
    return;
  }

  sendJson(res, 405, { ok: false, message: "Method not allowed" });
}

async function handleEntitiesApi(req, res, parts) {
  const collection = collectionFromPathPart(parts[2]);
  const id = parts[3];
  if (!collection) {
    sendJson(res, 404, { ok: false, message: "Unknown entity collection" });
    return;
  }

  if (req.method === "GET" && !id) {
    const projectData = await readProjectData();
    sendJson(res, 200, { ok: true, collection, items: projectData[collection] });
    return;
  }

  if (req.method === "GET" && id) {
    const projectData = await readProjectData();
    const item = projectData[collection].find((entity) => entity.id === id);
    if (!item) {
      sendJson(res, 404, { ok: false, message: "Entity not found" });
      return;
    }
    sendJson(res, 200, { ok: true, collection, item });
    return;
  }

  if (req.method === "POST" && !id) {
    const payload = await readJsonBody(req);
    const { item, savedAt, projectData } = await queueWrite(async () => {
      const projectData = await readProjectData({ allowEmpty: true });
      const item = createEntity(projectData, collection, payload);
      const saved = await saveProjectData(projectData, { currentRevision: projectData.revision });
      return { item, savedAt: saved.savedAt, projectData: saved.projectData };
    });
    sendJson(res, 201, { ok: true, collection, item, savedAt, revision: projectData.revision });
    return;
  }

  if (req.method === "PATCH" && id) {
    const payload = await readJsonBody(req);
    const { item, savedAt, projectData } = await queueWrite(async () => {
      const projectData = await readProjectData();
      const item = updateEntity(projectData, collection, id, payload);
      if (!item) {
        throw new HttpError(404, "ENTITY_NOT_FOUND", "Entity not found");
      }
      const saved = await saveProjectData(projectData, { currentRevision: projectData.revision });
      return { item, savedAt: saved.savedAt, projectData: saved.projectData };
    });
    sendJson(res, 200, { ok: true, collection, item, savedAt, revision: projectData.revision });
    return;
  }

  if (req.method === "DELETE" && id) {
    const { removed, savedAt, projectData } = await queueWrite(async () => {
      const projectData = await readProjectData();
      const removed = deleteEntity(projectData, collection, id);
      if (!removed) {
        throw new HttpError(404, "ENTITY_NOT_FOUND", "Entity not found");
      }
      const saved = await saveProjectData(projectData, { currentRevision: projectData.revision });
      return { removed, savedAt: saved.savedAt, projectData: saved.projectData };
    });
    sendJson(res, 200, { ok: true, collection, removed, savedAt, revision: projectData.revision });
    return;
  }

  sendJson(res, 405, { ok: false, message: "Method not allowed" });
}

async function handleLlmIntakeApi(req, res) {
  if (req.method === "GET") {
    const limit = Number(new URL(req.url, `http://${req.headers.host}`).searchParams.get("limit") || 100);
    sendJson(res, 200, { ok: true, intakes: await readJsonLines(LLM_INTAKE_FILE, limit) });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  const payload = await readJsonBody(req);
  const { record, draft, saved } = await queueWrite(async () => {
    const projectData = await readProjectData({ allowEmpty: true });
    const draft = draftOperationsFromText({
      text: payload.text,
      intent: payload.intent || "parse_and_suggest",
      scope: payload.scope || "project",
      projectData,
    });
    const record = {
      id: payload.id || `intake-${Date.now()}`,
      text: payload.text || "",
      intent: payload.intent || "parse_and_suggest",
      scope: payload.scope || "project",
      source: payload.source || "chat",
      status: "drafted",
      createdAt: payload.createdAt || nowIso(),
      operations: draft.operations,
    };

    projectData.llmIntakes.push(record);
    const saved = await saveProjectData(projectData, { currentRevision: projectData.revision });
    return { record, draft, saved };
  });
  await appendJsonLine(LLM_INTAKE_FILE, record);

  sendJson(res, 201, {
    ok: true,
    intake: record,
    operations: draft.operations,
    savedAt: saved.savedAt,
    revision: saved.projectData.revision,
    path: path.relative(ROOT, LLM_INTAKE_FILE),
  });
}

async function handleLlmChatApi(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  const payload = await readJsonBody(req);
  const message = String(payload.message || "").trim();
  if (!message) {
    throw new HttpError(400, "MISSING_MESSAGE", "message is required");
  }

  const scope = payload.scope || "project";
  const selectedType = payload.selectedType || "";
  const selectedId = payload.selectedId || "";
  const projectData = await readProjectData({ allowEmpty: true });
  const promptMessages = buildLlmChatMessages({
    message,
    scope,
    selectedType,
    selectedId,
    projectData,
  });

  const providerResponse = await callOpenAiCompatibleChat(promptMessages);
  let parsedJson;
  try {
    parsedJson = parseJsonObjectFromText(providerResponse.content);
  } catch (error) {
    throw new HttpError(502, "LLM_BAD_JSON", "LLM 응답을 JSON으로 해석하지 못했습니다.", {
      parseMessage: error.message,
    });
  }

  const createdAt = nowIso();
  const turnId = payload.id || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let parsed;
  let operations;
  try {
    parsed = parseLlmChatResponseWire(parsedJson);
    operations = validateLlmOperations(parsed.operations, {
      projectData,
      sourceText: message,
      createdAt,
      turnId,
    });
  } catch (error) {
    throw new HttpError(502, "LLM_BAD_OPERATION", "LLM이 검증할 수 없는 operation을 반환했습니다.", {
      validationMessage: error.message,
    });
  }

  const assistantMessage =
    typeof parsed.assistantMessage === "string" && parsed.assistantMessage.trim()
      ? parsed.assistantMessage.trim()
      : "검토 가능한 변경 제안을 만들었습니다.";
  const config = llmConfig();
  const chatTurn = {
    id: turnId,
    userMessage: message,
    assistantMessage,
    scope,
    selectedType,
    selectedId,
    operations,
    status: "drafted",
    createdAt,
    provider: {
      type: "openai_compatible",
      baseUrl: config.baseUrl,
      model: providerResponse.model || config.model,
    },
    provenance: {
      source: "llm_chat",
      sourceText: message,
      importedAt: createdAt,
      prompt: {
        system: promptMessages[0].content,
        user: promptMessages[1].content,
      },
      rawAssistantContent: providerResponse.content,
      usage: providerResponse.usage,
    },
  };

  const saved = await queueWrite(async () => {
    const current = await readProjectData({ allowEmpty: true });
    current.llmIntakes.push(chatTurn);
    return saveProjectData(current, { currentRevision: current.revision });
  });
  await appendJsonLine(LLM_INTAKE_FILE, chatTurn);

  sendJson(res, 201, {
    ok: true,
    chatTurn,
    assistantMessage,
    operations,
    savedAt: saved.savedAt,
    revision: saved.projectData.revision,
  });
}

async function handleDocumentImportsApi(req, res, parts) {
  const requestedJobId = parts[2] || "";

  if (req.method === "GET" && requestedJobId) {
    assertSafeImportJobId(requestedJobId);
    const manifestPath = importJobPaths(requestedJobId).manifest;
    try {
      const importJob = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      sendJson(res, 200, { ok: true, importJob: publicImportJob(importJob) });
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new HttpError(404, "IMPORT_JOB_NOT_FOUND", "문서 가져오기 작업을 찾지 못했습니다.", {
          importJobId: requestedJobId,
        });
      }
      throw error;
    }
    return;
  }

  if (req.method !== "POST" || requestedJobId) {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  const jobId = createImportJobId();
  const paths = importJobPaths(jobId);
  const createdAt = nowIso();
  let importJob = {
    id: jobId,
    status: "receiving",
    createdAt,
    completedAt: "",
    scope: "project",
    selectedType: "",
    selectedId: "",
    instruction: "",
    files: [],
    errors: [],
    chatTurnId: "",
    truncated: false,
    paths: {
      root: path.relative(ROOT, paths.root),
      originals: path.relative(ROOT, paths.originals),
      manifest: path.relative(ROOT, paths.manifest),
    },
    limits: DOCUMENT_IMPORT_LIMITS,
  };

  try {
    await fs.mkdir(paths.root, { recursive: true });
    await writeImportManifest(importJob);

    const parsed = await parseDocumentImportRequest(req, { jobId, originalsDir: paths.originals });
    importJob = {
      ...importJob,
      status: "extracting",
      scope: parsed.fields.scope || "project",
      selectedType: parsed.fields.selectedType || "",
      selectedId: parsed.fields.selectedId || "",
      instruction: parsed.fields.instruction || "",
      files: parsed.files.map(manifestImportFile),
    };
    await writeImportManifest(importJob);

    const extractedFiles = [];
    for (const file of parsed.files) {
      try {
        extractedFiles.push(await extractTextFromDocument(file));
      } catch (error) {
        const failedFile = { ...file, error: importErrorPayload(error) };
        importJob = {
          ...importJob,
          status: "failed",
          completedAt: nowIso(),
          files: [...extractedFiles.map(manifestImportFile), manifestImportFile(failedFile)],
          errors: [importErrorPayload(error)],
        };
        await writeImportManifest(importJob);
        throw error;
      }
    }

    importJob = {
      ...importJob,
      status: "analyzing",
      files: extractedFiles.map(manifestImportFile),
    };
    await writeImportManifest(importJob);

    const projectData = await readProjectData({ allowEmpty: true });
    const prompt = buildDocumentImportMessages({
      instruction: importJob.instruction,
      scope: importJob.scope,
      selectedType: importJob.selectedType,
      selectedId: importJob.selectedId,
      projectData,
      files: extractedFiles,
    });
    importJob.truncated = prompt.truncated;

    const providerResponse = await callOpenAiCompatibleChat(prompt.messages);
    let parsedJson;
    try {
      parsedJson = parseJsonObjectFromText(providerResponse.content);
    } catch (error) {
      throw new HttpError(502, "LLM_BAD_JSON", "LLM 응답을 JSON으로 해석하지 못했습니다.", {
        parseMessage: error.message,
      });
    }

    const turnCreatedAt = nowIso();
    const turnId = `doc-${jobId}`;
    const sourceText = documentImportSourceText(importJob);
    const operationProvenance = documentImportOperationProvenance(importJob, turnCreatedAt, turnId);
    let parsedResponse;
    let operations;
    try {
      parsedResponse = parseLlmChatResponseWire(parsedJson);
      operations = validateLlmOperations(parsedResponse.operations, {
        projectData,
        sourceText,
        createdAt: turnCreatedAt,
        turnId,
        provenance: operationProvenance,
      });
    } catch (error) {
      throw new HttpError(502, "LLM_BAD_OPERATION", "LLM이 검증할 수 없는 operation을 반환했습니다.", {
        validationMessage: error.message,
      });
    }

    const assistantMessage =
      typeof parsedResponse.assistantMessage === "string" && parsedResponse.assistantMessage.trim()
        ? parsedResponse.assistantMessage.trim()
        : "문서에서 검토 가능한 변경 제안을 만들었습니다.";
    const config = llmConfig();
    const chatTurn = {
      id: turnId,
      userMessage: sourceText || "문서 가져오기",
      assistantMessage,
      scope: importJob.scope,
      selectedType: importJob.selectedType,
      selectedId: importJob.selectedId,
      operations,
      status: "drafted",
      createdAt: turnCreatedAt,
      provider: {
        type: "openai_compatible",
        baseUrl: config.baseUrl,
        model: providerResponse.model || config.model,
      },
      provenance: {
        source: "document_import",
        sourceText,
        sourceRange: null,
        importedAt: turnCreatedAt,
        importJobId: jobId,
        files: importJob.files.map(publicImportFile),
        originalsPath: importJob.paths.originals,
        manifestPath: importJob.paths.manifest,
        extractedTextPath: importJob.paths.manifest,
        truncated: prompt.truncated,
        prompt: {
          system: prompt.messages[0].content,
          user: prompt.messages[1].content,
        },
        promptDocuments: prompt.promptDocuments.map((document) => ({
          filename: document.filename,
          textLength: document.textLength,
          promptTextLength: document.text.length,
          truncated: document.truncated,
        })),
        rawAssistantContent: providerResponse.content,
        usage: providerResponse.usage,
      },
    };

    const saved = await queueWrite(async () => {
      const current = await readProjectData({ allowEmpty: true });
      current.llmIntakes.push(chatTurn);
      return saveProjectData(current, { currentRevision: current.revision });
    });
    await appendJsonLine(LLM_INTAKE_FILE, chatTurn);

    importJob = {
      ...importJob,
      status: "completed",
      completedAt: nowIso(),
      chatTurnId: chatTurn.id,
      truncated: prompt.truncated,
    };
    await writeImportManifest(importJob);

    sendJson(res, 201, {
      ok: true,
      importJob: publicImportJob(importJob),
      chatTurn,
      assistantMessage,
      operations,
      savedAt: saved.savedAt,
      revision: saved.projectData.revision,
    });
  } catch (error) {
    const payload = importErrorPayload(error);
    importJob = {
      ...importJob,
      status: "failed",
      completedAt: importJob.completedAt || nowIso(),
      errors: importJob.errors?.length ? importJob.errors : [payload],
    };
    await writeImportManifest(importJob).catch(() => {});
    if (error instanceof HttpError) {
      error.details = {
        ...error.details,
        importJobId: jobId,
        importJob: publicImportJob(importJob),
        fileErrors: (importJob.files || []).filter((file) => file.error).map((file) => ({
          filename: file.filename,
          code: file.error.code,
          message: file.error.message,
        })),
      };
      throw error;
    }
    throw new HttpError(500, "DOCUMENT_IMPORT_FAILED", "문서 가져오기에 실패했습니다.", {
      importJobId: jobId,
      importJob: publicImportJob(importJob),
      detail: error.message,
    });
  }
}

function operationWasApplied(projectData, operation) {
  if (!operation?.id) return false;
  return projectData.operationLog.some((entry) => (entry.operationId || entry.operation?.id) === operation.id);
}

async function handleOperationApi(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  const payload = await readJsonBody(req);
  const { results, saved, projectData } = await queueWrite(async () => {
    const projectData = await readProjectData({ allowEmpty: true });
    const operations = Array.isArray(payload.operations) ? payload.operations : [payload.operation || payload];
    const results = [];
    let changed = false;

    operations.forEach((operation) => {
      if (operation?.requiresReview === true && payload.approved !== true) {
        throw new HttpError(400, "OPERATION_REQUIRES_APPROVAL", "Operation requires explicit approval before apply");
      }
      if (operationWasApplied(projectData, operation)) {
        results.push({ operationId: operation.id, skipped: true, reason: "already_applied" });
        return;
      }

      const result = applyOperation(projectData, operation);
      projectData.operationLog.push({
        id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        operationId: operation.id || "",
        operation,
        result,
        appliedAt: nowIso(),
      });
      results.push(result);
      changed = true;
    });

    if (!changed) return { results, saved: null, projectData };
    const saved = await saveProjectData(projectData, { currentRevision: projectData.revision });
    return { results, saved, projectData: saved.projectData };
  });
  sendJson(res, 200, {
    ok: true,
    results,
    savedAt: saved?.savedAt || projectData.savedAt,
    revision: saved?.projectData.revision || projectData.revision,
    validation: validateProjectData(saved?.projectData || projectData),
  });
}

function schemaPayload() {
  return {
    ok: true,
    collections: Object.fromEntries(
      Object.entries(COLLECTIONS).map(([collection, config]) => [
        collection,
        { entityType: config.entityType, idPrefix: config.prefix, titleField: config.titleField },
      ]),
    ),
    operationTypes: LLM_OPERATION_TYPES,
    phases: PHASES,
    storagePath: path.relative(ROOT, PROJECT_FILE),
  };
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sendFrontendDevHint(res) {
  const body = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>드라마 기획 보드 | Frontend build required</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f1e9; color: #27251f; }
      main { width: min(560px, calc(100vw - 32px)); padding: 24px; border: 1px solid #c8bba7; background: #fffcf4; border-radius: 8px; box-shadow: 0 14px 38px rgba(47, 40, 28, 0.12); }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 8px 0; color: #756f64; line-height: 1.55; }
      code { color: #27251f; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>프론트엔드 빌드가 없습니다.</h1>
      <p>개발 중에는 <code>npm run dev:server</code>로 API 서버를 켜고, 다른 터미널에서 <code>npm run dev</code>를 실행하세요.</p>
      <p>단일 Node 서버로 배포하려면 <code>npm run build</code> 후 <code>npm start</code>를 실행하세요.</p>
    </main>
  </body>
</html>`;
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveFile(filePath, res) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(filePath);
  const body = await fs.readFile(filePath);
  res.writeHead(200, {
    "content-type": MIME_TYPES[ext] || "application/octet-stream",
    "content-length": body.length,
  });
  res.end(body);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const hasDist = await pathExists(path.join(DIST_DIR, "index.html"));
  const staticRoot = hasDist ? DIST_DIR : ROOT;
  const filePath = path.normalize(path.join(staticRoot, requestedPath));
  const relativePath = path.relative(staticRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!hasDist && (url.pathname === "/" || url.pathname === "/index.html")) {
    sendFrontendDevHint(res);
    return;
  }

  try {
    await serveFile(filePath, res);
  } catch (error) {
    if (error.code === "ENOENT") {
      if (hasDist && !path.extname(requestedPath)) {
        await serveFile(path.join(DIST_DIR, "index.html"), res);
        return;
      }
      sendText(res, 404, "Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        host: HOST,
        storagePath: path.relative(ROOT, PROJECT_FILE),
        collections: Object.keys(COLLECTIONS),
      });
      return;
    }

    if (url.pathname === "/api/schema") {
      sendJson(res, 200, schemaPayload());
      return;
    }

    if (url.pathname === "/api/project") {
      await handleProjectApi(req, res);
      return;
    }

    if (parts[0] === "api" && parts[1] === "entities") {
      await handleEntitiesApi(req, res, parts);
      return;
    }

    if (url.pathname === "/api/llm-intakes") {
      await handleLlmIntakeApi(req, res);
      return;
    }

    if (url.pathname === "/api/llm-chat") {
      await handleLlmChatApi(req, res);
      return;
    }

    if (parts[0] === "api" && parts[1] === "document-imports") {
      await handleDocumentImportsApi(req, res, parts);
      return;
    }

    if (url.pathname === "/api/operations/apply") {
      await handleOperationApi(req, res);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.statusCode, {
        ok: false,
        code: error.code,
        message: error.message,
        ...error.details,
      });
      return;
    }
    if (error.code === "ENOENT") {
      sendProjectNotFound(res);
      return;
    }
    console.error(error);
    sendJson(res, 500, {
      ok: false,
      message: error.message || "Internal server error",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Drama planner server: http://${HOST}:${PORT}`);
  if (HOST === "0.0.0.0") {
    console.warn("Warning: server is listening on LAN interfaces without built-in authentication.");
  }
  console.log(`Project data file: ${path.relative(ROOT, PROJECT_FILE)}`);
});
