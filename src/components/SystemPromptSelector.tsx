import { useState, useEffect, useRef } from "react";
import { useSystemPromptStore } from "@/stores/systemPromptStore";

interface Props {
  selectedId: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean; // true after first message sent
}

export function SystemPromptSelector({ selectedId, onChange, disabled }: Props) {
  const { prompts, loaded, load } = useSystemPromptStore();
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Close dropdown on outside click
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

  const selected = prompts.find((p) => String(p.id) === selectedId);

  if (prompts.length === 0 && loaded) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        onMouseEnter={() => disabled && selected && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all max-w-[180px]
          ${disabled
            ? "cursor-default opacity-70"
            : "cursor-pointer hover:bg-surface-hover"
          }
          ${selected
            ? "text-accent font-medium"
            : "text-text-tertiary"
          }`}
      >
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <span className="truncate">{selected ? selected.name : "Prompt"}</span>
        {!disabled && (
          <svg className="w-2.5 h-2.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>

      {/* Hover tooltip for frozen state */}
      {showTooltip && disabled && selected && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 p-3 bg-surface border border-border
                        rounded-xl shadow-lg text-xs text-text-secondary leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          <div className="font-medium text-text-primary mb-1">{selected.name}</div>
          {selected.content}
        </div>
      )}

      {/* Dropdown */}
      {open && !disabled && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-surface border border-border
                        rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto">
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs transition-colors
              ${!selectedId ? "text-accent bg-accent/5" : "text-text-secondary hover:bg-surface-hover"}`}
          >
            No prompt
          </button>
          {prompts.map((p) => (
            <button
              key={String(p.id)}
              onClick={() => { onChange(String(p.id)); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors
                ${String(p.id) === selectedId ? "text-accent bg-accent/5" : "text-text-secondary hover:bg-surface-hover"}`}
            >
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-text-tertiary truncate mt-0.5">{p.content.slice(0, 60)}...</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
