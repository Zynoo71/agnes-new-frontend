import { useEffect, useRef, useState } from "react";
import type { RawEvent } from "@/stores/conversationStore";

// ── Human-readable event formatting ──

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  textDelta:       { label: "Text",        color: "text-green-400" },
  reasoningDelta:  { label: "Thinking",    color: "text-purple-400" },
  toolCallStart:   { label: "Tool Start",  color: "text-blue-400" },
  toolCallArgs:    { label: "Tool Args",   color: "text-blue-300" },
  toolCallResult:  { label: "Tool Result", color: "text-cyan-400" },
  custom:          { label: "Custom",      color: "text-yellow-400" },
  error:           { label: "Error",       color: "text-red-400" },
  streamEnd:       { label: "End",         color: "text-console-dim" },
};

function formatEventSummary(type: string, data: unknown): string | null {
  const d = data as Record<string, unknown> | null;
  if (!d) return null;

  // History events (prefixed with "history:")
  if (type.startsWith("history:")) {
    const subtype = type.slice(8);
    if (subtype === "Message") {
      const content = (d.content as string) ?? "";
      return content.length > 120 ? content.slice(0, 120) + "…" : content;
    }
    if (subtype === "Reasoning") {
      const content = (d.content as string) ?? "";
      return content.length > 80 ? content.slice(0, 80) + "…" : content;
    }
    if (subtype === "ToolCallStart") {
      const name = (d.name as string) ?? "unknown";
      return `${name}()`;
    }
    if (subtype === "ToolCallResult") {
      return "result received";
    }
    if (subtype === "HumanReview") {
      const reviewType = (d.review_type as string) ?? "";
      return reviewType ? `review: ${reviewType}` : "review requested";
    }
    return null;
  }

  // Streaming events
  if (type === "textDelta") {
    const text = (d.text as string) ?? "";
    return text.length > 120 ? text.slice(0, 120) + "…" : text;
  }
  if (type === "reasoningDelta") {
    const text = (d.text as string) ?? "";
    return text.length > 80 ? text.slice(0, 80) + "…" : text;
  }
  if (type === "toolCallStart") {
    const name = (d.name as string) ?? (d.toolName as string) ?? "unknown";
    return `${name}()`;
  }
  if (type === "toolCallArgs") {
    const args = (d.args as string) ?? "";
    return args.length > 100 ? args.slice(0, 100) + "…" : args;
  }
  if (type === "toolCallResult") {
    const result = (d.result as string) ?? "";
    return result.length > 100 ? result.slice(0, 100) + "…" : result;
  }
  if (type === "custom") {
    const customType = (d.type as string) ?? "";
    return customType || null;
  }
  if (type === "error") {
    const msg = (d.message as string) ?? (d.errorType as string) ?? "";
    return msg;
  }
  return null;
}

function getTypeInfo(type: string): { label: string; color: string } {
  if (type.startsWith("history:")) {
    const subtype = type.slice(8);
    const map: Record<string, { label: string; color: string }> = {
      Message:        { label: "Message",     color: "text-green-400" },
      Reasoning:      { label: "Thinking",    color: "text-purple-400" },
      ToolCallStart:  { label: "Tool Call",   color: "text-blue-400" },
      ToolCallResult: { label: "Tool Result", color: "text-cyan-400" },
      HumanReview:    { label: "Review",      color: "text-yellow-400" },
    };
    return map[subtype] ?? { label: subtype, color: "text-console-accent" };
  }
  return TYPE_LABELS[type] ?? { label: type, color: "text-console-accent" };
}

// ── Group consecutive events by role ──

interface EventGroup {
  role: "user" | "assistant" | undefined;
  events: { ev: RawEvent; originalIndex: number }[];
}

function groupEventsByRole(events: RawEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const last = groups[groups.length - 1];
    if (last && last.role === ev.role) {
      last.events.push({ ev, originalIndex: i });
    } else {
      groups.push({ role: ev.role, events: [{ ev, originalIndex: i }] });
    }
  }
  return groups;
}

// ── Sub-event row (indented under role header) ──

