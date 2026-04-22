import { createElement } from "react";
import type { ToolCallData } from "@/stores/conversationStore";
import { getToolRenderer } from "./registry";
import { DefaultJsonRenderer } from "./DefaultJsonRenderer";

export function ToolCallBlock({ toolName, toolInput, toolResult, toolCallId, streamStdout, streamStderr, autoCollapse }: ToolCallData & { autoCollapse?: boolean }) {
  const props = { toolName, toolInput, toolResult, toolCallId, streamStdout, streamStderr, autoCollapse };
  return createElement(getToolRenderer(toolName) ?? DefaultJsonRenderer, props);
}
