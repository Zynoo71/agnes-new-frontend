import { useEffect, useRef, useState, useMemo, memo } from "react";
import type { RawEvent } from "@/stores/conversationStore";

// ── Human-readable event formatting (remains same) ──

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

const SubEventRow = memo(function SubEventRow({ ev, index }: { ev: RawEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { label, color } = getTypeInfo(ev.type);
  const summary = formatEventSummary(ev.type, ev.data);
  const isHistory = ev.type.startsWith("history:");
  const timeStr = ev.timestamp > 0
    ? new Date(ev.timestamp).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions)
    : null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = JSON.stringify(ev, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="group/sub">
      <div
        className="flex items-baseline gap-2 cursor-pointer hover:bg-white/5 rounded px-1 -mx-1 py-0.5"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] font-mono text-console-dim w-10 text-right shrink-0">
          {isHistory ? "" : ev.seq !== undefined ? (
            <span className="text-console-accent">#{ev.seq}</span>
          ) : timeStr ? (
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
        <div className="flex items-center gap-1.5 opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0">
          <button
            onClick={handleCopy}
            className="p-0.5 rounded hover:bg-white/10 text-console-dim hover:text-console-text transition-colors"
            title="Copy event"
          >
            {copied ? (
              <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            )}
          </button>
          <span className="text-[10px] text-console-dim">
            {expanded ? "▼" : "▶"}
          </span>
        </div>
      </div>
      {expanded && (
        <pre className="text-[11px] font-mono text-console-text/70 whitespace-pre-wrap overflow-x-auto
                        ml-7 pl-3 my-1 border-l-2 border-white/5 leading-relaxed max-h-60 overflow-y-auto">
          {JSON.stringify(
            {
              ...(ev.seq !== undefined ? { seq: ev.seq } : {}),
              ...(ev.messageId ? { message_id: ev.messageId } : {}),
              data: ev.data,
            },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
});

// ── Role turn group ──

const TurnGroup = memo(function TurnGroup({ group, defaultOpen }: { group: EventGroup; defaultOpen?: boolean }) {
  const [expanded, setExpanded] = useState(defaultOpen ?? true);
  const isUser = group.role === "user";

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
});

// ── Main component ──

export function EventStream({ events }: { events: RawEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  
  // Internal throttled events state to batch high-frequency updates at 60fps
  const [displayEvents, setDisplayEvents] = useState(events);
  const rafRef = useRef<number | null>(null);

  const handleCopyAll = () => {
    const text = JSON.stringify(events, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    // Sync state update with the next animation frame (60fps)
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    
    rafRef.current = requestAnimationFrame(() => {
      setDisplayEvents(events);
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [events]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      // Instant scroll is much cheaper than smooth scroll for high frequency updates
      bottomRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [displayEvents, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const { historyGroups, streamGroups, historyCount, streamCount } = useMemo(() => {
    const hCount = displayEvents.filter((e) => e.type.startsWith("history:")).length;
    const sCount = displayEvents.length - hCount;
    const hGroups = hCount > 0 ? groupEventsByRole(displayEvents.slice(0, hCount)) : [];
    const sGroups = sCount > 0 ? groupEventsByRole(displayEvents.slice(hCount)) : [];
    
    return {
      historyGroups: hGroups,
      streamGroups: sGroups,
      historyCount: hCount,
      streamCount: sCount
    };
  }, [displayEvents]);

  return (
    <div className="h-full flex flex-col bg-console-bg">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-console-dim tracking-wide uppercase">
            Events
          </span>
          <button
            onClick={handleCopyAll}
            className="text-[10px] text-console-dim hover:text-console-text transition-colors flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded"
          >
            {copied ? (
              <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            )}
            {copied ? "Copied" : "Copy All"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {historyCount > 0 && (
            <span className="text-[10px] font-mono text-console-dim bg-white/5 px-2 py-0.5 rounded-full">
              {historyCount} history
            </span>
          )}
          <span className="text-[10px] font-mono text-console-dim bg-white/5 px-2 py-0.5 rounded-full">
            {streamCount > 0 ? `${streamCount} stream` : displayEvents.length}
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
