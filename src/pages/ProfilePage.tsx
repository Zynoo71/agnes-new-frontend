import { useState, useEffect } from "react";
import { useProfileStore } from "@/stores/profileStore";
import type { ProfileFactInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

type Field = "soul" | "identity";

const FIELD_CONFIG = {
  soul: {
    title: "Soul",
    description: "Behavioral preferences and communication style",
    placeholder: "e.g. Always reply in Chinese",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  identity: {
    title: "Identity",
    description: "Personal facts that help Agnes understand you",
    placeholder: "e.g. Works as a designer at a game studio",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
} as const;

function FactItem({
  fact,
  field,
}: {
  fact: ProfileFactInfo;
  field: Field;
}) {
  const { updateFact, removeFact } = useProfileStore();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(fact.content);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === fact.content || saving) return;
    setSaving(true);
    try {
      await updateFact(field, fact.id, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await removeFact(field, fact.id);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={3}
          className="w-full text-sm bg-transparent border-none resize-none focus:outline-none leading-relaxed"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={() => { setEditing(false); setEditContent(fact.content); }}
            className="px-3 py-1 text-xs text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!editContent.trim() || editContent.trim() === fact.content || saving}
            className="px-3 py-1 text-xs font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-xl px-3.5 py-2.5 hover:bg-surface-hover transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 text-sm text-text-primary leading-relaxed">{fact.content}</div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded-md text-text-tertiary hover:text-accent hover:bg-accent/10 transition-colors"
            title="Edit"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={handleDelete}
                disabled={saving}
                className="text-[10px] font-medium text-white bg-error px-2 py-0.5 rounded-md hover:bg-error/80 transition-colors disabled:opacity-50"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1 rounded-md text-text-tertiary hover:text-error hover:bg-error-light transition-colors"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddFactInput({ field }: { field: Field }) {
  const { createFact } = useProfileStore();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = content.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await createFact(field, trimmed);
      setContent("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5">
      <svg className="w-3.5 h-3.5 text-text-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd(); }}
        placeholder={FIELD_CONFIG[field].placeholder}
        className="flex-1 text-sm bg-transparent border-none focus:outline-none placeholder:text-text-tertiary/60"
      />
      {content.trim() && (
        <button
          onClick={handleAdd}
          disabled={saving}
          className="text-xs font-medium text-accent hover:text-accent-hover transition-colors disabled:opacity-50 shrink-0"
        >
          {saving ? "..." : "Add"}
        </button>
      )}
    </div>
  );
}

function FieldColumn({ field }: { field: Field }) {
  const facts = useProfileStore((s) => s[field]);
  const config = FIELD_CONFIG[field];

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-accent">{config.icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{config.title}</h3>
          <p className="text-[11px] text-text-tertiary">{config.description}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="p-1.5 space-y-0.5">
          {facts.length === 0 ? (
            <div className="px-3 py-6 text-xs text-text-tertiary text-center">
              No facts yet. Add one below.
            </div>
          ) : (
            facts.map((fact) => (
              <FactItem key={fact.id} fact={fact} field={field} />
            ))
          )}
        </div>
        <div className="border-t border-border-light">
          <AddFactInput field={field} />
        </div>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { loading, loaded, load } = useProfileStore();

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border-light bg-surface-alt">
        <h2 className="text-base font-semibold text-text-primary">Profile</h2>
        <p className="text-xs text-text-tertiary mt-0.5">Personalize how Agnes interacts with you.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && !loaded ? (
          <div className="text-sm text-text-tertiary text-center mt-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 gap-6 max-w-4xl">
            <FieldColumn field="soul" />
            <FieldColumn field="identity" />
          </div>
        )}
      </div>
    </div>
  );
}
