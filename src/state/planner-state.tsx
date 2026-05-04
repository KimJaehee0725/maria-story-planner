import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { VIEW_CREATE_TYPE } from "../app-config";
import {
  applyApprovedOperation,
  importDocuments as importDocumentFiles,
  loadProject,
  saveProject,
  sendLlmChat,
} from "./api-client";
import { model } from "../model";
import { touchDataForSave } from "./entity-mutations";
import type { PlannerActions, PlannerState } from "./planner-types";
import { initialState, plannerReducer } from "./reducer";
import { findLlmOperation } from "./selectors";

const PlannerContext = createContext<{ state: PlannerState; actions: PlannerActions } | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(plannerReducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const loadProjectFromServer = useCallback(async () => {
    try {
      const loaded = await loadProject();
      if (loaded.status === "seed") {
        dispatch({ type: "load_seed" });
        return;
      }
      dispatch({
        type: "load_success",
        data: loaded.data,
        recoveredFromBackup: loaded.recoveredFromBackup,
        storagePath: loaded.storagePath,
        savedAt: loaded.savedAt,
      });
    } catch (error) {
      dispatch({
        type: "load_error",
        storageStatus: "offline",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const actions = useMemo<PlannerActions>(
    () => ({
      setView(view) {
        dispatch({ type: "set_view", view });
      },
      select(entityType, id, options = {}) {
        dispatch({ type: "select", entityType, id, view: options.view });
      },
      setQuery(query) {
        dispatch({ type: "set_query", query });
      },
      setTimelineMode(mode) {
        dispatch({ type: "set_timeline_mode", mode });
      },
      setTimelinePhaseFilter(phase) {
        dispatch({ type: "set_timeline_phase_filter", phase });
      },
      setTimelineUnlinkedOnly(enabled) {
        dispatch({ type: "set_timeline_unlinked_only", enabled });
      },
      toggleEditMode() {
        dispatch({ type: "toggle_edit_mode" });
      },
      updateField(entityType, id, field, value) {
        dispatch({ type: "update_field", entityType, id, field, value, now: model.nowIso() });
      },
      updateProjectField(field, value) {
        dispatch({ type: "update_project_field", field, value, now: model.nowIso() });
      },
      updateRelation(entityType, id, field, value, checked) {
        dispatch({ type: "update_relation", entityType, id, field, value, checked, now: model.nowIso() });
      },
      updateReverseEventRelation(entityType, id, eventId, checked) {
        dispatch({ type: "update_reverse_event_relation", entityType, id, eventId, checked, now: model.nowIso() });
      },
      createItem(entityType) {
        dispatch({ type: "create_item", entityType, now: model.nowIso() });
      },
      createItemForCurrentView() {
        dispatch({ type: "create_item", entityType: VIEW_CREATE_TYPE[stateRef.current.view], now: model.nowIso() });
      },
      duplicateSelected() {
        dispatch({ type: "duplicate_selected", now: model.nowIso() });
      },
      deleteSelected() {
        dispatch({ type: "delete_selected", now: model.nowIso() });
      },
      restoreArchived(entityType, id) {
        dispatch({ type: "restore_archived", entityType, id, now: model.nowIso() });
      },
      async saveChanges() {
        const dataToSave = touchDataForSave(stateRef.current);
        dispatch({ type: "save_begin", data: dataToSave });
        try {
          const saved = await saveProject(dataToSave);
          dispatch({
            type: "save_success",
            revision: saved.revision,
            savedAt: saved.savedAt,
            storagePath: saved.storagePath,
          });
        } catch (error) {
          const status = (error as Error & { status?: number }).status;
          dispatch({
            type: "save_error",
            storageStatus: status === 409 ? "conflict" : "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
      loadProjectFromServer,
      setLlmOpen(open) {
        dispatch({ type: "llm_open", open });
      },
      async sendLlmMessage(message) {
        const current = stateRef.current;
        const trimmed = message.trim();
        if (!trimmed || current.llmChat.sending || current.llmChat.importing) return;
        dispatch({ type: "llm_send_begin" });
        try {
          const result = await sendLlmChat({
            message: trimmed,
            scope: current.view,
            selectedType: current.selectedType,
            selectedId: current.selectedId,
          });
          dispatch({
            type: "llm_send_success",
            chatTurn: result.chatTurn,
            revision: result.revision,
            savedAt: result.savedAt,
          });
        } catch (error) {
          dispatch({
            type: "llm_send_error",
            message:
              error instanceof Error && error.message === "Failed to fetch"
                ? "서버에 연결할 수 없습니다. node server.js로 실행 중인지 확인하세요."
                : error instanceof Error
                  ? error.message
                  : String(error),
          });
        }
      },
      async importDocuments(files, instruction = "") {
        const current = stateRef.current;
        if (!files.length || current.llmChat.importing || current.llmChat.sending) return false;
        dispatch({ type: "llm_import_begin" });
        try {
          const result = await importDocumentFiles({
            files,
            instruction,
            scope: current.view,
            selectedType: current.selectedType,
            selectedId: current.selectedId,
          });
          dispatch({
            type: "llm_send_success",
            chatTurn: result.chatTurn,
            revision: result.revision,
            savedAt: result.savedAt,
          });
          return true;
        } catch (error) {
          const fileErrors = (error as Error & { fileErrors?: string[] }).fileErrors || [];
          dispatch({
            type: "llm_import_error",
            message:
              error instanceof Error && error.message === "Failed to fetch"
                ? "서버에 연결할 수 없습니다. node server.js로 실행 중인지 확인하세요."
                : error instanceof Error
                  ? error.message
                  : String(error),
            fileErrors,
          });
          return false;
        }
      },
      ignoreLlmOperation(operationId) {
        dispatch({ type: "llm_ignore", operationId });
      },
      async applyLlmOperation(operationId) {
        const current = stateRef.current;
        if (current.dirty) {
          dispatch({ type: "llm_apply_error", message: "저장 전 변경사항을 먼저 저장한 뒤 제안을 반영하세요." });
          return;
        }
        const operation = findLlmOperation(current.data, operationId);
        if (!operation) {
          dispatch({ type: "llm_apply_error", message: "반영할 제안을 찾지 못했습니다. 프로젝트를 다시 불러오세요." });
          return;
        }

        dispatch({ type: "llm_apply_begin", operationId });
        try {
          await applyApprovedOperation(operation);
          await loadProjectFromServer();
          dispatch({ type: "llm_apply_end" });
        } catch (error) {
          dispatch({
            type: "llm_apply_error",
            message: `제안 반영에 실패했습니다. ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      },
    }),
    [loadProjectFromServer],
  );

  useEffect(() => {
    void loadProjectFromServer();
  }, [loadProjectFromServer]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.dirty]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner() {
  const context = useContext(PlannerContext);
  if (!context) throw new Error("usePlanner must be used inside PlannerProvider");
  return context;
}
