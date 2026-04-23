import { useState } from "react";
import { useUserStore } from "@/stores/userStore";

export function UserIdSetupModal() {
  const userId = useUserStore((s) => s.userId);
  const setUserId = useUserStore((s) => s.setUserId);
  const [value, setValue] = useState("");

  if (userId) return null;

  const trimmed = value.trim();
  const canSave = trimmed.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    setUserId(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[min(92vw,420px)] rounded-2xl border border-border bg-surface shadow-2xl p-6">
        <h2 className="text-base font-semibold text-text-primary">Set your user ID</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Used as <code className="px-1 rounded bg-surface-hover">x-user-id</code> on every request. Stored in this
          browser only — each person should pick their own.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSave();
          }}
          placeholder="e.g. agnes"
          className="mt-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
