import type { ToolCallData } from "@/stores/conversationStore";
import { getToolRenderer } from "./registry";
import { DefaultJsonRenderer } from "./DefaultJsonRenderer";

// Import all renderers to trigger registration
import "./renderers/WebSearchRenderer";
import "./renderers/LoadSkillRenderer";

export function ToolCallBlock({ toolName, toolInput, toolResult, toolCallId }: ToolCallData) {
  const Renderer = getToolRenderer(toolName) ?? DefaultJsonRenderer;
  return <Renderer toolName={toolName} toolInput={toolInput} toolResult={toolResult} toolCallId={toolCallId} />;
}
