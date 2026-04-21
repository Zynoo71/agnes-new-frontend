import type { ReactNode } from "react";
import type { SheetPlanData, SheetPlanDimension } from "@/stores/conversationStore";

const STATUS_ICON: Record<SheetPlanDimension["status"], { node: ReactNode; label: string; color: string }> = {
  done: {
    node: (
      <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
    ),
    label: "done",
    color: "text-emerald-600",
  },
  running: {
    node: (
      <svg className="w-4 h-4 text-amber-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    ),
    label: "running",
    color: "text-amber-600",
  },
  failed: {
    node: (
      <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
      </svg>
    ),
    label: "failed",
    color: "text-red-600",
  },
  aborted: {
    node: (
      <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.05 5.05a7 7 0 119.9 9.9 7 7 0 01-9.9-9.9zm1.06 1.06A5.5 5.5 0 0014 14L6.11 6.11z" clipRule="evenodd" />
      </svg>
    ),
    label: "aborted",
    color: "text-gray-500",
  },
  pending: {
    node: <div className="w-4 h-4 rounded-full border-2 border-border shrink-0" />,
    label: "pending",
    color: "text-text-tertiary",
  },
};

const ROLE_BADGE: Record<string, string> = {
  analyst:       "bg-sky-100 text-sky-700",
  data_engineer: "bg-amber-100 text-amber-700",
  reporter:      "bg-emerald-100 text-emerald-700",
  repair:        "bg-rose-100 text-rose-700",
};

export function SheetPlanPanel({ data }: { data: SheetPlanData }) {
  if (data.dimensions.length === 0) return null;

  const total = data.dimensions.length;
  const done = data.dimensions.filter((d) => d.status === "done").length;
  const failed = data.dimensions.filter((d) => d.status === "failed" || d.status === "aborted").length;
  const allDone = done === total;
  const progress = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="my-3 rounded-xl border border-border-light bg-surface-alt p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-base">🧭</span>
        <span className="text-xs font-semibold text-text-primary">Analysis Plan</span>
        {allDone ? (
          <span className="text-[10px] font-medium text-success bg-success-light/50 px-1.5 py-0.5 rounded-full">
            All done
          </span>
        ) : (
          <span className="text-[11px] text-text-tertiary">
            {done}/{total} done{failed > 0 ? ` · ${failed} failed` : ""}
          </span>
        )}
      </div>

      <div className="mx-1 mb-2.5 h-1 rounded-full bg-border-light overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="px-1 space-y-1">
        {data.dimensions.map((d) => {
          const s = STATUS_ICON[d.status];
          return (
            <div key={d.id} className="flex items-center gap-2 py-0.5" title={d.error || undefined}>
              {s.node}
              <span
                className={`text-xs leading-relaxed flex-1 min-w-0 truncate ${
                  d.status === "done" ? "text-text-tertiary" : "text-text-primary"
                }`}
              >
                {d.title || d.id}
              </span>
              {d.role && (
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    ROLE_BADGE[d.role] ?? "bg-gray-100 text-gray-600"
                  } shrink-0`}
                >
                  {d.role}
                </span>
              )}
              <span className={`text-[10px] font-mono shrink-0 ${s.color}`}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
