import { useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { llmChatTurns, usePlanner } from "../state";
import { Icon } from "../ui/icons";
import type { LlmOperation, LlmTurn } from "../types";
import { LlmOperationCard } from "./LlmOperationCard";

interface AssistantUiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: Date;
}

export function AssistantThread({ operations }: { operations: Array<{ turn: LlmTurn; operation: LlmOperation }> }) {
  const { state, actions } = usePlanner();
  const [pendingMessage, setPendingMessage] = useState<string>("");
  const turns = llmChatTurns(state.data);
  const messages = useMemo<AssistantUiMessage[]>(() => {
    const stored = turns.flatMap((turn) => {
      const id = turn.id || `turn-${turn.createdAt || Math.random()}`;
      return [
        {
          id: `${id}-user`,
          role: "user" as const,
          content: turn.userMessage || turn.text || "",
          createdAt: turn.createdAt ? new Date(turn.createdAt) : undefined,
        },
        {
          id: `${id}-assistant`,
          role: "assistant" as const,
          content: turn.assistantMessage || "검토용 operation 초안을 만들었습니다.",
          createdAt: turn.createdAt ? new Date(turn.createdAt) : undefined,
        },
      ];
    });
    if (!pendingMessage) return stored;
    return [
      ...stored,
      {
        id: "pending-user-message",
        role: "user" as const,
        content: pendingMessage,
        createdAt: new Date(),
      },
    ];
  }, [pendingMessage, turns]);

  const runtime = useExternalStoreRuntime({
    isRunning: state.llmChat.sending || state.llmChat.importing,
    messages,
    convertMessage: (message): ThreadMessageLike => ({
      id: message.id,
      role: message.role,
      content: [{ type: "text", text: message.content }],
      createdAt: message.createdAt,
    }),
    onNew: async (message: AppendMessage) => {
      const text = message.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (!text) return;
      setPendingMessage(text);
      try {
        await actions.sendLlmMessage(text);
      } finally {
        setPendingMessage("");
      }
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="llm-thread-shell">
        <div className="llm-chat-body">
          <section className="llm-chat-thread" aria-label="최근 대화">
            <ThreadPrimitive.Viewport className="llm-thread-viewport">
              <ThreadPrimitive.Empty>
                <div className="llm-empty">최근 대화가 없습니다.</div>
              </ThreadPrimitive.Empty>
              <div className="llm-thread-messages">
                <ThreadPrimitive.Messages>{() => <LlmThreadMessage />}</ThreadPrimitive.Messages>
              </div>
            </ThreadPrimitive.Viewport>
          </section>
          <section className="llm-operation-list" aria-label="변경 제안">
            {operations.length ? (
              operations.map((entry) => <LlmOperationCard entry={entry} key={entry.operation.id} />)
            ) : (
              <div className="llm-empty">검토할 제안이 없습니다.</div>
            )}
          </section>
        </div>
        <ComposerPrimitive.Root className="llm-chat-form">
          <ComposerPrimitive.Input className="llm-chat-input" rows={2} placeholder="기획 지시를 입력하세요" />
          <ComposerPrimitive.Send asChild>
            <button className="text-button primary" type="button" disabled={state.llmChat.sending || state.llmChat.importing}>
              <Icon name="send" />
              전송
            </button>
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function LlmThreadMessage() {
  const role = useAuiState((runtimeState) => runtimeState.message.role);
  return (
    <MessagePrimitive.Root className="llm-turn">
      <div className={role === "user" ? "llm-user-message" : "llm-assistant-message"}>
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}
