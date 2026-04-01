import type { RawEvent } from "@/stores/conversationStore";

export function EventStream({ events }: { events: RawEvent[] }) {
  return (
    <div className="h-full flex flex-col bg-surface border-l border-border">
      <div className="px-3 py-2 border-b border-border text-xs font-medium text-text-secondary">
        Raw Events ({events.length})
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {events.map((ev, i) => (
          <div key={i} className="text-xs font-mono">
            <span className="text-text-tertiary">
              {new Date(ev.timestamp).toLocaleTimeString()}
            </span>{" "}
            <span className="text-accent font-medium">{ev.type}</span>
            <pre className="ml-4 text-text-secondary whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(ev.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
