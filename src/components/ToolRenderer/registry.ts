import type { FC } from "react";

export interface ToolRenderProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  toolCallId: string;
}

const registry = new Map<string, FC<ToolRenderProps>>();

export function registerToolRenderer(toolName: string, component: FC<ToolRenderProps>) {
  registry.set(toolName, component);
}

export function getToolRenderer(toolName: string): FC<ToolRenderProps> | undefined {
  return registry.get(toolName);
}
