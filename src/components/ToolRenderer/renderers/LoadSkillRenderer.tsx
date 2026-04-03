import type { ToolRenderProps } from "../registry";

export function LoadSkillRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const skillName = String(toolInput.skill_name ?? toolInput.skillName ?? "");
  const reference = toolInput.reference as string | undefined;

  const isError = typeof toolResult === "object" && toolResult !== null
    ? String(toolResult).includes("not found")
    : false;
  const resultText = toolResult ? String(Object.values(toolResult)[0] ?? JSON.stringify(toolResult)) : "";
  const contentLength = resultText.length;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded-md bg-violet-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight">Load Skill</span>
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Loading...</span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <code className="text-xs font-mono bg-violet-50 text-violet-700 px-2 py-0.5 rounded-md">
          {skillName}
        </code>
        {reference && (
          <>
            <span className="text-text-tertiary text-[10px]">/</span>
            <code className="text-xs font-mono bg-surface-hover text-text-secondary px-2 py-0.5 rounded-md">
              {reference}
            </code>
          </>
        )}
      </div>

      {toolResult && (
        <div className="mt-2">
          {isError ? (
            <p className="text-xs text-error">{resultText}</p>
          ) : (
            <p className="text-[11px] text-text-tertiary">
              Loaded {contentLength.toLocaleString()} chars
            </p>
          )}
        </div>
      )}
    </div>
  );
}

