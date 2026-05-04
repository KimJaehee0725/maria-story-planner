import { ENTITY_UI } from "../app-config";
import type { EntityType, LlmOperation, PlannerEntity, ProjectData } from "../types";
import type { PlannerState } from "./planner-types";

export function cloneData(data: ProjectData): ProjectData {
  return structuredClone(data) as ProjectData;
}

export function arrayFromInput(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatSavedAt(value?: string) {
  if (!value) return "방금 전";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function collectionForType(data: ProjectData, type: EntityType): PlannerEntity[] {
  return data[ENTITY_UI[type].collection] as PlannerEntity[];
}

export function getById(data: ProjectData, type: EntityType, id: string): PlannerEntity | undefined {
  return collectionForType(data, type)?.find((item) => item.id === id);
}

export function isActive<T extends { status?: string }>(item: T) {
  return item?.status !== "archived";
}

export function activeItems<T extends { status?: string }>(collection: T[]) {
  return collection.filter(isActive);
}

export function activeCollectionForType(data: ProjectData, type: EntityType) {
  return activeItems(collectionForType(data, type));
}

export function labelForType(type?: string) {
  return type && type in ENTITY_UI ? ENTITY_UI[type as EntityType].label : "항목";
}

export function displayTitle(item?: Partial<PlannerEntity> | Record<string, unknown>) {
  const value = item as Record<string, unknown> | undefined;
  return String(value?.name || value?.title || value?.label || value?.id || "");
}

export function nameFor(data: ProjectData, id: string) {
  return (
    data.characters.find((item) => item.id === id)?.name ||
    data.organizations.find((item) => item.id === id)?.name ||
    data.events.find((item) => item.id === id)?.title ||
    data.episodes.find((item) => item.id === id)?.title ||
    id
  );
}

export function typeForId(data: ProjectData, id: string): EntityType {
  if (data.characters.some((item) => item.id === id)) return "character";
  if (data.organizations.some((item) => item.id === id)) return "organization";
  if (data.events.some((item) => item.id === id)) return "event";
  if (data.episodes.some((item) => item.id === id)) return "episode";
  return "event";
}

export function matchesQuery(item: Record<string, unknown>, fields: string[], query: string) {
  if (!query) return true;
  const haystack = fields
    .map((field) => item[field])
    .flat()
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function storageLabel(state: PlannerState) {
  if (state.saving) return "파일 저장 중...";
  if (state.storageStatus === "loading") return "저장 파일 확인 중...";
  if (state.storageStatus === "dirty") return "저장 전 변경사항";
  if (state.storageStatus === "error") return `저장 실패: ${state.storageError}`;
  if (state.storageStatus === "conflict") return `저장 충돌: ${state.storageError}`;
  if (state.storageStatus === "recovered") return `백업에서 복구됨: ${state.lastSaved}`;
  if (state.storageStatus === "seed") return "저장 파일 없음: 첫 저장 시 생성";
  if (state.storageStatus === "offline") return "서버 저장 비활성: node server.js로 실행 필요";
  return `마지막 저장: ${state.lastSaved}`;
}

export function llmChatTurns(data: ProjectData) {
  return (data.llmIntakes || []).filter((turn) => turn.userMessage || turn.text).slice(-6);
}

export function llmOperationEntries(data: ProjectData) {
  return llmChatTurns(data)
    .flatMap((turn) => (turn.operations || []).map((operation) => ({ turn, operation })))
    .reverse();
}

export function findLlmOperation(data: ProjectData, operationId: string) {
  return llmOperationEntries(data).find(({ operation }) => operation.id === operationId)?.operation || null;
}

export function operationWasAppliedClient(data: ProjectData, operation: LlmOperation) {
  if (!operation?.id) return false;
  return (data.operationLog || []).some((entry) => (entry.operationId || entry.operation?.id) === operation.id);
}
