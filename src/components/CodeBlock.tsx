import { useState, useEffect, useCallback } from "react";
import type { Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

async function getHighlighterWithLang(lang: string): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((mod) =>
      mod.createHighlighter({ themes: ["github-dark"], langs: [] })
    );
  }
  const hl = await highlighterPromise;
  if (lang && lang !== "text" && !loadedLangs.has(lang)) {
    try {
      await hl.loadLanguage(lang as Parameters<Highlighter["loadLanguage"]>[0]);
      loadedLangs.add(lang);
    } catch {
      // Unknown language — will fallback to plain text
    }
  }
  return hl;
}

const LANG_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  bash: "Bash",
  shell: "Shell",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  go: "Go",
  rust: "Rust",
  sql: "SQL",
  yaml: "YAML",
  markdown: "Markdown",
  jsx: "JSX",
  tsx: "TSX",
};

export function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const lang = language || "text";
  const isHtml = (lang === "html" || lang === "svg") && children.length > 200;

  useEffect(() => {
    let cancelled = false;
    getHighlighterWithLang(lang).then((hl) => {
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
    <div className="group/code relative my-3 rounded-xl overflow-hidden bg-[#1a1b26] shadow-md">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03]">
        {isHtml ? (
          <div className="flex items-center gap-0.5 bg-white/5 rounded-md p-0.5">
            <button
              onClick={() => setTab("preview")}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded transition-colors ${
                tab === "preview"
                  ? "text-white/80 bg-white/10"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setTab("code")}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded transition-colors ${
                tab === "code"
                  ? "text-white/80 bg-white/10"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              Code
            </button>
          </div>
        ) : (
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
            {LANG_LABELS[lang] ?? lang}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-[10px] text-white/30 hover:text-white/60
                       transition-colors flex items-center gap-1"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Copied!
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
      </div>

      {isHtml && tab === "preview" ? (
        <iframe
          srcDoc={children}
          sandbox="allow-scripts"
          className="w-full border-0 bg-white"
          style={{ height: "60vh" }}
        />
      ) : (
        <div className="overflow-auto" style={isHtml ? { maxHeight: "60vh" } : undefined}>
          {html ? (
            <div
              className="px-4 py-3 text-[13px] leading-[1.6] [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <pre className="px-4 py-3 text-[13px] leading-[1.6] text-[#d4d4d4] font-mono">
              <code>{children}</code>
            </pre>
          )}
        </div>
      )}

    </div>
  );
}
