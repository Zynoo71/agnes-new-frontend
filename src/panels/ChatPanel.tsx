import { useState, useEffect, useRef, useCallback, type ChangeEvent, type KeyboardEvent } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import { useConversationListStore } from "@/stores/conversationListStore";
import { useChat } from "@/hooks/useChat";
import { useHealthCheck, type HealthInfo } from "@/hooks/useHealthCheck";
import { uploadChatAttachment } from "@/api/chatAttachment";
import { MessageBubble } from "@/components/MessageBubble";
import { ArtifactsBar } from "@/components/ArtifactsBar";
import { EventStream } from "@/components/EventStream";
import { SystemPromptSelector } from "@/components/SystemPromptSelector";
import { ChatSkillsPicker } from "@/components/ChatSkillsPicker";
import { hydrateConversationSkillsFromServer } from "@/lib/conversationSkillSync";
import { syncExtraContextDisallowedSkills } from "@/config/agentAdditionalDisallowedSkills";
import type { ChatAttachment } from "@/types/chatAttachment";
import type { AgentTask, ContentBlock, Message, SourceCitation, WorkerState } from "@/stores/conversationStore";

const AGENT_TYPES = ["super", "search", "research", "slide", "design", "sheet"] as const;

const SCROLL_HINTS_ROW1 = [
  "Search the latest AI news",
  "Summarize a research paper",
  "Draft a professional email",
  "Compare product features",
  "Plan a weekend trip to Kyoto",
  "Explain quantum computing simply",
  "Debug my React component",
  "Write a product launch plan",
];
const SCROLL_HINTS_ROW2 = [
  "Analyze a financial report",
  "Create a competitive analysis",
  "Translate this into French",
  "Design a database schema",
  "Review my pull request",
  "Generate test cases for an API",
  "Brainstorm startup ideas",
  "Optimize this SQL query",
];

const HEALTH_CONFIG = {
  ok: { dot: "bg-green-500", color: "#22c55e", label: "Connected" },
  error: { dot: "bg-red-500", color: "#ef4444", label: "Disconnected" },
  checking: { dot: "bg-yellow-500", color: "#eab308", label: "Connecting" },
} as const;

