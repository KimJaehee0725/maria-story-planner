import { ENTITY_UI } from "../app-config";
import { model } from "../model";
import type {
  Character,
  EntityType,
  Episode,
  EventEntity,
  Organization,
  PlannerEntity,
  ProjectData,
  ViewName,
} from "../types";
import type { PlannerState } from "./planner-types";
import {
  activeCollectionForType,
  arrayFromInput,
  cloneData,
  collectionForType,
  getById,
} from "./selectors";

export function markDirtyState(state: PlannerState, data: ProjectData): PlannerState {
  return {
    ...state,
    data,
    dirty: true,
    storageStatus: "dirty",
    storageError: "",
  };
}

export function touchDataForSave(state: PlannerState) {
  const data = cloneData(state.data);
  const item = getById(data, state.selectedType, state.selectedId);
  if (item) item.updatedAt = model.nowIso();
  data.project.updatedAt = model.nowIso();
  return data;
}

export function updateEntityFieldData(
  data: ProjectData,
  entityType: EntityType,
  id: string,
  field: string,
  value: string | number,
  now: string,
) {
  const next = cloneData(data);
  const item = getById(next, entityType, id) as Record<string, unknown> | undefined;
  if (!item) return null;
  if (field === "tags" || field === "arc") {
    item[field] = arrayFromInput(String(value));
  } else if (field === "impact") {
    item[field] = Number(value);
  } else {
    item[field] = value;
  }
  item.updatedAt = now;
  return next;
}

export function updateProjectFieldData(data: ProjectData, field: string, value: string, now: string) {
  const next = cloneData(data);
  if (field === "tone") next.project.tone = arrayFromInput(value);
  else next.project = { ...next.project, [field]: value };
  next.project.updatedAt = now;
  return next;
}

export function updateRelationData(
  data: ProjectData,
  entityType: EntityType,
  id: string,
  field: string,
  value: string,
  checked: boolean,
  now: string,
) {
  const next = cloneData(data);
  const item = getById(next, entityType, id) as Record<string, unknown> | undefined;
  if (!item) return null;
  const current = new Set(Array.isArray(item[field]) ? (item[field] as string[]) : []);
  if (checked) current.add(value);
  else current.delete(value);
  item[field] = [...current];
  item.updatedAt = now;
  return next;
}

export function updateReverseEventRelationData(
  data: ProjectData,
  entityType: EntityType,
  id: string,
  eventId: string,
  checked: boolean,
  now: string,
) {
  const next = cloneData(data);
  const event = getById(next, "event", eventId) as EventEntity | undefined;
  if (!event) return null;
  const field = entityType === "character" ? "characters" : "organizations";
  const current = new Set(event[field]);
  if (checked) current.add(id);
  else current.delete(id);
  event[field] = [...current];
  event.updatedAt = now;
  return next;
}

export function createItemData(data: ProjectData, type: EntityType, now: string) {
  const next = cloneData(data);
  if (type === "character") {
    const id = model.createId("c", next.characters);
    next.characters.push(
      model.createEntity("character", {
        id,
        name: "새 인물",
        role: "역할 미정",
        org: "소속 미정",
        avatar: "신규",
        desire: "",
        wound: "",
        secret: "",
        contradiction: "",
        arc: ["도입", "선택", "균열", "전환", "대가", "결말"],
        tags: ["초안"],
        createdAt: now,
        updatedAt: now,
        provenance: {
          source: "human",
          sourceText: "",
          sourceRange: null,
          importedAt: now,
        },
      }) as Character,
    );
    return { data: next, id, view: "characters" as ViewName };
  }

  if (type === "organization") {
    const id = model.createId("o", next.organizations);
    next.organizations.push(
      model.createEntity("organization", {
        id,
        name: "새 조직",
        type: "유형 미정",
        agenda: "",
        leverage: "",
        risk: "",
        tags: ["초안"],
        createdAt: now,
        updatedAt: now,
        provenance: {
          source: "human",
          sourceText: "",
          sourceRange: null,
          importedAt: now,
        },
      }) as Organization,
    );
    return { data: next, id, view: "organizations" as ViewName };
  }

  if (type === "episode") {
    const id = model.createId("ep", next.episodes);
    next.episodes.push(
      model.createEntity("episode", {
        id,
        title: "새 회차",
        act: "Act 1",
        hook: "",
        turn: "",
        payoff: "",
        events: [],
        characters: [],
        createdAt: now,
        updatedAt: now,
        provenance: {
          source: "human",
          sourceText: "",
          sourceRange: null,
          importedAt: now,
        },
      }) as Episode,
    );
    return { data: next, id, view: "episodes" as ViewName };
  }

  const id = model.createId("e", next.events);
  next.events.push(
    model.createEntity("event", {
      id,
      title: "새 사건",
      date: "시점 미정",
      phase: "Act 1",
      summary: "",
      characters: [],
      organizations: [],
      emotion: "",
      impact: 5,
      tags: ["초안"],
      createdAt: now,
      updatedAt: now,
      provenance: {
        source: "human",
        sourceText: "",
        sourceRange: null,
        importedAt: now,
      },
    }) as EventEntity,
  );
  return { data: next, id, view: "timeline" as ViewName };
}

export function duplicateSelectedData(data: ProjectData, type: EntityType, selectedId: string, now: string) {
  const collection = collectionForType(data, type);
  const item = getById(data, type, selectedId);
  if (!collection || !item) return null;
  const prefix = ENTITY_UI[type].prefix;
  const next = cloneData(data);
  const nextCollection = collectionForType(next, type);
  const copy = structuredClone(item) as unknown as Record<string, unknown>;
  copy.id = model.createId(prefix, nextCollection);
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.provenance = {
    source: "human",
    sourceText: `Duplicated from ${item.id}`,
    sourceRange: null,
        importedAt: now,
  };
  if (copy.name) copy.name = `${copy.name} 복사본`;
  if (copy.title) copy.title = `${copy.title} 복사본`;
  copy.status = "active";
  nextCollection.push(model.normalizeEntity(type, copy) as PlannerEntity);
  return { data: next, id: String(copy.id) };
}

export function archiveSelectedData(data: ProjectData, type: EntityType, selectedId: string, now: string) {
  const next = cloneData(data);
  const collection = collectionForType(next, type);
  const index = collection.findIndex((item) => item.id === selectedId);
  if (index < 0) return null;
  collection[index] = { ...collection[index], status: "archived", updatedAt: now };
  const active = activeCollectionForType(next, type);
  return { data: next, id: active[0]?.id || "" };
}

export function restoreArchivedData(data: ProjectData, type: EntityType, id: string, now: string) {
  const next = cloneData(data);
  const item = getById(next, type, id);
  if (!item) return null;
  item.status = "active";
  item.updatedAt = now;
  return next;
}
