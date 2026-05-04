import { storageLabel, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";

export function EditorHeader({ kind, title, subtitle }: { kind: string; title: string; subtitle?: string }) {
  const { state, actions } = usePlanner();
  return (
    <>
      <div className="detail-header editor-header">
        <div>
          <p className="eyebrow">{kind}</p>
          <h2 className="detail-title">{title}</h2>
          <p className="detail-subtitle">{subtitle || "선택 항목을 바로 편집합니다."}</p>
        </div>
        <span className={`dirty-dot ${state.dirty ? "active" : ""}`} />
      </div>
      <div className="save-bar">
        <span>{storageLabel(state)}</span>
        <small>{state.storagePath}</small>
        <div className="detail-actions">
          <button className="text-button" type="button" onClick={actions.duplicateSelected}>
            <Icon name="copy" />
            복제
          </button>
          <button className="text-button danger" type="button" onClick={actions.deleteSelected}>
            <Icon name="trash-2" />
            삭제
          </button>
          <button className="text-button primary" type="button" onClick={() => void actions.saveChanges()} disabled={state.saving}>
            <Icon name="save" />
            저장
          </button>
        </div>
      </div>
    </>
  );
}
