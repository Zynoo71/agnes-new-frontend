import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { agentClient } from "@/grpc/client";
import {
  useChatSelectedSkillsStore,
  type ChatSkillSelection,
} from "@/stores/chatSelectedSkillsStore";
import {
  hydrateConversationSkillsFromServer,
  persistConversationSkillSelections,
} from "@/lib/conversationSkillSync";
import { useMySkillsStore } from "@/stores/mySkillsStore";
import { create } from "@bufbuild/protobuf";
import {
  SkillInfoSchema,
  type SkillInfo,
  type SkillVersionInfo,
} from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const EMPTY_SELECTED: ChatSkillSelection[] = [];
const MAX_SELECTED = 3;

/** 会话已选但不在「我的 Skills」列表里时，用 store 快照拼一张卡片（仍可调 listSkillVersions）。 */
function skillInfoFromSessionSelection(sel: ChatSkillSelection): SkillInfo {
  const v = sel.version?.trim() || "";
  return create(SkillInfoSchema, {
    id: sel.skillId,
    appId: "",
    ownerUserId: "",
    source: "session",
    sourceRef: "",
    name: sel.name?.trim() || sel.skillId,
    skillType: "guide",
    summary: sel.summary?.trim() || "",
    latestVersion: v,
    latestPublishedVersion: v,
    likeCount: 0n,
    marketVisible: false,
    marketApprovalStatus: "none",
    marketDelisted: false,
    createdAt: 0n,
    updatedAt: 0n,
    isInMine: false,
    isOwner: false,
    mineRelation: "",
    mineAddedAt: 0n,
  });
}

// 模块级缓存：避免 Modal 每次开关都重拉同一个 skill 的 version 列表。
// 弹窗关闭后保留，下次打开瞬时呈现；若上游真的有变更（比如用户在 AgnesHub
// 发布了新版本），等下次手动刷新页面也能接受。
const versionCache = new Map<
  string,
  { versions: SkillVersionInfo[]; latestPublishedVersion: string; latestVersion: string }
>();

interface ChatSkillsPickerProps {
  conversationId: string | null;
  disabled?: boolean;
}

/**
 * 对话框输入区 agent tab 旁的 Skills 选择入口（任意 agent 类型均显示）。
 *
 * - Trigger：pill 按钮；有选用时高亮，右上角角标为已选数量。
 * - 弹窗：顶部汇总当前会话已选（名称 + 版本）；下方为「我的 Skills」网格，卡片上回显勾选状态与版本。
 * - 最多同时选 3 个；超出后未选卡片的 Add 按钮 disable。
 *
 * conversationId 为空（新对话尚未创建）时按钮 disable。
 */
