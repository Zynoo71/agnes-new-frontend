import { useState, useEffect, useRef } from "react";

interface Props {
  selectedAlias: string;
  onChange: (alias: string) => void;
  disabled: boolean;
}

interface Option {
  label: string;
  alias: string;
}

const MODEL_OPTIONS: Option[] = [
  { label: "Auto（默认）", alias: "" },
  { label: "DeepSeek V4 Flash", alias: "deepseek-v4-flash" },
  { label: "Agnes 1.5 Flash", alias: "agnes-1.5-flash" },
  { label: "Gemini 3 Flash", alias: "gemini-3-flash" },
  { label: "Claude Opus 4.6", alias: "claude-opus-4-6" },
];

function labelFor(alias: string): string {
  return MODEL_OPTIONS.find((o) => o.alias === alias)?.label ?? "Auto（默认）";
}

export function ModelSelector({ selectedAlias, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isAuto = selectedAlias === "";

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all max-w-[180px]
          ${disabled
            ? "cursor-default opacity-70"
            : "cursor-pointer hover:bg-surface-hover"
          }
          ${!isAuto
            ? "text-accent font-medium"
            : "text-text-tertiary"
          }`}
      >
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
        <span className="truncate">{labelFor(selectedAlias)}</span>
        {!disabled && (
          <svg className="w-2.5 h-2.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>

      {open && !disabled && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-surface border border-border
                        rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto">
          {MODEL_OPTIONS.map((o) => (
            <button
              key={o.alias || "__auto__"}
              onClick={() => { onChange(o.alias); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors
                ${o.alias === selectedAlias ? "text-accent bg-accent/5" : "text-text-secondary hover:bg-surface-hover"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
