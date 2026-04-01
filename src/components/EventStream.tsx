import { useEffect, useRef } from "react";
import type { RawEvent } from "@/stores/conversationStore";

export function EventStream({ events }: { events: RawEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  return (
    <div className="h-full flex flex-col bg-console-bg">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <span className="text-xs font-medium text-console-dim tracking-wide uppercase">
          Events
        </span>
        <span className="text-[10px] font-mono text-console-dim bg-white/5 px-2 py-0.5 rounded-full">
          {events.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {events.map((ev, i) => (
          <div key={i} className="group">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[10px] font-mono text-console-dim">
                {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions)}
              </span>
              <span className="text-xs font-semibold text-console-accent">{ev.type}</span>
            </div>
            <pre className="text-[11px] font-mono text-console-text/70 whitespace-pre-wrap overflow-x-auto
                            pl-3 border-l-2 border-white/5 group-hover:border-console-accent/30 transition-colors leading-relaxed">
              {JSON.stringify(ev.data, null, 2)}
            </pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
