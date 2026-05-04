import type { CollectionName, EntityType, ViewName } from "./types";

export const graphPositions: Record<string, { x: number; y: number }> = {
  c1: { x: 44, y: 236 },
  c2: { x: 230, y: 116 },
  c3: { x: 462, y: 118 },
  c4: { x: 662, y: 248 },
  c5: { x: 226, y: 382 },
  o1: { x: 40, y: 430 },
  o2: { x: 226, y: 20 },
  o3: { x: 466, y: 18 },
  o4: { x: 664, y: 382 },
  o5: { x: 448, y: 486 },
  e3: { x: 42, y: 86 },
  e7: { x: 636, y: 86 },
};

export const viewMeta: Record<ViewName, [string, string]> = {
  dashboard: ["Project Overview", "기획 대시보드"],
  timeline: ["Timeline", "사건 타임라인"],
  characters: ["Characters", "인물 구성"],
  graph: ["Relationship Map", "인물/조직 관계도"],
  episodes: ["Episode Board", "회차 보드"],
  organizations: ["Organizations", "조직/기관"],
};

export const ENTITY_UI = {
  character: { collection: "characters", prefix: "c", view: "characters", label: "인물" },
  organization: { collection: "organizations", prefix: "o", view: "organizations", label: "조직" },
  event: { collection: "events", prefix: "e", view: "timeline", label: "사건" },
  episode: { collection: "episodes", prefix: "ep", view: "episodes", label: "회차" },
} as const satisfies Record<
  EntityType,
  { collection: CollectionName; prefix: string; view: ViewName; label: string }
>;

export const VIEW_CREATE_TYPE: Record<ViewName, EntityType> = {
  dashboard: "event",
  timeline: "event",
  graph: "event",
  characters: "character",
  organizations: "organization",
  episodes: "episode",
};