function SubEventRow({ ev, index }: { ev: RawEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { label, color } = getTypeInfo(ev.type);
  const summary = formatEventSummary(ev.type, ev.data);
  const isHistory = ev.type.startsWith("history:");
  const timeStr = ev.timestamp > 0
    ? new Date(ev.timestamp).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions)
    : null;

  return (
    <div className="group/sub">
      <div
        className="flex items-baseline gap-2 cursor-pointer hover:bg-white/5 rounded px-1 -mx-1 py-0.5"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] font-mono text-console-dim w-5 text-right shrink-0">
          {isHistory ? "" : timeStr ? (
            <span className="text-console-dim">{timeStr.slice(-6)}</span>
          ) : (
            <span>{index + 1}</span>
          )}
        </span>
        <span className={`text-[11px] font-medium ${color} shrink-0 w-[72px] truncate`}>
          {label}
        </span>
        {summary && (
          <span className="text-[11px] text-console-text/60 truncate flex-1">
            {summary}
          </span>
        )}
        <span className="text-[10px] text-console-dim opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0">
          {expanded ? "▼" : "▶"}
        </span>
      </div>
      {expanded && (
        <pre className="text-[11px] font-mono text-console-text/70 whitespace-pre-wrap overflow-x-auto
                        ml-7 pl-3 my-1 border-l-2 border-white/5 leading-relaxed max-h-60 overflow-y-auto">
          {JSON.stringify(ev.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Role turn group ──

function TurnGroup({ group, defaultOpen }: { group: EventGroup; defaultOpen?: boolean }) {
  const [expanded, setExpanded] = useState(defaultOpen ?? true);
  const isUser = group.role === "user";

  // User turn: clickable header with inline message content
  if (isUser) {
    const msgEvent = group.events.find((e) =>
      e.ev.type === "history:Message" || e.ev.type === "textDelta"
    );
    const summary = msgEvent ? formatEventSummary(msgEvent.ev.type, msgEvent.ev.data) : null;

    return (
      <div>
        <div
          className="rounded bg-amber-500/8 hover:bg-amber-500/15 px-2 py-1 cursor-pointer flex items-baseline gap-2 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <svg className={`w-2.5 h-2.5 text-amber-400/60 transition-transform duration-150 shrink-0 ${expanded ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-[11px] font-semibold text-amber-300 shrink-0">User</span>
          {summary && (
            <span className="text-[11px] text-amber-200/70 truncate flex-1">{summary}</span>
          )}
        </div>
        {expanded && (
          <div className="ml-2 border-l border-amber-500/15 pl-2 mt-0.5">
            {group.events.map(({ ev, originalIndex }) => (
              <SubEventRow key={originalIndex} ev={ev} index={originalIndex} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Assistant turn: clickable header + collapsible sub-events
  return (
    <div>
      <div
        className="flex items-baseline gap-2 px-1 py-0.5 cursor-pointer hover:bg-white/5 rounded transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <svg className={`w-2.5 h-2.5 text-green-400/60 transition-transform duration-150 shrink-0 ${expanded ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-[11px] font-semibold text-green-400 shrink-0">Assistant</span>
        <span className="text-[10px] text-console-dim">{group.events.length} events</span>
      </div>
      {expanded && (
        <div className="ml-2 border-l border-white/5 pl-2 space-y-0">
          {group.events.map(({ ev, originalIndex }) => (
            <SubEventRow key={originalIndex} ev={ev} index={originalIndex} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ──

export function EventStream({ events }: { events: RawEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const historyCount = events.filter((e) => e.type.startsWith("history:")).length;
  const streamCount = events.length - historyCount;

  const historyGroups = historyCount > 0 ? groupEventsByRole(events.slice(0, historyCount)) : [];
  const streamGroups = streamCount > 0 ? groupEventsByRole(events.slice(historyCount)) : [];

  return (
    <div className="h-full flex flex-col bg-console-bg">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <span className="text-xs font-medium text-console-dim tracking-wide uppercase">
          Events
        </span>
        <div className="flex items-center gap-2">
          {historyCount > 0 && (
            <span className="text-[10px] font-mono text-console-dim bg-white/5 px-2 py-0.5 rounded-full">
              {historyCount} history
            </span>
          )}
          <span className="text-[10px] font-mono text-console-dim bg-white/5 px-2 py-0.5 rounded-full">
            {streamCount > 0 ? `${streamCount} stream` : events.length}
          </span>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
      >
        {historyGroups.map((g, i) => (
          <TurnGroup key={`hg-${i}`} group={g} />
        ))}
        {historyGroups.length > 0 && streamGroups.length > 0 && (
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] text-console-dim uppercase tracking-wider">Stream</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
        )}
        {streamGroups.map((g, i) => (
          <TurnGroup key={`sg-${i}`} group={g} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
