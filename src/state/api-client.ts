import { model } from "../model";
import type { LlmOperation, LlmTurn, ProjectData } from "../types";

export type LoadProjectResult =
  | { status: "seed" }
  | {
      status: "success";
      data: ProjectData;
      recoveredFromBackup: boolean;
      storagePath?: string;
      savedAt?: string;
    };

export interface SaveProjectResult {
  revision: number;
  savedAt?: string;
  storagePath?: string;
}

export interface LlmChatRequest {
  message: string;
  scope: string;
  selectedType: string;
  selectedId: string;
}

export interface LlmChatResult {
  chatTurn: LlmTurn;
  revision?: number;
  savedAt?: string;
}

export interface DocumentImportRequest {
  files: File[];
  scope: string;
  selectedType: string;
  selectedId: string;
  instruction?: string;
}

export interface DocumentImportResult {
  importJob?: unknown;
  chatTurn: LlmTurn;
  revision?: number;
  savedAt?: string;
}

export async function loadProject(): Promise<LoadProjectResult> {
  const response = await fetch("/api/project", { headers: { accept: "application/json" } });
  if (response.status === 404) return { status: "seed" };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as {
    project: ProjectData;
    recoveredFromBackup?: boolean;
    path?: string;
    savedAt?: string;
  };
  return {
    status: "success",
    data: model.normalizeProjectData(payload.project),
    recoveredFromBackup: Boolean(payload.recoveredFromBackup),
    storagePath: payload.path,
    savedAt: payload.savedAt || payload.project?.savedAt || payload.project?.project?.updatedAt,
  };
}

export async function saveProject(data: ProjectData): Promise<SaveProjectResult> {
  const response = await fetch("/api/project", {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const message =
      response.status === 409
        ? "다른 저장 내용이 있어 덮어쓸 수 없습니다. 새로고침 후 다시 확인하세요."
        : payload.message || `HTTP ${response.status}`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return {
    revision: payload.revision,
    savedAt: payload.savedAt,
    storagePath: payload.path,
  };
}

export async function sendLlmChat(request: LlmChatRequest): Promise<LlmChatResult> {
  const response = await fetch("/api/llm-chat", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(llmErrorText(response, payload));
  return {
    chatTurn: payload.chatTurn,
    revision: payload.revision,
    savedAt: payload.savedAt,
  };
}

export async function importDocuments(request: DocumentImportRequest): Promise<DocumentImportResult> {
  const formData = new FormData();
  request.files.forEach((file) => formData.append("files[]", file, file.name));
  formData.set("scope", request.scope);
  formData.set("selectedType", request.selectedType);
  formData.set("selectedId", request.selectedId);
  if (request.instruction?.trim()) formData.set("instruction", request.instruction.trim());

  const response = await fetch("/api/document-imports", {
    method: "POST",
    headers: { accept: "application/json" },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const error = new Error(documentImportErrorText(response, payload)) as Error & { fileErrors?: string[] };
    if (Array.isArray(payload.fileErrors)) {
      error.fileErrors = payload.fileErrors
        .map((item: { filename?: string; message?: string }) =>
          [item.filename, item.message].filter(Boolean).join(": "),
        )
        .filter(Boolean);
    }
    throw error;
  }
  return {
    importJob: payload.importJob,
    chatTurn: payload.chatTurn,
    revision: payload.revision,
    savedAt: payload.savedAt,
  };
}

export async function applyApprovedOperation(operation: LlmOperation) {
  const response = await fetch("/api/operations/apply", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ operation, approved: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.message || `HTTP ${response.status}`);
}

function llmErrorText(response: Response, payload: Record<string, unknown> = {}) {
  if (payload.code === "LLM_DISABLED") {
    return String(payload.message || "LLM 기능이 꺼져 있습니다. 서버 환경변수를 설정한 뒤 다시 실행하세요.");
  }
  if (payload.code === "LLM_BAD_JSON") {
    return "LLM 응답 형식을 읽지 못했습니다. 같은 요청을 다시 보내거나 모델 설정을 확인하세요.";
  }
  if (payload.code === "LLM_PROVIDER_ERROR") {
    return `LLM provider 호출에 실패했습니다.${payload.providerMessage ? ` ${payload.providerMessage}` : ""}`;
  }
  if (payload.code === "LLM_BAD_OPERATION") {
    return `LLM 제안 검증에 실패했습니다.${payload.validationMessage ? ` ${payload.validationMessage}` : ""}`;
  }
  if (payload.message) return String(payload.message);
  return `요청 실패: HTTP ${response.status}`;
}

function documentImportErrorText(response: Response, payload: Record<string, unknown> = {}) {
  if (payload.code === "UNSUPPORTED_DOCUMENT_TYPE") {
    return String(payload.message || "지원하지 않는 문서 형식입니다.");
  }
  if (payload.code === "DOCUMENT_TEXT_EMPTY") {
    return String(payload.message || "문서에서 추출 가능한 텍스트가 없습니다.");
  }
  if (payload.code === "DOCUMENT_FILE_TOO_LARGE" || payload.code === "DOCUMENT_IMPORT_TOO_LARGE") {
    return String(payload.message || "문서 업로드 용량 제한을 초과했습니다.");
  }
  if (payload.code === "TOO_MANY_DOCUMENTS") {
    return String(payload.message || "한 번에 가져올 수 있는 문서 수를 초과했습니다.");
  }
  return llmErrorText(response, payload);
}
