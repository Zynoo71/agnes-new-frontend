import { useState, useEffect } from "react";
import { useSystemPromptStore } from "@/stores/systemPromptStore";
import type { SystemPromptInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

function PromptModal({
  prompt,
  onClose,
}: {
  prompt: SystemPromptInfo | null; // null = create mode
  onClose: () => void;
}) {
  const { create, update, remove } = useSystemPromptStore();
  const [name, setName] = useState(prompt?.name ?? "");
  const [content, setContent] = useState(prompt?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = prompt !== null;
  const canSave = name.trim() && content.trim();

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEdit) {
        await update(prompt.id, { name: name.trim(), content: content.trim() });
      } else {
        await create(name.trim(), content.trim());
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || saving) return;
    setSaving(true);
    try {
      await remove(prompt.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="px-6 pt-5 pb-3">
          <h3 className="text-base font-semibold text-text-primary">
            {isEdit ? "Edit Prompt" : "New Prompt"}
          </h3>
        </div>

        <div className="px-6 flex-1 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer Support Agent"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface
                         focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="You are a helpful assistant that..."
              rows={10}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface resize-y
                         focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <div className="px-6 py-4 flex items-center gap-3 border-t border-border-light">
          {isEdit && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-error font-medium">Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="text-xs font-medium text-white bg-error px-3 py-1 rounded-lg hover:bg-error/80 transition-colors disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-text-tertiary hover:text-error transition-colors"
              >
                Delete
              </button>
            )
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-text-secondary border border-border rounded-lg
                         hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="px-4 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                         hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PromptManagementPage() {
  const { prompts, loading, load } = useSystemPromptStore();
  const [modalPrompt, setModalPrompt] = useState<SystemPromptInfo | null | undefined>(undefined);
  // undefined = modal closed, null = create mode, SystemPromptInfo = edit mode

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-alt">
        <h2 className="text-base font-semibold text-text-primary">System Prompts</h2>
        <button
          onClick={() => setModalPrompt(null)}
          className="px-4 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                     hover:bg-accent-hover active:scale-[0.98] transition-all"
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && prompts.length === 0 ? (
          <div className="text-sm text-text-tertiary text-center mt-12">Loading...</div>
        ) : prompts.length === 0 ? (
          <div className="text-center mt-12">
            <p className="text-sm text-text-tertiary">No system prompts yet.</p>
            <p className="text-xs text-text-tertiary mt-1">Create one to customize how Agnes responds.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            {prompts.map((p) => (
              <button
                key={String(p.id)}
                onClick={() => setModalPrompt(p)}
                className="text-left p-4 border border-border rounded-xl hover:border-accent/40
                           hover:shadow-sm transition-all bg-surface"
              >
                <div className="text-sm font-semibold text-text-primary mb-1 truncate">{p.name}</div>
                <div className="text-xs text-text-tertiary line-clamp-2 leading-relaxed">{p.content}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {modalPrompt !== undefined && (
        <PromptModal prompt={modalPrompt} onClose={() => setModalPrompt(undefined)} />
      )}
    </div>
  );
}
