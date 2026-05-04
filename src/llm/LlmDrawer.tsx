import { llmOperationEntries, operationWasAppliedClient, usePlanner } from "../state";
import { Icon } from "../ui/icons";
import { AssistantThread } from "./AssistantThread";
import { DocumentImportPanel } from "./DocumentImportPanel";

export function LlmDrawer() {
  const { state, actions } = usePlanner();
  const operations = llmOperationEntries(state.data);
  const ignored = new Set(state.llmChat.ignoredOperationIds);
  const pendingCount = operations.filter(
    ({ operation }) => !operationWasAppliedClient(state.data, operation) && !ignored.has(operation.id),
  ).length;

  if (!state.llmChat.open) {
    return (
      <div id="llm-chat-root">
        <button className="llm-chat-launcher" type="button" aria-haspopup="dialog" aria-expanded="false" onClick={() => actions.setLlmOpen(true)}>
          <Icon name="message-circle" />
          <span>기획 채팅</span>
          <strong>{pendingCount}</strong>
        </button>
      </div>
    );
  }

  const statusText = state.llmChat.importing
    ? "문서 분석 중..."
    : state.llmChat.sending
      ? "LLM 검토 중..."
      : state.llmChat.error || `${pendingCount}개 제안 대기`;

  return (
    <div id="llm-chat-root">
      <div className="llm-chat-backdrop" onClick={() => actions.setLlmOpen(false)} />
      <section className="llm-chat-drawer" role="dialog" aria-label="LLM 기획 채팅">
        <header className="llm-chat-header">
          <div>
            <p className="eyebrow">LLM Chat</p>
            <h2>기획 변경 제안</h2>
          </div>
          <div className="llm-chat-header-actions">
            <span className={`llm-status ${state.llmChat.error ? "error" : ""}`}>{statusText}</span>
            <button className="small-icon-button" type="button" onClick={() => actions.setLlmOpen(false)} aria-label="채팅 닫기">
              <Icon name="x" />
            </button>
          </div>
        </header>
        <DocumentImportPanel />
        <AssistantThread operations={operations} />
      </section>
    </div>
  );
}
