import type { Message } from "@/stores/conversationStore";
import { ToolCallBlock } from "./ToolRenderer/ToolCallBlock";
import { NodeSteps } from "./NodeSteps";

interface MessageBubbleProps {
  message: Message;
  onHitlResume?: (action: "approve" | "modify" | "reject", data?: string) => void;
  isStreaming?: boolean;
}

export function MessageBubble({ message, onHitlResume, isStreaming }: MessageBubbleProps) {
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

        {message.humanReview && (
          <HumanReviewBlock
            payload={message.humanReview.payload}
            resolved={message.humanReview.resolved}
            onResume={onHitlResume}
            disabled={isStreaming}
          />
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

function HumanReviewBlock({
  payload,
  resolved,
  onResume,
  disabled,
}: {
  payload: Record<string, unknown>;
  resolved: boolean;
  onResume?: (action: "approve" | "modify" | "reject", data?: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-3 text-sm">
      <div className="flex items-center gap-2 mb-2 font-medium text-yellow-800">
        <span>👤</span>
        <span>Human Review Required</span>
      </div>

      <details open>
        <summary className="cursor-pointer text-xs text-yellow-700 hover:text-yellow-900">
          Review payload
        </summary>
        <pre className="mt-1 text-xs bg-white/60 rounded p-2 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {resolved ? (
        <div className="mt-2 text-xs text-green-700 font-medium">✅ Resolved</div>
      ) : (
        onResume && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onResume("approve")}
              disabled={disabled}
              className="rounded-lg bg-green-600 text-white px-3 py-1.5 text-xs font-medium
                         hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              ✅ Approve
            </button>
            <button
              onClick={() => {
                const data = prompt("Modify data (JSON or text):");
                if (data !== null) onResume("modify", data);
              }}
              disabled={disabled}
              className="rounded-lg bg-yellow-600 text-white px-3 py-1.5 text-xs font-medium
                         hover:bg-yellow-700 disabled:opacity-40 transition-colors"
            >
              ✏️ Modify
            </button>
            <button
              onClick={() => onResume("reject")}
              disabled={disabled}
              className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-medium
                         hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              ❌ Reject
            </button>
          </div>
        )
      )}
    </div>
  );
}
