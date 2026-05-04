import { ENTITY_UI } from "../app-config";
import { operationWasAppliedClient, usePlanner } from "../state";
import { Icon } from "../ui/icons";
import type { LlmOperation, LlmTurn } from "../types";
import { operationHeadline, operationSummary, operationTarget } from "./operation-display";

export function LlmOperationCard({ entry }: { entry: { turn: LlmTurn; operation: LlmOperation } }) {
  const { state, actions } = usePlanner();
  const { turn, operation } = entry;
  const applied = operationWasAppliedClient(state.data, operation);
  const ignored = state.llmChat.ignoredOperationIds.includes(operation.id);
  const target = operationTarget(state.data, operation);
  const busy = state.llmChat.applyingId === operation.id;
  const status = applied ? "반영됨" : ignored ? "무시됨" : "검토 필요";
  const statusClass = applied ? "applied" : ignored ? "ignored" : "";

  return (
    <article className={`llm-operation-card ${statusClass}`}>
      <div className="llm-operation-main">
        <div className="llm-operation-title">
          <strong>{operationHeadline(state.data, operation)}</strong>
          <span>{status}</span>
        </div>
        <p>{operationSummary(operation) || turn.userMessage || ""}</p>
        <div className="tag-row">
          <span className="tag teal">{operation.type}</span>
          <span className="tag">신뢰도 {Math.round((operation.confidence || 0.6) * 100)}%</span>
        </div>
      </div>
      <div className="llm-operation-actions">
        <button
          className="text-button primary"
          type="button"
          onClick={() => void actions.applyLlmOperation(operation.id)}
          disabled={applied || ignored || busy}
        >
          {busy ? <Icon name="loader-circle" /> : <Icon name="check" />}
          반영
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => actions.ignoreLlmOperation(operation.id)}
          disabled={applied || ignored}
        >
          <Icon name="ban" />
          무시
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => target && actions.select(target.type, target.id, { view: ENTITY_UI[target.type]?.view || state.view })}
          disabled={!target}
        >
          <Icon name="external-link" />
          관련 항목 보기
        </button>
      </div>
    </article>
  );
}
