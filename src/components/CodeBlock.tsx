import { useState, useEffect, useCallback } from "react";
import type { Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((mod) =>
      mod.createHighlighter({
        themes: ["github-dark"],
        langs: ["javascript", "typescript", "python", "bash", "json", "html", "css", "go", "rust", "sql", "yaml", "markdown"],
      })
    );
  }
  return highlighterPromise;
}

export function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const lang = language || "text";

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then((hl) => {
      if (cancelled) return;
      try {
        const result = hl.codeToHtml(children, { lang, theme: "github-dark" });
        setHtml(result);
      } catch {
        setHtml(null);
      }
    });
    return () => { cancelled = true; };
  }, [children, lang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [children]);

  return (
    <div className="group/code relative my-2 rounded-xl overflow-hidden bg-console-bg">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/5">
        <span className="text-[10px] text-console-dim font-mono">{lang}</span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-console-dim hover:text-console-text opacity-0 group-hover/code:opacity-100
                     transition-opacity flex items-center gap-1"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      {html ? (
        <div
          className="p-4 overflow-x-auto text-[13px] leading-[1.5] [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="p-4 overflow-x-auto text-[13px] leading-[1.5] text-console-text font-mono">
          <code>{children}</code>
        </pre>
      )}
    </div>
  );
}