function stringifyForExport(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHtmlDataList(items: Array<{ label: string; value: string }>): string {
  return items
    .map(({ label, value }) => `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");
}

function renderHtmlCodeBlock(content: string, lang = "text"): string {
  if (!content.trim()) return "";
  return `<div class="code-block"><div class="code-label">${escapeHtml(lang)}</div><pre><code>${escapeHtml(content)}</code></pre></div>`;
}

function renderHtmlAttachmentList(files: ChatAttachment[]): string {
  if (files.length === 0) return "";
  return `
    <section class="section-block">
      <h4>Attachments</h4>
      <ul class="bullet-list">
        ${files.map((file) => `
          <li>
            <span class="strong">${escapeHtml(file.filename || "Unnamed file")}</span>
            <span class="muted">${escapeHtml(file.mimeType)}</span>
            ${file.url ? `<a href="${escapeHtml(file.url)}" target="_blank" rel="noreferrer">Open</a>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function renderHtmlSources(sources: SourceCitation[]): string {
  if (sources.length === 0) return "";
  return `
    <section class="section-block">
      <h4>Sources</h4>
      <ul class="bullet-list sources-list">
        ${sources.map((source) => `
          <li>
            <div class="strong">[${escapeHtml(String(source.ref))}] ${escapeHtml(source.title)}</div>
            <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a>
            ${source.snippet ? `<p class="muted">${escapeHtml(source.snippet)}</p>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function renderHtmlTasks(tasks: AgentTask[]): string {
  if (tasks.length === 0) {
    return `
      <section class="section-block">
        <h4>Tasks</h4>
        <p class="muted">No tasks captured.</p>
      </section>
    `;
  }

  return `
    <section class="section-block">
      <h4>Tasks</h4>
      <div class="task-grid">
        ${tasks.map((task) => `
          <article class="task-card">
            <div class="task-head">
              <span class="badge">#${task.id}</span>
              <span class="status-pill">${escapeHtml(task.status)}</span>
            </div>
            <div class="strong">${escapeHtml(task.title)}</div>
            ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ""}
            ${task.depends_on.length > 0 ? `<p class="muted">depends_on: ${escapeHtml(task.depends_on.join(", "))}</p>` : ""}
            ${task.result ? `<div class="mini-block"><div class="mini-label">Result</div><pre>${escapeHtml(task.result)}</pre></div>` : ""}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderHtmlToolSection(title: string, toolName: string, toolInput: Record<string, unknown>, toolResult?: Record<string, unknown>, streamStdout?: string, streamStderr?: string): string {
  return `
    <section class="section-block tool-block">
      <h4>${escapeHtml(title)}: ${escapeHtml(toolName || "unknown")}</h4>
      <div class="mini-block"><div class="mini-label">Input</div>${renderHtmlCodeBlock(stringifyForExport(toolInput), "json")}</div>
      ${streamStdout?.trim() ? `<div class="mini-block"><div class="mini-label">Stdout</div>${renderHtmlCodeBlock(streamStdout, "text")}</div>` : ""}
      ${streamStderr?.trim() ? `<div class="mini-block"><div class="mini-label">Stderr</div>${renderHtmlCodeBlock(streamStderr, "text")}</div>` : ""}
      <div class="mini-block"><div class="mini-label">Result</div>${toolResult ? renderHtmlCodeBlock(stringifyForExport(toolResult), "json") : '<p class="muted">Pending or streamed without final payload.</p>'}</div>
    </section>
  `;
}

function renderHtmlWorker(worker: WorkerState): string {
  return `
    <section class="section-block worker-block">
      <h4>Worker: ${escapeHtml(worker.description || worker.workerId)}</h4>
      <div class="meta-grid">
        ${renderHtmlDataList([
          { label: "id", value: worker.workerId },
          { label: "status", value: worker.status },
        ])}
      </div>
      ${worker.items.map((item, index) => item.kind === "text"
        ? `<div class="mini-block"><div class="mini-label">Worker Text ${index + 1}</div><div class="rich-text">${escapeHtml(item.content).replaceAll("\n", "<br />")}</div></div>`
        : renderHtmlToolSection(`Worker Tool ${index + 1}`, item.toolName, item.toolInput, item.toolResult)
      ).join("")}
      ${worker.summary ? `<div class="mini-block"><div class="mini-label">Summary</div><div class="rich-text">${escapeHtml(worker.summary).replaceAll("\n", "<br />")}</div></div>` : ""}
      ${worker.error ? `<div class="mini-block"><div class="mini-label">Error</div><pre>${escapeHtml(worker.error)}</pre></div>` : ""}
    </section>
  `;
}

function renderHtmlBlock(block: ContentBlock, tasks: AgentTask[]): string {
  switch (block.type) {
    case "Message":
      return block.content.trim() ? `<section class="section-block"><div class="rich-text">${escapeHtml(block.content).replaceAll("\n", "<br />")}</div></section>` : "";
    case "File":
      return renderHtmlAttachmentList([block.data]);
    case "Reasoning":
      return `<section class="section-block"><h4>Reasoning</h4><div class="rich-text">${escapeHtml(block.content).replaceAll("\n", "<br />")}</div></section>`;
    case "ToolCallStart":
      return renderHtmlToolSection("Tool", block.data.toolName, block.data.toolInput, block.data.toolResult, block.data.streamStdout, block.data.streamStderr);
    case "human_review":
      return `
        <section class="section-block">
          <h4>Human Review</h4>
          <div class="meta-grid">${renderHtmlDataList([{ label: "state", value: block.data.state }])}</div>
          <div class="mini-block"><div class="mini-label">Payload</div>${renderHtmlCodeBlock(stringifyForExport(block.data.payload), "json")}</div>
        </section>
      `;
    case "TaskList":
      return renderHtmlTasks(tasks);
    case "ContextCompacting":
      return `<section class="section-block"><h4>Context Compacting</h4><div class="meta-grid">${renderHtmlDataList([{ label: "done", value: block.done ? "yes" : "no" }])}</div></section>`;
    case "SlideOutline":
      return `<section class="section-block"><h4>Slide Outline</h4>${renderHtmlCodeBlock(stringifyForExport(block.data.outline), "json")}</section>`;
    case "SlideDesignSystem":
      return `<section class="section-block"><h4>Slide Design System</h4><div class="rich-text">${escapeHtml(block.data.summary).replaceAll("\n", "<br />")}</div></section>`;
    case "MemoryUpdate":
      return `
        <section class="section-block">
          <h4>Memory Update</h4>
          <div class="meta-grid">${renderHtmlDataList([{ label: "field", value: block.data.field }])}</div>
          <div class="rich-text">${escapeHtml(block.data.content).replaceAll("\n", "<br />")}</div>
        </section>
      `;
    case "SheetArtifact":
      return `
        <section class="section-block">
          <h4>Sheet Artifact: ${escapeHtml(block.data.name)}</h4>
          <div class="meta-grid">
            ${renderHtmlDataList([
              { label: "artifact_id", value: block.data.artifactId },
              { label: "type", value: block.data.artifactType },
              { label: "producer_node_id", value: block.data.producerNodeId || "n/a" },
              { label: "invalidated", value: block.data.invalidated ? "yes" : "no" },
              ...(block.data.invalidatedReason ? [{ label: "invalidated_reason", value: block.data.invalidatedReason }] : []),
            ])}
          </div>
          <div class="mini-block"><div class="mini-label">Content</div>${renderHtmlCodeBlock(stringifyForExport(block.data.content), "json")}</div>
        </section>
      `;
    case "SheetPlan":
      return `
        <section class="section-block">
          <h4>Sheet Plan</h4>
          <ul class="bullet-list">
            ${block.data.dimensions.map((dimension) => `<li>[${escapeHtml(dimension.status)}] ${escapeHtml(dimension.title || dimension.id)}${dimension.role ? ` | role: ${escapeHtml(dimension.role)}` : ""}${dimension.error ? ` | error: ${escapeHtml(dimension.error)}` : ""}</li>`).join("")}
          </ul>
        </section>
      `;
    case "AgentThinking":
      return `
        <section class="section-block">
          <h4>Agent Thinking</h4>
          <ul class="bullet-list">
            ${block.phase ? `<li>phase: ${escapeHtml(block.phase)}</li>` : ""}
            ${block.hint ? `<li>hint: ${escapeHtml(block.hint)}</li>` : ""}
            ${(block.items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
      `;
    default:
      return "";
  }
}

function buildConversationHtmlDocument(params: {
  conversationId: string | null;
  agentType: string;
  systemPromptId: string | null;
  extraContext: Record<string, string>;
  messages: Message[];
  tasks: AgentTask[];
}): string {
  const { conversationId, agentType, systemPromptId, extraContext, messages, tasks } = params;
  const exportedAt = new Date().toISOString();
  const renderedMessages = messages.map((message, index) => {
    const meta = [
      { label: "message_id", value: message.id },
      ...(message.requestStartedAt ? [{ label: "request_started_at", value: new Date(message.requestStartedAt).toISOString() }] : []),
      ...(message.ttftMs != null ? [{ label: "ttft_ms", value: String(message.ttftMs) }] : []),
      ...(message.agentStartedAt ? [{ label: "agent_started_at", value: new Date(message.agentStartedAt).toISOString() }] : []),
      ...(message.agentDurationMs != null ? [{ label: "agent_duration_ms", value: String(message.agentDurationMs) }] : []),
      ...(message.error ? [
        { label: "error_type", value: message.error.errorType },
        { label: "error_message", value: message.error.message },
        { label: "error_recoverable", value: message.error.recoverable ? "yes" : "no" },
      ] : []),
    ];

    return `
      <article class="message-card message-${escapeHtml(message.role)}">
        <header class="message-header">
          <div>
            <div class="message-kicker">${index + 1}. ${escapeHtml(message.role === "user" ? "User" : "Assistant")}</div>
            <h3>${escapeHtml(message.role === "user" ? "User Input" : "Assistant Output")}</h3>
          </div>
        </header>
        <div class="meta-grid">${renderHtmlDataList(meta)}</div>
        <div class="section-stack">
          ${message.blocks.length === 0 ? '<section class="section-block"><p class="muted">No content blocks captured.</p></section>' : message.blocks.map((block) => renderHtmlBlock(block, tasks)).join("")}
          ${Object.values(message.workers).length > 0 ? `<section class="section-block"><h4>Workers</h4><div class="section-stack">${Object.values(message.workers).map((worker) => renderHtmlWorker(worker)).join("")}</div></section>` : ""}
          ${renderHtmlSources(message.sources)}
        </div>
      </article>
    `;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agnes Conversation Export</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --canvas: #ffffff;
      --border: #d7deea;
      --text: #142033;
      --sub: #5b6980;
      --accent: #1f4fd1;
      --user: #edf4ff;
      --assistant: #f8fbff;
      --chip: #eef2f8;
      --code: #0f172a;
      --code-bg: #f3f6fb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.6;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .page {
      width: min(1200px, calc(100vw - 48px));
      margin: 24px auto 48px;
    }
    .hero, .message-card {
      background: var(--canvas);
      border: 1px solid var(--border);
    }
    .hero {
      padding: 28px;
      margin-bottom: 20px;
    }
    .hero h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.15;
    }
    .hero p {
      margin: 8px 0 0;
      color: var(--sub);
      max-width: 820px;
    }
    .summary-grid, .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px 16px;
      margin-top: 18px;
    }
    .meta-row {
      border-top: 1px solid var(--border);
      padding-top: 10px;
    }
    .meta-row dt {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--sub);
      margin-bottom: 4px;
    }
    .meta-row dd {
      margin: 0;
      font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message-list {
      display: grid;
      gap: 20px;
    }
    .message-card {
      padding: 20px;
    }
    .message-user { background: linear-gradient(0deg, var(--canvas), var(--user)); }
    .message-assistant { background: linear-gradient(0deg, var(--canvas), var(--assistant)); }
    .message-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }
    .message-kicker {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--sub);
      margin-bottom: 4px;
    }
    .message-header h3, .section-block h4 {
      margin: 0;
    }
    .section-stack {
      display: grid;
      gap: 14px;
      margin-top: 18px;
    }
    .section-block {
      border: 1px solid var(--border);
      padding: 14px 16px;
      background: rgba(255,255,255,0.9);
    }
    .bullet-list {
      margin: 10px 0 0;
      padding-left: 20px;
    }
    .bullet-list li + li { margin-top: 8px; }
    .rich-text { white-space: pre-wrap; word-break: break-word; }
    .muted { color: var(--sub); }
    .strong { font-weight: 600; }
    .mini-block {
      margin-top: 12px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }
    .mini-label, .code-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--sub);
      margin-bottom: 6px;
    }
    .code-block pre, .mini-block pre {
      margin: 0;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--code-bg);
      border: 1px solid var(--border);
      padding: 12px;
      color: var(--code);
      font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
    }
    .task-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .task-card {
      border: 1px solid var(--border);
      padding: 12px;
      background: #fbfcfe;
    }
    .task-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }
    .badge, .status-pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border: 1px solid var(--border);
      background: var(--chip);
      font-size: 11px;
      font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
    }
    .sources-list p { margin: 4px 0 0; }
    @media (max-width: 720px) {
      .page { width: min(100vw - 24px, 1200px); }
      .hero, .message-card { padding: 16px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="message-kicker">Agnes Export / XHTML</div>
      <h1>Conversation Archive</h1>
      <p>Self-contained XHTML export of the conversation timeline, tool traces, sources, worker activity, and captured task state.</p>
      <div class="summary-grid">
        ${renderHtmlDataList([
          { label: "exported_at", value: exportedAt },
          { label: "conversation_id", value: conversationId ?? "not-created" },
          { label: "agent_type", value: agentType },
          { label: "system_prompt_id", value: systemPromptId ?? "default" },
          { label: "extra_context", value: Object.keys(extraContext).length > 0 ? stringifyForExport(extraContext) : "{}" },
          { label: "message_count", value: String(messages.length) },
        ])}
      </div>
      ${renderHtmlTasks(tasks)}
    </section>
    <section class="message-list">
      ${renderedMessages}
    </section>
  </main>
</body>
</html>`;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "conversation";
}

function HealthBadge({ info }: { info: HealthInfo }) {
  const c = HEALTH_CONFIG[info.status];
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
        info.status === "ok"
          ? "bg-green-50 text-green-700"
          : info.status === "error"
            ? "bg-red-50 text-red-700"
            : "bg-yellow-50 text-yellow-700"
      }`}
      title={info.latencyMs != null ? `Latency: ${info.latencyMs}ms` : c.label}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 health-dot ${c.dot}`}
        style={{ "--breathing-color": c.color } as React.CSSProperties}
      />
      <span>{c.label}</span>
      {info.latencyMs != null && (
        <span className="font-mono opacity-60">{info.latencyMs}ms</span>
      )}
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="animate-message-in space-y-6 py-2">
      {/* Assistant message skeleton */}
      <div className="flex gap-2.5">
        <div className="skeleton w-7 h-7 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-3.5 w-3/4" />
          <div className="skeleton h-3.5 w-1/2" />
          <div className="skeleton h-3.5 w-5/6" />
        </div>
      </div>
      {/* User message skeleton */}
      <div className="flex justify-end gap-2.5">
        <div className="space-y-2 pt-1">
          <div className="skeleton h-3.5 w-48 ml-auto" />
        </div>
        <div className="skeleton w-7 h-7 rounded-full shrink-0" />
      </div>
      {/* Another assistant skeleton */}
      <div className="flex gap-2.5">
        <div className="skeleton w-7 h-7 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-3.5 w-2/3" />
          <div className="skeleton h-3.5 w-4/5" />
          <div className="skeleton h-20 w-full rounded-xl" />
          <div className="skeleton h-3.5 w-1/2" />
        </div>
      </div>
    </div>
  );
}

function ScrollingHints() {
  const row1 = SCROLL_HINTS_ROW1;
  const row2 = SCROLL_HINTS_ROW2;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none flex flex-col justify-center gap-4">
      <ScrollRow items={row1} direction="left" duration={35} />
      <ScrollRow items={row2} direction="right" duration={40} />
    </div>
  );
}

function ScrollRow({ items, direction, duration }: { items: string[]; direction: "left" | "right"; duration: number }) {
  // Triple for seamless loop
  const repeated = [...items, ...items, ...items];
  return (
    <div className="scroll-row-mask">
      <div
        className={direction === "left" ? "scroll-row-left" : "scroll-row-right"}
        style={{ animationDuration: `${duration}s` }}
      >
        {repeated.map((hint, i) => (
          <span key={i} className="scroll-hint-pill">{hint}</span>
        ))}
      </div>
    </div>
  );
}

function LocationPopover({ city, country, onChange, onClose }: {
  city: string;
  country: string;
  onChange: (city: string, country: string) => void;
  onClose: () => void;
}) {
  const [c, setC] = useState(city);
  const [co, setCo] = useState(country);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const apply = () => {
    onChange(c.trim(), co.trim());
    onClose();
  };

  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-border bg-surface shadow-lg p-3 z-50 animate-message-in">
      <div className="text-xs font-medium text-text-secondary mb-2">Location Context</div>
      <label className="block text-[11px] text-text-tertiary mb-0.5">City</label>
      <input
        value={c}
        onChange={(e) => setC(e.target.value)}
        placeholder="e.g. Shanghai"
        className="w-full mb-2 px-2 py-1.5 text-xs rounded-lg border border-border bg-surface-alt focus:outline-none focus:border-accent"
      />
      <label className="block text-[11px] text-text-tertiary mb-0.5">Country</label>
      <input
        value={co}
        onChange={(e) => setCo(e.target.value)}
        placeholder="e.g. China"
        className="w-full mb-3 px-2 py-1.5 text-xs rounded-lg border border-border bg-surface-alt focus:outline-none focus:border-accent"
        onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
      />
      <div className="flex gap-2">
        <button onClick={() => { onChange("", ""); onClose(); }} className="flex-1 text-xs py-1.5 rounded-lg text-text-tertiary hover:bg-surface-hover transition-colors">
          Clear
        </button>
        <button onClick={apply} className="flex-1 text-xs py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors">
          Apply
        </button>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { conversationId, agentType, messages, tasks, isStreaming, isLoadingHistory, error, setAgentType, systemPromptId, setSystemPromptId, setError, extraContext, setExtraContext } =
    useConversationStore();
  const rawEventsCount = useConversationStore(s => s.rawEvents.length);
  const rawEvents = useConversationStore(s => s.rawEvents);

  const { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream } = useChat();
  const [showEvents, setShowEvents] = useState(false);
  const [input, setInput] = useState("");
  const [showLocation, setShowLocation] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isExportingHtml, setIsExportingHtml] = useState(false);
  const [exportedHtmlUrl, setExportedHtmlUrl] = useState<string | null>(null);
  const [copiedExportUrl, setCopiedExportUrl] = useState(false);
  const isNearBottomRef = useRef(true);
  const pendingScrollRef = useRef(false);
  const lastAutoScrollRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const health = useHealthCheck();

  const isEmpty = messages.length === 0;
  const hasUserMessages = messages.some((m) => m.role === "user");

  // Reset scroll state when conversation changes — force next scroll to bottom.
  useEffect(() => {
    isNearBottomRef.current = true;
    pendingScrollRef.current = true;
    setShowScrollBtn(false);
  }, [conversationId]);

  // 恢复本会话已持久化的 hub skill 选用（刷新 / 切换会话 / 新建会话后与 DB 对齐）
  useEffect(() => {
    if (!conversationId) return;
    void hydrateConversationSkillsFromServer(conversationId);
  }, [conversationId]);

  // Auto-scroll via ResizeObserver: fires whenever the content div changes
  // height (new messages rendered, streaming text appended, images loaded, etc).
  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const observer = new ResizeObserver(() => {
      if (pendingScrollRef.current || isNearBottomRef.current) {
        pendingScrollRef.current = false;
        container.scrollTop = container.scrollHeight;
        // Mark as programmatic scroll so handleScroll won't
        // invalidate isNearBottomRef before the next resize fires.
        lastAutoScrollRef.current = Date.now();
        isNearBottomRef.current = true;
      }
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Ignore scroll events triggered by programmatic scrolling —
    // the async onScroll fires after content has grown further,
    // giving a stale distanceFromBottom that falsely clears isNearBottom.
    if (Date.now() - lastAutoScrollRef.current < 200) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 100;
    setShowScrollBtn(distanceFromBottom > 200);
  }, []);

  const scrollToBottom = () => {
    isNearBottomRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const isComposingRef = useRef(false);

  const sendNow = useCallback(async (text: string, files: ChatAttachment[]) => {
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;

    isNearBottomRef.current = true;

    if (!conversationId) {
      await createConversation();
    }

    // §8.9 IGNORED: typing in the chat input while a HumanReview is pending now
    // bypasses the card — backend will mark the old turn `ignored`. The card
    // itself owns approve/modify (see HumanReviewBlock). useChat.sendMessage
    // optimistically greys out any pending review locally.
    await sendMessage(trimmed, files);
  }, [conversationId, createConversation, sendMessage]);

  const handleSend = async (text?: string) => {
    const trimmed = (text ?? input).trim();
    if ((!trimmed && pendingFiles.length === 0) || isUploadingFiles || isStreaming) return;
    const filesToSend = pendingFiles;
    setInput("");
    setPendingFiles([]);
    await sendNow(trimmed, filesToSend);
    // ResizeObserver handles the scroll when content appears.
  };

  const handleSelectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setIsUploadingFiles(true);
    setError(null);
    try {
      let uploadConversationId = conversationId;
      if (!uploadConversationId) {
        uploadConversationId = await createConversation();
      }
      const uploaded: ChatAttachment[] = [];
      for (const file of files) {
        uploaded.push(await uploadChatAttachment(file, uploadConversationId));
      }
      setPendingFiles((prev) => [...prev, ...uploaded]);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
      setError(`Upload failed: ${message}`);
    } finally {
      setIsUploadingFiles(false);
      event.target.value = "";
    }
  };

  const handleRemovePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Check both standard isComposing and our ref for broader compatibility
    const isComposing = e.nativeEvent.isComposing || isComposingRef.current;
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasInput = input.trim().length > 0;
  const canSend = (hasInput || pendingFiles.length > 0) && !isUploadingFiles && !isStreaming;

  const handleExportHtml = useCallback(async () => {
    if (messages.length === 0 || isExportingHtml) return;

    setIsExportingHtml(true);
    setCopiedExportUrl(false);
    setError(null);

    try {
      const content = buildConversationHtmlDocument({
        conversationId,
        agentType,
        systemPromptId,
        extraContext,
        messages,
        tasks,
      });
      const filename = `${sanitizeFilenamePart(agentType)}-${sanitizeFilenamePart(conversationId ?? "draft")}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.html`;
      const file = new File([content], filename, { type: "application/xml" });
      const uploaded = await uploadChatAttachment(file);
      setExportedHtmlUrl(uploaded.url);
      window.open(uploaded.url, "_blank", "noopener,noreferrer");
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : String(exportError);
      setError(`HTML export failed: ${message}`);
    } finally {
      setIsExportingHtml(false);
    }
  }, [agentType, conversationId, extraContext, isExportingHtml, messages, setError, systemPromptId, tasks]);

  const handleCopyExportUrl = useCallback(() => {
    if (!exportedHtmlUrl) return;
    navigator.clipboard.writeText(exportedHtmlUrl).then(() => {
      setCopiedExportUrl(true);
      window.setTimeout(() => setCopiedExportUrl(false), 1500);
    });
  }, [exportedHtmlUrl]);

  const inputArea = (
    <div className={`rounded-[20px] border border-border bg-surface shadow-sm
                    focus-within:shadow-md focus-within:border-border transition-shadow
                    ${isEmpty ? "max-w-xl w-full" : ""}`}>
      {/* Agent mode selector + Prompt selector */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-0">
        <div className="flex items-center gap-1">
          {AGENT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                setAgentType(t);
                const prevEc = useConversationStore.getState().extraContext;
                useConversationStore.getState().setExtraContext(syncExtraContextDisallowedSkills(prevEc, t));
                if (conversationId) useConversationListStore.getState().update(conversationId, { agentType: t });
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all capitalize ${
                agentType === t
                  ? "bg-accent/10 text-accent"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <SystemPromptSelector
          selectedId={systemPromptId}
          onChange={(id) => {
            setSystemPromptId(id);
            if (conversationId) {
              useConversationListStore.getState().update(conversationId, { systemPromptId: id });
            }
          }}
          disabled={hasUserMessages}
        />
      </div>
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {pendingFiles.map((file, index) => (
            <div
              key={`${file.url}-${index}`}
              className="flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-900"
            >
              <span className="truncate max-w-52 font-medium">{file.filename}</span>
              <span className="truncate text-sky-700/80">{file.mimeType}</span>
              <button
                type="button"
                onClick={() => handleRemovePendingFile(index)}
                className="rounded-full p-0.5 text-sky-700 transition-colors hover:bg-sky-200 hover:text-sky-900"
                title="Remove attachment"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleSelectFiles}
        />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          placeholder={isUploadingFiles ? "Uploading attachment..." : "Ask Agnes anything..."}
          rows={1}
          className="flex-1 resize-none bg-transparent py-2.5 px-4 text-sm
                     focus:outline-none disabled:opacity-40 placeholder:text-text-tertiary"
        />
        <div className="mb-2.5 mr-3 ml-1 flex shrink-0 items-center gap-2">
          <button
            onClick={() => handleSend()}
            disabled={!canSend}
            className={`flex h-9 w-9 items-center justify-center rounded-xl active:scale-95 transition-all
              ${canSend
                ? "bg-accent text-white hover:bg-accent-hover"
                : "bg-text-tertiary/20 text-text-tertiary/50"
              }`}
            title="Send message"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
          {isStreaming && (
            <button
              onClick={cancelStream}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-error text-white hover:bg-error/80 active:scale-95 transition-all"
              title="Stop generating"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {/* Bottom toolbar */}
      <div className="flex items-center gap-0.5 px-3 pb-2 pt-0 relative">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || isUploadingFiles}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-full transition-all ${
            pendingFiles.length > 0
              ? "bg-accent/10 text-accent"
              : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
          } disabled:cursor-not-allowed disabled:opacity-40`}
          title="Upload file"
        >
          {isUploadingFiles ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M12 2a10 10 0 00-10 10h3a7 7 0 017-7V2z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a3 3 0 11-4.243-4.243l8.4-8.4a2 2 0 112.829 2.828l-7.108 7.108a1 1 0 11-1.414-1.414l6.011-6.01" />
            </svg>
          )}
          <span>Attach</span>
        </button>
        <button
          onClick={() => setShowLocation(!showLocation)}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-full transition-all ${
            extraContext.city || extraContext.country
              ? "bg-accent/10 text-accent"
              : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
          }`}
          title="Set location context"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          {extraContext.city || extraContext.country
            ? <span>{[extraContext.city, extraContext.country].filter(Boolean).join(", ")}</span>
            : <span>Location</span>
          }
        </button>
        {agentType === "super" && (
          <ChatSkillsPicker
            conversationId={conversationId}
            disabled={isStreaming}
            toolbar
          />
        )}
        {showLocation && (
          <LocationPopover
            city={(extraContext.city as string) ?? ""}
            country={(extraContext.country as string) ?? ""}
            onChange={(city, country) => {
              const ctx: { [key: string]: string } = {};
              if (city) ctx.city = city;
              if (country) ctx.country = country;
              setExtraContext(ctx);
            }}
            onClose={() => setShowLocation(false)}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top controls */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-light bg-surface-alt">
          <HealthBadge info={health} />

          {conversationId && (
            <code className="text-[11px] text-text-tertiary bg-surface-hover px-2 py-0.5 rounded-md">
              #{conversationId.toString()}
            </code>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => void handleExportHtml()}
              disabled={isEmpty || isExportingHtml}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                isEmpty || isExportingHtml
                  ? "cursor-not-allowed text-text-tertiary/50 bg-surface-hover/50"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {isExportingHtml ? "Exporting HTML..." : "Export HTML"}
            </button>
            {exportedHtmlUrl && (
              <>
                <a
                  href={exportedHtmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-accent hover:bg-surface-hover transition-all"
                >
                  Open Export
                </a>
                <button
                  onClick={handleCopyExportUrl}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
                >
                  {copiedExportUrl ? "Copied" : "Copy Link"}
                </button>
              </>
            )}
            <button
              onClick={() => setShowEvents(!showEvents)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                showEvents
                  ? "bg-accent/10 text-accent"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
              }`}
            >
              Events{rawEventsCount > 0 ? ` (${rawEventsCount})` : ""}
            </button>
          </div>
        </div>

        {/* Messages or Welcome */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-0 relative"
        >
          {isEmpty && !isLoadingHistory && <ScrollingHints />}
          <div ref={contentRef} className="max-w-2xl mx-auto px-5 py-8">
            {isLoadingHistory ? (
              <MessageSkeleton />
            ) : isEmpty ? (
              null
            ) : (
              <>
                {(() => {
                  const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
                  const lastAssistantIdx = messages.findLastIndex((m) => m.role === "assistant");
                  return messages.map((msg, i) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isLast={msg.role === "user" ? i === lastUserIdx : i === lastAssistantIdx}
                      onHitlResume={hitlResume}
                      onEditResend={editResend}
                      onRegenerate={regenerate}
                      isStreaming={isStreaming}
                      animate={!msg.id.startsWith("hist-")}
                    />
                  ));
                })()}
                {isStreaming && messages.length > 0 && !messages[messages.length - 1].blocks.length && (
                  <div className="flex justify-start mb-4 ml-10">
                    <div className="dot-loader flex gap-1 px-4 py-3">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
                {error && (
                  <div className="flex justify-start mb-4 ml-10">
                    <div className="rounded-xl bg-error-light border border-error/20 px-4 py-2.5 text-xs text-error max-w-[85%]">
                      <p className="font-medium mb-0.5">Request Error</p>
                      <p className="text-text-secondary">{error}</p>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {showScrollBtn && !isEmpty && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-surface/90 backdrop-blur border border-border
                         shadow-lg flex items-center justify-center text-text-secondary hover:text-text-primary
                         hover:shadow-xl transition-all animate-message-in"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
              </svg>
            </button>
          )}
        </div>

        <div className="shrink-0 px-5 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
          <div className="max-w-2xl mx-auto">
            <ArtifactsBar />
            {inputArea}
          </div>
        </div>
      </div>

      <div
        className="shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
        style={{ width: showEvents ? 400 : 0 }}
      >
        <div className="w-[400px] h-full">
          {showEvents && <EventStream events={rawEvents} />}
        </div>
      </div>
    </div>
  );
}
