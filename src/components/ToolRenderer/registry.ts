import type { FC } from "react";
import { WebSearchRenderer } from "./renderers/WebSearchRenderer";
import { ImageSearchRenderer } from "./renderers/ImageSearchRenderer";
import { LoadSkillRenderer } from "./renderers/LoadSkillRenderer";
import { FileToolRenderer } from "./renderers/FileToolRenderer";
import { ExecuteRenderer } from "./renderers/ExecuteRenderer";
import { WebReadRenderer } from "./renderers/WebReadRenderer";
import { ScheduleManagerRenderer } from "./renderers/ScheduleManagerRenderer";
import { GenerateImageRenderer } from "./renderers/GenerateImageRenderer";

export interface ToolRenderProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  toolCallId: string;
  /** True when subsequent content (text/tool_call) has arrived after this block. */
  autoCollapse?: boolean;
}

/** Explicit tool name → renderer mapping. Add new renderers here. */
const TOOL_RENDERERS: Record<string, FC<ToolRenderProps>> = {
  web_search: WebSearchRenderer,
  read_webpage: WebReadRenderer,
  image_search: ImageSearchRenderer,
  load_skill: LoadSkillRenderer,
  read_file: FileToolRenderer,
  write_file: FileToolRenderer,
  edit_file: FileToolRenderer,
  list_files: FileToolRenderer,
  grep: FileToolRenderer,
  glob: FileToolRenderer,
  execute: ExecuteRenderer,
  schedule_manager: ScheduleManagerRenderer,
  generate_image: GenerateImageRenderer,
};

export function getToolRenderer(toolName: string): FC<ToolRenderProps> | undefined {
  return TOOL_RENDERERS[toolName];
}
