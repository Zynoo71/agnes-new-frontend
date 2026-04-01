import type { Message } from "@/stores/conversationStore";
import { ToolCallBlock } from "./ToolRenderer/ToolCallBlock";
import { NodeSteps } from "./NodeSteps";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[75%] rounded-xl px-4 py-3 ${
          isUser
            ? "bg-user-bubble text-text-primary"
            : "bg-assistant-bubble border border-border text-text-primary"
        }`}
      >
        {message.nodes.length > 0 && <NodeSteps nodes={message.nodes} />}

        {message.content && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        )}

        {message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCalls.map((tc) => (
              <ToolCallBlock key={tc.toolCallId} {...tc} />
            ))}
          </div>
        )}

        {message.error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-error">
            <span className="font-medium">⚠️ {message.error.errorType}</span>
            <p>{message.error.message}</p>
            {message.error.recoverable && (
              <span className="text-text-tertiary">(recoverable)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
