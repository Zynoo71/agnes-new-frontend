import type { FC } from "react";
import { WebSearchRenderer } from "./renderers/WebSearchRenderer";
import { ImageSearchRenderer } from "./renderers/ImageSearchRenderer";
import { LoadSkillRenderer } from "./renderers/LoadSkillRenderer";
import { FileToolRenderer } from "./renderers/FileToolRenderer";
import { ExecuteRenderer } from "./renderers/ExecuteRenderer";
import { WebReadRenderer } from "./renderers/WebReadRenderer";
import { ScheduleManagerRenderer } from "./renderers/ScheduleManagerRenderer";
import { SlideToolRenderer } from "./renderers/SlideToolRenderer";
import { GenerateImageRenderer } from "./renderers/GenerateImageRenderer";
import { GenerateVideoRenderer } from "./renderers/GenerateVideoRenderer";
import { WeatherRenderer } from "./renderers/WeatherRenderer";
import { SheetToolRenderer } from "./renderers/SheetToolRenderer";
import { SportsResultsRenderer } from "./renderers/SportsResultsRenderer";
import { YoutubeVideosRenderer } from "./renderers/YoutubeVideosRenderer";
import { StockQuoteRenderer } from "./renderers/StockQuoteRenderer";
import { ReportCardRenderer } from "./renderers/ReportCardRenderer";
import { VisualRecognitionRenderer } from "./renderers/VisualRecognitionRenderer";

export interface ToolRenderProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  toolCallId: string;
  streamStdout?: string;
  streamStderr?: string;
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
  generate_outline: SlideToolRenderer,
  generate_design_system: SlideToolRenderer,
  generate_local_design: SlideToolRenderer,
  render_html: SlideToolRenderer,
  delegate_to_slide_agent: SlideToolRenderer,
  generate_image: GenerateImageRenderer,
  generate_video: GenerateVideoRenderer,
  query_weather: WeatherRenderer,
  show_sports_card: SportsResultsRenderer,
  show_youtube_videos: YoutubeVideosRenderer,
  show_stock_card: StockQuoteRenderer,
  visual_recognition: VisualRecognitionRenderer,
  // Sheet Agent v3 (R21) tools
  plan_analysis: SheetToolRenderer,
  profile_data: SheetToolRenderer,
  list_assets: SheetToolRenderer,
  read_artifact: SheetToolRenderer,
  query_data: SheetToolRenderer,
  run_python: SheetToolRenderer,
  search_table: SheetToolRenderer,
  make_chart: SheetToolRenderer,
  write_report: ReportCardRenderer,
  compose_report: SheetToolRenderer,
  record_insight: SheetToolRenderer,
  spawn_worker: SheetToolRenderer,
};

export function getToolRenderer(toolName: string): FC<ToolRenderProps> | undefined {
  return TOOL_RENDERERS[toolName];
}
