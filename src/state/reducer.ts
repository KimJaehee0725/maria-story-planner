import { ENTITY_UI } from "../app-config";
import { model } from "../model";
import seedProject from "../seed-project.json";
import type { ProjectData } from "../types";
import {
  archiveSelectedData,
  createItemData,
  duplicateSelectedData,
  markDirtyState,
  restoreArchivedData,
  updateEntityFieldData,
  updateProjectFieldData,
  updateRelationData,
  updateReverseEventRelationData,
} from "./entity-mutations";
import type { PlannerAction, PlannerState } from "./planner-types";
import { formatSavedAt } from "./selectors";

const initialData = model.normalizeProjectData(seedProject) as ProjectData;

export const initialState: PlannerState = {
  data: initialData,
  view: "dashboard",
  selectedType: "event",
  selectedId: "e3",
  query: "",
  timelineMode: "story",
  timelinePhaseFilter: "",
  timelineUnlinkedOnly: false,
  editMode: true,
  dirty: false,
  saving: false,
  storageStatus: "loading",
  storageError: "",
  storagePath: "storage/projects/default.json",
  lastSaved: "방금 전",
  recoveredFromBackup: false,
  llmChat: {
    open: false,
    sending: false,
    importing: false,
    applyingId: "",
    error: "",
    importFileErrors: [],
    ignoredOperationIds: [],
  },
};

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case "set_view":
      return { ...state, view: action.view };
    case "select":
      return {
        ...state,
        selectedType: action.entityType,
        selectedId: action.id,
        view: action.view || state.view,
      };
    case "set_query":
      return { ...state, query: action.query };
    case "set_timeline_mode":
      return { ...state, timelineMode: action.mode };
    case "set_timeline_phase_filter":
      return { ...state, timelinePhaseFilter: action.phase };
    case "set_timeline_unlinked_only":
      return { ...state, timelineUnlinkedOnly: action.enabled };
    case "toggle_edit_mode":
      return { ...state, editMode: !state.editMode };
    case "update_field": {
      const data = updateEntityFieldData(state.data, action.entityType, action.id, action.field, action.value, action.now);
      return data ? markDirtyState(state, data) : state;
    }
    case "update_project_field":
      return markDirtyState(state, updateProjectFieldData(state.data, action.field, action.value, action.now));
    case "update_relation": {
      const data = updateRelationData(
        state.data,
        action.entityType,
        action.id,
        action.field,
        action.value,
        action.checked,
        action.now,
      );
      return data ? markDirtyState(state, data) : state;
    }
    case "update_reverse_event_relation": {
      const data = updateReverseEventRelationData(
        state.data,
        action.entityType,
        action.id,
        action.eventId,
        action.checked,
        action.now,
      );
      return data ? markDirtyState(state, data) : state;
    }
    case "create_item": {
      const created = createItemData(state.data, action.entityType, action.now);
      return markDirtyState(
        {
          ...state,
          selectedType: action.entityType,
          selectedId: created.id,
          view: created.view,
        },
        created.data,
      );
    }
    case "duplicate_selected": {
      const duplicated = duplicateSelectedData(state.data, state.selectedType, state.selectedId, action.now);
      return duplicated ? markDirtyState({ ...state, selectedId: duplicated.id }, duplicated.data) : state;
    }
    case "delete_selected": {
      const archived = archiveSelectedData(state.data, state.selectedType, state.selectedId, action.now);
      return archived ? markDirtyState({ ...state, selectedId: archived.id }, archived.data) : state;
    }
    case "restore_archived": {
      const data = restoreArchivedData(state.data, action.entityType, action.id, action.now);
      return data
        ? markDirtyState(
            {
              ...state,
              selectedType: action.entityType,
              selectedId: action.id,
              view: ENTITY_UI[action.entityType].view,
            },
            data,
          )
        : state;
    }
    case "load_seed":
      return {
        ...state,
        storageStatus: "seed",
        storageError: "",
      };
    case "load_success":
      return {
        ...state,
        data: action.data,
        dirty: false,
        storageStatus: action.recoveredFromBackup ? "recovered" : "saved",
        storageError: "",
        recoveredFromBackup: action.recoveredFromBackup,
        storagePath: action.storagePath || state.storagePath,
        lastSaved: formatSavedAt(action.savedAt || action.data.savedAt || action.data.project.updatedAt),
      };
    case "load_error":
      return {
        ...state,
        storageStatus: action.storageStatus,
        storageError: action.message,
      };
    case "save_begin":
      return {
        ...state,
        data: action.data,
        saving: true,
        storageError: "",
      };
    case "save_success":
      return {
        ...state,
        data: {
          ...state.data,
          revision: action.revision ?? state.data.revision,
          savedAt: action.savedAt || state.data.savedAt,
        },
        dirty: false,
        saving: false,
        storageStatus: "saved",
        storageError: "",
        storagePath: action.storagePath || state.storagePath,
        lastSaved: formatSavedAt(action.savedAt),
      };
    case "save_error":
      return {
        ...state,
        saving: false,
        storageStatus: action.storageStatus,
        storageError: action.message,
      };
    case "llm_open":
      return { ...state, llmChat: { ...state.llmChat, open: action.open } };
    case "llm_send_begin":
      return { ...state, llmChat: { ...state.llmChat, sending: true, error: "", importFileErrors: [] } };
    case "llm_send_success":
      return {
        ...state,
        data: {
          ...state.data,
          llmIntakes: [...(state.data.llmIntakes || []), action.chatTurn],
          revision: action.revision ?? state.data.revision,
          savedAt: action.savedAt || state.data.savedAt,
        },
        storageStatus: "saved",
        storageError: "",
        lastSaved: formatSavedAt(action.savedAt),
        llmChat: { ...state.llmChat, sending: false, importing: false, error: "", importFileErrors: [] },
      };
    case "llm_send_error":
      return { ...state, llmChat: { ...state.llmChat, sending: false, error: action.message } };
    case "llm_import_begin":
      return { ...state, llmChat: { ...state.llmChat, importing: true, error: "", importFileErrors: [] } };
    case "llm_import_error":
      return {
        ...state,
        llmChat: {
          ...state.llmChat,
          importing: false,
          error: action.message,
          importFileErrors: action.fileErrors || [],
        },
      };
    case "llm_ignore":
      return {
        ...state,
        llmChat: {
          ...state.llmChat,
          ignoredOperationIds: [...new Set([...state.llmChat.ignoredOperationIds, action.operationId])],
        },
      };
    case "llm_apply_begin":
      return { ...state, llmChat: { ...state.llmChat, applyingId: action.operationId, error: "" } };
    case "llm_apply_end":
      return { ...state, llmChat: { ...state.llmChat, applyingId: "", error: "" } };
    case "llm_apply_error":
      return {
        ...state,
        llmChat: { ...state.llmChat, applyingId: "", error: action.message },
      };
    default:
      return state;
  }
}