export function ChatSkillsPicker({ conversationId, disabled }: ChatSkillsPickerProps) {
  const [open, setOpen] = useState(false);

  const selected = useChatSelectedSkillsStore((s) =>
    conversationId
      ? s.byConv[conversationId] ?? EMPTY_SELECTED
      : EMPTY_SELECTED,
  );

  const triggerDisabled = !!disabled || !conversationId;
  const selectedCount = selected.length;

  return (
    <>
      <button
        onClick={() => !triggerDisabled && setOpen(true)}
        disabled={triggerDisabled}
        className={`relative px-2.5 py-1 text-xs font-medium rounded-full transition-all
                    inline-flex items-center gap-1 ${
                      triggerDisabled
                        ? "text-text-tertiary/40 cursor-not-allowed"
                        : selectedCount > 0
                          ? "bg-accent/10 text-accent"
                          : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
                    }`}
        title={
          triggerDisabled
            ? "Start a conversation first"
            : selectedCount > 0
              ? `${selectedCount} skill${selectedCount === 1 ? "" : "s"} selected`
              : "Select skills for this conversation"
        }
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
          />
        </svg>
        <span>Skills</span>
        {selectedCount > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full
                           bg-accent text-white text-[10px] font-semibold leading-none">
            {selectedCount}
          </span>
        )}
      </button>

      {open && conversationId && (
        <SkillsPickerModal
          conversationId={conversationId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface ModalProps {
  conversationId: string;
  onClose: () => void;
}

const REMOVE_SKILL_CONFIRM =
  "取消注入当前 skill；历史回复仍可能影响风格，要彻底换风格请新开对话。";
const MULTI_SKILL_DONE_CONFIRM =
  "所选 skill 将在会话中被注入，多个 skill 可能存在优先级冲突。";

type PickerConfirm =
  | null
  | { type: "remove"; skillId: string }
  | { type: "multi-done" };

function SkillPickerConfirmDialog({
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "确认",
  danger,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 border-0 cursor-default"
        aria-label="关闭"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-picker-confirm-title"
        className="relative w-full max-w-md rounded-2xl border border-border-light bg-surface shadow-xl"
      >
        <div className="px-6 pt-5 pb-1">
          <h4 id="skill-picker-confirm-title" className="text-base font-semibold text-text-primary">
            {title}
          </h4>
        </div>
        <p className="px-6 pb-4 text-sm text-text-secondary leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-light">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-text-secondary
                       hover:bg-surface-hover transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillsPickerModal({ conversationId, onClose }: ModalProps) {
  const [keyword, setKeyword] = useState("");
  const [savingDone, setSavingDone] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<PickerConfirm>(null);

  const selected = useChatSelectedSkillsStore(
    (s) => s.byConv[conversationId] ?? EMPTY_SELECTED,
  );
  const addSelected = useChatSelectedSkillsStore((s) => s.add);
  const removeSelected = useChatSelectedSkillsStore((s) => s.remove);
  const setVersionStore = useChatSelectedSkillsStore((s) => s.setVersion);

  const { items: mySkills, loaded, loading, load } = useMySkillsStore(
    useShallow((s) => ({
      items: s.items,
      loaded: s.loaded,
      loading: s.loading,
      load: s.load,
    })),
  );

  // 打开 modal 时刷新会话选用（含 history 展示字段），并加载「我的 Skills」
  useEffect(() => {
    void hydrateConversationSkillsFromServer(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!loaded && !loading) {
      void load({ page: 1, pageSize: 100 });
    }
  }, [loaded, loading, load]);

  // ESC：先关确认框，再关选择器
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmDialog) {
        setConfirmDialog(null);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirmDialog]);

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.skillId)),
    [selected],
  );
  const reachedMax = selected.length >= MAX_SELECTED;

  /** 网格：我的 Skills ∪ 会话已选但不在我的列表中的项（便于回显版本与选中态） */
  const mergedGridSkills = useMemo(() => {
    const byId = new Map(mySkills.map((s) => [s.id, s] as const));
    const extras: SkillInfo[] = [];
    for (const s of selected) {
      if (!byId.has(s.skillId)) {
        extras.push(skillInfoFromSessionSelection(s));
      }
    }
    return [...mySkills, ...extras];
  }, [mySkills, selected]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return mergedGridSkills;
    return mergedGridSkills.filter(
      (it) =>
        it.name.toLowerCase().includes(k) ||
        (it.summary || "").toLowerCase().includes(k),
    );
  }, [mergedGridSkills, keyword]);

  const handleToggle = (it: SkillInfo) => {
    if (selectedIds.has(it.id)) {
      setConfirmDialog({ type: "remove", skillId: it.id });
      return;
    }
    if (reachedMax) return;
    const version = it.latestPublishedVersion || it.latestVersion || "";
    addSelected(conversationId, {
      skillId: it.id,
      version,
      name: it.name,
      summary: it.summary,
    });
  };

  const handleVersionChange = (skillId: string, version: string) => {
    setVersionStore(conversationId, skillId, version);
  };

  const completeDone = async () => {
    setSavingDone(true);
    try {
      await persistConversationSkillSelections(conversationId);
      onClose();
    } catch (e) {
      console.error("[ChatSkillsPicker] setConversationSkillSelections", e);
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingDone(false);
    }
  };

  const handleDone = () => {
    if (selected.length >= 2) {
      setConfirmDialog({ type: "multi-done" });
      return;
    }
    void completeDone();
  };

  const confirmRemoveSkill = () => {
    if (confirmDialog?.type !== "remove") return;
    const sid = confirmDialog.skillId;
    setConfirmDialog(null);
    removeSelected(conversationId, sid);
    void persistConversationSkillSelections(conversationId).catch((e) => {
      console.error("[ChatSkillsPicker] persist after remove failed", e);
      window.alert(e instanceof Error ? e.message : String(e));
    });
  };

  const confirmMultiDone = () => {
    if (confirmDialog?.type !== "multi-done") return;
    setConfirmDialog(null);
    void completeDone();
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !confirmDialog && onClose()}
      />
      <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-4xl mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-border-light flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-semibold text-text-primary">Select Skills</h3>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                  reachedMax
                    ? "bg-accent/10 text-accent"
                    : "bg-text-tertiary/15 text-text-secondary"
                }`}
              >
                {selected.length} / {MAX_SELECTED} selected
              </span>
            </div>
            <p className="text-xs text-text-tertiary leading-relaxed">
              Selected skills' SKILL.md will be injected into the system prompt.
              References and examples are loaded on demand.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary p-1"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 当前会话选用汇总（含从后端拉取、可能不在「我的 Skills」列表里的项） */}
        {selected.length > 0 && (
          <div className="px-6 py-3 border-b border-border-light bg-accent/[0.06]">
            <p className="text-[11px] font-semibold text-text-secondary mb-2">当前会话已选</p>
            <ul className="space-y-2">
              {selected.map((s) => (
                <li
                  key={s.skillId}
                  className="flex items-start justify-between gap-3 text-xs"
                >
                  <span className="text-text-primary font-medium min-w-0 break-words">
                    {s.name?.trim() || s.skillId}
                  </span>
                  <span
                    className="shrink-0 font-mono text-[11px] text-text-tertiary tabular-nums"
                    title="Version"
                  >
                    {s.version?.trim() || "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Search */}
        <div className="px-6 py-3 border-b border-border-light">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search my skills..."
              className="pl-8 pr-8 py-1.5 text-sm border border-border rounded-lg bg-surface w-full
                         focus:outline-none focus:border-accent transition-colors"
            />
            {keyword && (
              <button
                onClick={() => setKeyword("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                title="Clear"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && mergedGridSkills.length === 0 ? (
            <div className="text-sm text-text-tertiary text-center py-12">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-text-tertiary text-center py-12">
              {mergedGridSkills.length === 0
                ? "No skills in My Skills yet — add some from AgnesHub first."
                : "No skills match your search."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((skill) => {
                const isSelected = selectedIds.has(skill.id);
                const sel = selected.find((s) => s.skillId === skill.id);
                return (
                  <PickerSkillCard
                    key={skill.id}
                    skill={skill}
                    isSelected={isSelected}
                    selectedVersion={sel?.version || ""}
                    addDisabled={!isSelected && reachedMax}
                    onToggle={() => handleToggle(skill)}
                    onVersionChange={(v) => handleVersionChange(skill.id, v)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border-light flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">
            {reachedMax
              ? `Limit reached — remove one to swap.`
              : `You can add up to ${MAX_SELECTED} skills per conversation.`}
          </span>
          <button
            type="button"
            onClick={() => void handleDone()}
            disabled={savingDone}
            className="px-3 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                       hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingDone ? "Saving…" : "Done"}
          </button>
        </div>
      </div>
    </div>

    {confirmDialog?.type === "remove" && (
      <SkillPickerConfirmDialog
        title="移除 Skill"
        message={REMOVE_SKILL_CONFIRM}
        danger
        confirmLabel="移除"
        onCancel={() => setConfirmDialog(null)}
        onConfirm={confirmRemoveSkill}
      />
    )}
    {confirmDialog?.type === "multi-done" && (
      <SkillPickerConfirmDialog
        title="多个 Skill"
        message={MULTI_SKILL_DONE_CONFIRM}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={confirmMultiDone}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps {
  skill: SkillInfo;
  isSelected: boolean;
  selectedVersion: string;
  addDisabled: boolean;
  onToggle: () => void;
  onVersionChange: (version: string) => void;
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    agnes: { label: "Official", cls: "bg-accent/10 text-accent" },
    github: { label: "GitHub", cls: "bg-text-tertiary/15 text-text-secondary" },
    user: { label: "Community", cls: "bg-text-tertiary/15 text-text-secondary" },
    session: { label: "会话已选", cls: "bg-text-tertiary/15 text-text-secondary" },
  };
  const v = map[source] ?? { label: source || "Unknown", cls: "bg-text-tertiary/15 text-text-secondary" };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${v.cls}`}>{v.label}</span>;
}

