export type EntityType = "character" | "organization" | "event" | "episode";
export type ViewName = "dashboard" | "timeline" | "characters" | "graph" | "episodes" | "organizations";
export type TimelineMode = "story" | "episode" | "psych";
export type TimelinePhase = "과거" | "Act 1" | "Act 2" | "Act 3";
export type TimelinePhaseFilter = TimelinePhase | "";
export type StorageStatus =
  | "loading"
  | "dirty"
  | "error"
  | "conflict"
  | "recovered"
  | "seed"
  | "offline"
  | "saved";

export type ReviewState = "draft" | "needs_review" | "accepted" | "rejected";

export interface Provenance {
  source: string;
  sourceText: string;
  sourceRange: unknown;
  importedAt: string;
  turnId?: string;
  importJobId?: string;
  files?: unknown;
  originalsPath?: string;
  manifestPath?: string;
  extractedTextPath?: string;
  truncated?: boolean;
  prompt?: unknown;
  promptDocuments?: unknown;
  rawAssistantContent?: string;
  usage?: unknown;
}

export interface Review {
  state: ReviewState;
  confidence: number;
  reviewedBy: string;
  reviewedAt: string;
}

export interface BaseEntity {
  id: string;
  entityType: string;
  status: "active" | "archived" | string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  provenance: Provenance;
  review: Review;
  notes: string;
}

export interface ProjectMeta {
  id: string;
  entityType: "project";
  title: string;
  genre: string;
  logline: string;
  tone: string[];
  format?: string;
  language?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Character extends BaseEntity {
  entityType: "character";
  name: string;
  role: string;
  org: string;
  avatar: string;
  desire: string;
  wound: string;
  secret: string;
  contradiction: string;
  arc: string[];
  tags: string[];
}

export interface Organization extends BaseEntity {
  entityType: "organization";
  name: string;
  type: string;
  agenda: string;
  leverage: string;
  risk: string;
  tags: string[];
}

export interface EventEntity extends BaseEntity {
  entityType: "event";
  title: string;
  date: string;
  phase: "과거" | "Act 1" | "Act 2" | "Act 3" | string;
  summary: string;
  characters: string[];
  organizations: string[];
  emotion: string;
  impact: number;
  tags: string[];
}

export interface Episode extends BaseEntity {
  entityType: "episode";
  title: string;
  act: "Act 1" | "Act 2" | "Act 3" | string;
  hook: string;
  turn: string;
  payoff: string;
  events: string[];
  characters: string[];
}

export interface LinkEntity extends BaseEntity {
  entityType: "link";
  from: string;
  to: string;
  type: string;
  label: string;
  direction: string;
  strength: number;
}

export interface Issue extends BaseEntity {
  entityType: "issue";
  title: string;
  summary: string;
  target: string;
  type: EntityType | "project" | string;
  priority: string;
  resolved: boolean;
}

export interface Suggestion extends BaseEntity {
  entityType: "suggestion";
  title: string;
  body: string;
  targetType: EntityType | "project" | string;
  targetId: string;
  operation: LlmOperation | null;
}

export type PlannerEntity = Character | Organization | EventEntity | Episode;
export type CollectionName =
  | "characters"
  | "organizations"
  | "events"
  | "episodes"
  | "links"
  | "issues"
  | "suggestions";

export interface LlmOperation {
  id: string;
  type: "create_entity" | "update_fields" | "link_entities" | "unlink_entities" | "add_suggestion" | string;
  payload: Record<string, unknown>;
  provenance?: Provenance;
  confidence?: number;
  requiresReview?: boolean;
  createdAt?: string;
}

export interface LlmTurn {
  id: string;
  userMessage?: string;
  text?: string;
  assistantMessage?: string;
  scope?: string;
  selectedType?: string;
  selectedId?: string;
  operations?: LlmOperation[];
  status?: string;
  createdAt?: string;
  provider?: unknown;
  provenance?: Provenance;
}

export interface OperationLogEntry {
  id?: string;
  operationId?: string;
  operation?: LlmOperation;
  result?: unknown;
  appliedAt?: string;
}

export interface ProjectData {
  revision: number;
  savedAt?: string;
  project: ProjectMeta;
  characters: Character[];
  organizations: Organization[];
  events: EventEntity[];
  episodes: Episode[];
  links: LinkEntity[];
  issues: Issue[];
  suggestions: Suggestion[];
  llmIntakes: LlmTurn[];
  operationLog: OperationLogEntry[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: Record<string, number>;
}

export interface DramaPlannerModel {
  ENTITY_TYPES: Record<string, string>;
  ID_PREFIX: Record<string, string>;
  PHASES: readonly string[];
  REVIEW_STATES: readonly string[];
  LLM_OPERATION_TYPES: readonly string[];
  COLLECTIONS: Record<string, { entityType: string; prefix: string; titleField: string }>;
  ENTITY_TO_COLLECTION: Record<string, string>;
  nowIso(): string;
  asArray(value: unknown): string[];
  revisionValue(value: unknown, fallback?: number): number;
  createId(prefix: string, collection: Array<{ id?: string }>): string;
  createCollectionId(collection: string, projectData: ProjectData): string;
  createEntity(type: string, overrides?: Record<string, unknown>): PlannerEntity | LinkEntity | Issue | Suggestion;
  normalizeEntity(type: string, item: Record<string, unknown>): PlannerEntity | LinkEntity | Issue | Suggestion;
  normalizeCollectionEntity(collection: string, item: Record<string, unknown>): PlannerEntity | LinkEntity | Issue | Suggestion;
  normalizeProjectData(raw: unknown): ProjectData;
  validateProjectData(projectData: ProjectData): ValidationResult;
  createLLMIntake(input: Record<string, unknown>): LlmTurn;
  createLLMOperation(type: string, payload?: Record<string, unknown>): LlmOperation;
}
