import type { Message, ContentBlock, HumanReviewData } from "@/stores/conversationStore";
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
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-5`}>
      <div
        className={`rounded-2xl ${
          isUser
            ? "bg-user-bubble text-text-primary max-w-[70%] px-4 py-2.5"
            : "text-text-primary max-w-[85%] py-1"
        }`}
      >
        {message.nodes.length > 0 && <NodeSteps nodes={message.nodes} />}

        {message.blocks.map((block, i) => (
          <BlockRenderer
            key={i}
            block={block}
            onHitlResume={onHitlResume}
            isStreaming={isStreaming}
          />
        ))}

        {message.error && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-error-light rounded-xl text-xs">
            <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-error/10 flex items-center justify-center">
              <span className="text-error text-[10px]">!</span>
            </span>
            <div>
              <p className="font-medium text-error">{message.error.errorType}</p>
              <p className="text-text-secondary mt-0.5">{message.error.message}</p>
              {message.error.recoverable && (
                <span className="text-text-tertiary mt-1 inline-block">Recoverable</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockRenderer({
  block,
  onHitlResume,
  isStreaming,
}: {
  block: ContentBlock;
  onHitlResume?: (action: "approve" | "modify" | "reject", data?: string) => void;
  isStreaming?: boolean;
}) {
  switch (block.type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-text-primary">
          {block.content}
        </p>
      );
    case "tool_call":
      return (
        <div className="my-3">
          <ToolCallBlock {...block.data} />
        </div>
      );
    case "human_review":
      return (
        <HumanReviewBlock
          data={block.data}
          onResume={onHitlResume}
          disabled={isStreaming}
        />
      );
  }
}

function HumanReviewBlock({
  data,
  onResume,
  disabled,
}: {
  data: HumanReviewData;
  onResume?: (action: "approve" | "modify" | "reject", data?: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="my-3 rounded-xl border border-warning/30 bg-warning-light/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-full bg-warning/20 flex items-center justify-center">
          <span className="text-warning text-xs">!</span>
        </div>
        <span className="text-sm font-semibold text-text-primary">Review Required</span>
      </div>

      <details open>
        <summary className="cursor-pointer text-xs font-medium text-text-secondary hover:text-text-primary transition-colors">
          Payload
        </summary>
        <pre className="mt-2 text-xs bg-surface rounded-lg p-3 overflow-x-auto whitespace-pre-wrap
                        border border-border-light font-mono text-text-secondary leading-relaxed">
          {JSON.stringify(data.payload, null, 2)}
        </pre>
      </details>

      {data.resolved ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-success font-medium">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Resolved
        </div>
      ) : (
        onResume && (
          <div className="flex gap-2 mt-4">
            {(["approve", "modify", "reject"] as const).map((action) => (
              <button
                key={action}
                onClick={() => {
                  if (action === "modify") {
                    const input = prompt("Modify data (JSON or text):");
                    if (input !== null) onResume(action, input);
                  } else {
                    onResume(action);
                  }
                }}
                disabled={disabled}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all
                           active:scale-[0.97] disabled:opacity-40 ${
                  action === "approve"
                    ? "bg-success text-white hover:bg-success/90"
                    : action === "reject"
                      ? "bg-error text-white hover:bg-error/90"
                      : "bg-surface border border-border text-text-primary hover:bg-surface-hover"
                }`}
              >
                {action.charAt(0).toUpperCase() + action.slice(1)}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