function PickerSkillCard({
  skill,
  isSelected,
  selectedVersion,
  addDisabled,
  onToggle,
  onVersionChange,
}: CardProps) {
  const [versions, setVersions] = useState<SkillVersionInfo[] | null>(
    () => versionCache.get(skill.id)?.versions ?? null,
  );
  const [versionsError, setVersionsError] = useState("");
  const [loadingVersions, setLoadingVersions] = useState(false);
  // 控制是否「展开版本选择」—— 默认不展开（卡片更整洁），点 chevron 展开后才拉版本列表
  const [showVersions, setShowVersions] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!showVersions) return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    const cached = versionCache.get(skill.id);
    if (cached) {
      setVersions(cached.versions);
      return;
    }

    let cancelled = false;
    setLoadingVersions(true);
    setVersionsError("");
    agentClient
      .listSkillVersions({ skillId: skill.id })
      .then((resp) => {
        if (cancelled) return;
        versionCache.set(skill.id, {
          versions: resp.versions,
          latestPublishedVersion: resp.latestPublishedVersion,
          latestVersion: resp.latestVersion,
        });
        setVersions(resp.versions);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setVersionsError(msg.replace(/^\[\w+\]\s*/, ""));
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showVersions, skill.id]);

  // 当前显示版本：优先 store 内的选中 version，未选时 fallback 到 latestPublished/latestVersion
  const displayVersion =
    selectedVersion ||
    skill.latestPublishedVersion ||
    skill.latestVersion ||
    "";

  return (
    <div
      className={`rounded-xl border transition-all bg-surface flex flex-col gap-2 p-3 ${
        isSelected
          ? "border-accent/60 shadow-sm bg-accent/[0.03]"
          : "border-border hover:border-accent/40"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-text-primary truncate">
              {skill.name}
            </span>
            <SourceBadge source={skill.source} />
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {skill.likeCount.toString()} uses
            {displayVersion && ` · ${displayVersion}`}
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={addDisabled}
          className={`shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
            isSelected
              ? "bg-accent text-white hover:bg-accent-hover"
              : addDisabled
                ? "border border-border text-text-tertiary/50 cursor-not-allowed"
                : "border border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
          }`}
          title={
            isSelected
              ? "Remove from selection"
              : addDisabled
                ? `Up to ${MAX_SELECTED} skills`
                : "Add to conversation"
          }
        >
          {isSelected ? "Selected" : addDisabled ? "Limit" : "+ Add"}
        </button>
      </div>

      <div className="text-xs text-text-tertiary line-clamp-2 leading-relaxed min-h-[2.4em]">
        {skill.summary || "No description"}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-light">
        <button
          onClick={() => setShowVersions((v) => !v)}
          className="text-[11px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1
                     transition-colors"
          title="Choose a different version"
        >
          <svg
            className={`w-3 h-3 transition-transform ${showVersions ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <span>Version</span>
        </button>
        {showVersions ? (
          loadingVersions && !versions ? (
            <span className="text-[10px] text-text-tertiary">Loading...</span>
          ) : versionsError ? (
            <span className="text-[10px] text-red-500" title={versionsError}>
              Load failed
            </span>
          ) : versions && versions.length > 0 ? (
            <select
              value={displayVersion}
              onChange={(e) => onVersionChange(e.target.value)}
              disabled={!isSelected}
              className="text-[11px] border border-border rounded px-1.5 py-0.5 bg-surface
                         text-text-secondary focus:outline-none focus:border-accent
                         disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer max-w-[140px]"
              title={
                isSelected
                  ? "Switch version"
                  : "Add this skill first to choose a version"
              }
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                  {v.isPublished ? " · published" : v.isDraft ? " · draft" : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[10px] text-text-tertiary">No versions</span>
          )
        ) : (
          <span className="font-mono text-[11px] text-text-tertiary">
            {displayVersion || "—"}
          </span>
        )}
      </div>
    </div>
  );
}
