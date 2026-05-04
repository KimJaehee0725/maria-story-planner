import { model } from "../model";
import {
  displayTitle,
  labelForType,
  nameFor,
  typeForId,
} from "../state";
import type { EntityType, LlmOperation, ProjectData } from "../types";

function typeLabelFromOperationPayload(payload: Record<string, unknown> = {}) {
  const collection = typeof payload.collection === "string" ? payload.collection : "";
  const entityType =
    (typeof payload.entityType === "string" && payload.entityType) ||
    model.COLLECTIONS?.[collection]?.entityType ||
    (typeof payload.targetType === "string" && payload.targetType) ||
    "";
  return labelForType(entityType);
}

export function operationHeadline(data: ProjectData, operation: LlmOperation) {
  const payload = operation.payload || {};
  if (operation.type === "create_entity") {
    const fields = (payload.fields || {}) as Record<string, unknown>;
    return `${typeLabelFromOperationPayload(payload)} 생성 · ${displayTitle(fields) || "새 항목"}`;
  }
  if (operation.type === "update_fields") {
    return `${typeLabelFromOperationPayload(payload)} 수정 · ${nameFor(data, String(payload.id || ""))}`;
  }
  if (operation.type === "link_entities") {
    return `관계 추가 · ${nameFor(data, String(payload.from || ""))} ↔ ${nameFor(data, String(payload.to || ""))}`;
  }
  if (operation.type === "unlink_entities") {
    return `관계 해제 · ${nameFor(data, String(payload.from || ""))} ↔ ${nameFor(data, String(payload.to || ""))}`;
  }
  return `제안 추가 · ${payload.title || "검토 제안"}`;
}

export function operationSummary(operation: LlmOperation) {
  const payload = operation.payload || {};
  if (operation.type === "create_entity") {
    const fields = (payload.fields || {}) as Record<string, unknown>;
    return String(fields.summary || fields.desire || fields.agenda || fields.hook || fields.body || fields.role || "");
  }
  if (operation.type === "update_fields") {
    return Object.entries((payload.fields || {}) as Record<string, unknown>)
      .slice(0, 4)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join(" / ");
  }
  if (operation.type === "link_entities") {
    return String(payload.label || payload.type || "관계 초안");
  }
  if (operation.type === "unlink_entities") {
    return "기존 관계를 제거하는 제안입니다.";
  }
  return String(payload.body || "");
}

export function operationTarget(data: ProjectData, operation: LlmOperation) {
  const payload = operation.payload || {};
  if (operation.type === "update_fields" && payload.id) {
    return { type: (payload.entityType as EntityType) || typeForId(data, String(payload.id)), id: String(payload.id) };
  }
  if ((operation.type === "link_entities" || operation.type === "unlink_entities") && payload.from) {
    return { type: typeForId(data, String(payload.from)), id: String(payload.from) };
  }
  if (operation.type === "add_suggestion" && payload.targetId && payload.targetType !== "project") {
    return { type: (payload.targetType as EntityType) || typeForId(data, String(payload.targetId)), id: String(payload.targetId) };
  }
  return null;
}
