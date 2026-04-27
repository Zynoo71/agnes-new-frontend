import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { agentClient } from "@/grpc/client";
import { useSkillSourcesStore } from "@/stores/skillSourcesStore";
import { useMarketSkillsStore } from "@/stores/marketSkillsStore";
import { useMySkillsStore } from "@/stores/mySkillsStore";

const SOURCE_ICON: Record<string, string> = {
  github: "github",
  gitee: "gitee",
  link: "link",
};

function SourceIcon({ kind }: { kind: string }) {
  if (kind === "github") {
    return (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    );
  }
  if (kind === "gitee") {
    return (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.795 1.778-1.777v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { items: sources, loaded, loading, load } = useSkillSourcesStore(
    useShallow((s) => ({ items: s.items, loaded: s.loaded, loading: s.loading, load: s.load })),
  );
  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const [selectedCode, setSelectedCode] = useState<string>("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  /** 应用内提示层（非浏览器 alert / window.open） */
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string>("");

  // 默认选第一个 enabled 来源
  useEffect(() => {
    if (selectedCode || !sources.length) return;
    const firstEnabled = sources.find((s) => s.enabled);
    if (firstEnabled) setSelectedCode(firstEnabled.code);
  }, [sources, selectedCode]);

  useEffect(() => {
    if (!errorDialog) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        setErrorDialog(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [errorDialog]);

  const selected = sources.find((s) => s.code === selectedCode);
  const canSubmit =
    !!selected && selected.enabled && url.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !selected) return;
    setErrorDialog(null);
    setOkMsg("");
    setSubmitting(true);
    try {
      if (selected.code !== "github") {
        setErrorDialog(
          `Importing from "${selected.name}" is not yet supported.`,
        );
        return;
      }
      const resp = await agentClient.importSkillFromGithub({ url: url.trim() });
      const skill = resp.skill;
      const needsApproval = resp.needsApproval;
      setOkMsg(
        needsApproval
          ? `Imported "${skill?.name}". Submitted for review — it will appear in the market once approved.`
          : `Imported "${skill?.name}" successfully.`,
      );
      // 刷新两个列表
      useMarketSkillsStore.getState().load({ page: 1 });
      useMySkillsStore.getState().invalidate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // grpc-web ConnectError 形如 "[invalid_argument] xxx"，截掉前缀更友好
      setErrorDialog(msg.replace(/^\[\w_]+\]\s*/i, ""));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !errorDialog && onClose()}
      />
      <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Import skill</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              Import a skill from a public source. SKILL.md required at the repo root.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 flex flex-col gap-5">
          <div>
            <div className="text-xs font-medium text-text-secondary mb-2">Source</div>
            {loading && !sources.length ? (
              <div className="text-sm text-text-tertiary">Loading sources...</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {sources.map((src) => {
                  const active = selectedCode === src.code;
                  const disabled = !src.enabled;
                  return (
                    <button
                      key={src.code}
                      onClick={() => !disabled && setSelectedCode(src.code)}
                      disabled={disabled}
                      title={disabled ? "Coming soon" : src.description || src.name}
                      className={`flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-lg border
                        transition-all
                        ${active
                          ? "border-accent bg-accent/5 text-accent"
                          : disabled
                            ? "border-border bg-surface text-text-tertiary opacity-50 cursor-not-allowed"
                            : "border-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary"
                        }`}
                    >
                      <SourceIcon kind={SOURCE_ICON[src.iconKey || src.code] || src.code} />
                      <span className="text-xs font-medium">{src.name}</span>
                      {disabled && (
                        <span className="text-[9px] uppercase tracking-wider text-text-tertiary">
                          Soon
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selected?.code === "github" && (
            <div>
              <div className="text-xs font-medium text-text-secondary mb-2">
                GitHub repository URL
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={submitting}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface
                           focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
              />
              <p className="text-[11px] text-text-tertiary mt-1.5 leading-relaxed">
                Public repos only for now. The repo root must contain a <code>SKILL.md</code> file.
                The first H1 in SKILL.md becomes the skill name.
              </p>
            </div>
          )}

          {okMsg && (
            <div className="text-xs text-green-700 bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2">
              {okMsg}
            </div>
          )}
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-2 border-t border-border-light">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-1.5 text-sm text-text-secondary border border-border rounded-lg
                       hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {okMsg ? "Done" : "Cancel"}
          </button>
          {!okMsg && (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || Boolean(errorDialog)}
              className="px-4 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                         hover:bg-accent-hover transition-colors disabled:opacity-50
                         flex items-center gap-1.5"
            >
              {submitting && (
                <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
              )}
              {submitting ? "Importing..." : "Import"}
            </button>
          )}
        </div>

        {errorDialog && (
          <div
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
            onClick={() => setErrorDialog(null)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="import-skill-error-title"
              className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h4
                id="import-skill-error-title"
                className="text-sm font-semibold text-text-primary"
              >
                Could not import
              </h4>
              <p className="mt-2.5 text-sm text-text-secondary leading-relaxed break-words">
                {errorDialog}
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="px-4 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                    hover:bg-accent-hover transition-colors"
                  onClick={() => setErrorDialog(null)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
