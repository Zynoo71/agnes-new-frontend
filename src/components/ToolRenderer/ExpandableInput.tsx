import { useState, useCallback } from "react";

interface ExpandableInputProps {
  value: string;
  variant?: "console" | "text";
  maxCollapsedLines?: number;
  className?: string;
}

export function ExpandableInput({
  value,
  variant = "console",
  maxCollapsedLines = 1,
  className = "",
}: ExpandableInputProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const lines = value.split("\n");
  const isMultiLine = lines.length > maxCollapsedLines;
  const isLongSingleLine = value.length > 80;
  const needsExpansion = isMultiLine || isLongSingleLine;

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }, [value]);

  const toggleExpand = (e: React.MouseEvent) => {
    if (needsExpansion) {
      e.stopPropagation();
      setIsExpanded(!isExpanded);
    }
  };

  const isConsole = variant === "console";

  return (
    <div className={`relative group/input ${className}`}>
      <div
        onClick={toggleExpand}
        className={`
          relative transition-all duration-200 cursor-default
          ${needsExpansion ? "cursor-pointer hover:opacity-80" : ""}
          ${isExpanded ? "whitespace-pre-wrap break-all" : "truncate whitespace-nowrap"}
          ${isConsole 
            ? "font-mono text-[11px] bg-console-bg text-console-text rounded-lg px-2.5 py-1.5" 
            : "text-[11px] text-text-secondary"}
        `}
        style={{
          maxHeight: isExpanded ? "400px" : "none",
          overflowY: isExpanded ? "auto" : "hidden",
        }}
      >
        {isConsole ? value : `\u201C${value}\u201D`}
        
        {/* Shadow overlay for truncated text when collapsed */}
        {needsExpansion && !isExpanded && (
          <div className={`absolute right-8 inset-y-0 w-8 bg-gradient-to-l pointer-events-none 
            ${isConsole ? "from-console-bg to-transparent" : "from-surface-alt to-transparent"}`} 
          />
        )}
      </div>

      {/* Action Buttons */}
      <div className={`absolute right-1 top-1 flex items-center gap-1 opacity-0 group-hover/input:opacity-100 transition-opacity
        ${isConsole ? "text-console-dim hover:text-console-text" : "text-text-tertiary hover:text-text-secondary"}`}>
        {needsExpansion && (
          <button
            onClick={toggleExpand}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        )}
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Copy"
        >
          {isCopied ? (
            <svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
