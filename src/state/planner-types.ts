import type {
  EntityType,
  LlmTurn,
  ProjectData,
  StorageStatus,
  TimelineMode,
  TimelinePhaseFilter,
  ViewName,
} from "../types";

export interface LlmChatUiState {
  open: boolean;
  sending: boolean;
  importing: boolean;
  applyingId: string;
  error: string;
  importFileErrors: string[];
  ignoredOperationIds: string[];
}

export interface PlannerState {
  data: ProjectData;
  view: ViewName;
  selectedType: EntityType;
  selectedId: string;
  query: string;
  timelineMode: TimelineMode;
  timelinePhaseFilter: TimelinePhaseFilter;
  timelineUnlinkedOnly: boolean;
  editMode: boolean;
  dirty: boolean;
  saving: boolean;
  storageStatus: StorageStatus;
  storageError: string;
  storagePath: string;
  lastSaved: string;
  recoveredFromBackup: boolean;
  llmChat: LlmChatUiState;
}

export type PlannerAction =
  | { type: "set_view"; view: ViewName }
  | { type: "select"; entityType: EntityType; id: string; view?: ViewName }
  | { type: "set_query"; query: string }
  | { type: "set_timeline_mode"; mode: TimelineMode }
  | { type: "set_timeline_phase_filter"; phase: TimelinePhaseFilter }
  | { type: "set_timeline_unlinked_only"; enabled: boolean }
  | { type: "toggle_edit_mode" }
  | { type: "update_field"; entityType: EntityType; id: string; field: string; value: string | number; now: string }
  | { type: "update_project_field"; field: string; value: string; now: string }
  | { type: "update_relation"; entityType: EntityType; id: string; field: string; value: string; checked: boolean; now: string }
  | { type: "update_reverse_event_relation"; entityType: EntityType; id: string; eventId: string; checked: boolean; now: string }
  | { type: "create_item"; entityType: EntityType; now: string }
  | { type: "duplicate_selected"; now: string }
  | { type: "delete_selected"; now: string }
  | { type: "restore_archived"; entityType: EntityType; id: string; now: string }
  | { type: "load_seed" }
  | {
      type: "load_success";
      data: ProjectData;
      recoveredFromBackup: boolean;
      storagePath?: string;
      savedAt?: string;
    }
  | { type: "load_error"; storageStatus: StorageStatus; message: string }
  | { type: "save_begin"; data: ProjectData }
  | { type: "save_success"; revision: number; savedAt?: string; storagePath?: string }
  | { type: "save_error"; storageStatus: "conflict" | "error"; message: string }
  | { type: "llm_open"; open: boolean }
  | { type: "llm_send_begin" }
  | { type: "llm_send_success"; chatTurn: LlmTurn; revision?: number; savedAt?: string }
  | { type: "llm_send_error"; message: string }
  | { type: "llm_import_begin" }
  | { type: "llm_import_error"; message: string; fileErrors?: string[] }
  | { type: "llm_ignore"; operationId: string }
  | { type: "llm_apply_begin"; operationId: string }
  | { type: "llm_apply_end" }
  | { type: "llm_apply_error"; message: string };

export interface PlannerActions {
  setView(view: ViewName): void;
  select(entityType: EntityType, id: string, options?: { view?: ViewName }): void;
  setQuery(query: string): void;
  setTimelineMode(mode: TimelineMode): void;
  setTimelinePhaseFilter(phase: TimelinePhaseFilter): void;
  setTimelineUnlinkedOnly(enabled: boolean): void;
  toggleEditMode(): void;
  updateField(entityType: EntityType, id: string, field: string, value: string | number): void;
  updateProjectField(field: string, value: string): void;
  updateRelation(entityType: EntityType, id: string, field: string, value: string, checked: boolean): void;
  updateReverseEventRelation(entityType: EntityType, id: string, eventId: string, checked: boolean): void;
  createItem(entityType: EntityType): void;
  createItemForCurrentView(): void;
  duplicateSelected(): void;
  deleteSelected(): void;
  restoreArchived(entityType: EntityType, id: string): void;
  saveChanges(): Promise<void>;
  loadProjectFromServer(): Promise<void>;
  setLlmOpen(open: boolean): void;
  sendLlmMessage(message: string): Promise<void>;
  importDocuments(files: File[], instruction?: string): Promise<boolean>;
  ignoreLlmOperation(operationId: string): void;
  applyLlmOperation(operationId: string): Promise<void>;
}
