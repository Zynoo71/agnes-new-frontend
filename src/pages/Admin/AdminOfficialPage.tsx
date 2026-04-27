import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useAdminOfficialStore } from "@/stores/adminOfficialStore";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";
import { agentClient } from "@/grpc/client";
import { Pagination } from "@/pages/AgnesHub/Pagination";
import { SkillDetailModal } from "@/pages/AgnesHub/SkillDetailModal";
import {
  SkillEditorModal,
  type SkillEditorApi,
  type SkillKind,
} from "@/pages/AgnesHub/SkillEditorModal";
import { AdminLayout } from "./AdminLayout";

const DEFAULT_APP_ID = (import.meta.env.VITE_APP_ID ?? "") as string;

function pickStatus(skill: SkillInfo): { text: string; cls: string } {
  const status = skill.marketApprovalStatus;
  if (skill.marketDelisted) {
    return { text: "Delisted", cls: "bg-text-tertiary/15 text-text-secondary" };
  }
  if (status === "pending") {
    return { text: "Pending", cls: "bg-amber-500/10 text-amber-600" };
  }
  if (status === "rejected") {
    return { text: "Rejected", cls: "bg-red-500/10 text-red-600" };
  }
  if (skill.latestPublishedVersion && skill.marketVisible) {
    return { text: "Published", cls: "bg-emerald-500/10 text-emerald-600" };
  }
  return { text: "Draft", cls: "bg-text-tertiary/15 text-text-secondary" };
}

function fmtDate(ms: bigint | number): string {
  const n = typeof ms === "bigint" ? Number(ms) : ms;
  if (!n) return "—";
  return new Date(n).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RowProps {
  skill: SkillInfo;
  busy: boolean;
  onOpenDetail: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onDelete: () => void;
}

function OfficialCard({ skill, busy, onOpenDetail, onEdit, onPublish, onDelete }: RowProps) {
  // Admin 自审 publish：草稿 / 已驳回 / 下架 / 「有更新但未发」都给入口；
  // 已 published 且没有新草稿（latest === latest_published）就隐藏 Publish。
  const hasNewDraft =
    !!skill.latestVersion &&
    !!skill.latestPublishedVersion &&
    skill.latestVersion !== skill.latestPublishedVersion;
  const canPublish =
    !skill.latestPublishedVersion ||
    skill.marketDelisted ||
    skill.marketApprovalStatus === "rejected" ||
    hasNewDraft;
  const status = pickStatus(skill);
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <button
      onClick={onOpenDetail}
      className="group text-left p-4 border border-border rounded-xl hover:border-accent/40
                 hover:shadow-sm transition-all bg-surface relative flex flex-col gap-2"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{skill.name}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent shrink-0">
              Official
            </span>
            {hasNewDraft && (
              <span
                className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0"
                title={`New draft ${skill.latestVersion} not yet published`}
              >
                draft
              </span>
            )}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5 truncate">
            {skill.likeCount.toString()} uses
            {skill.latestPublishedVersion && ` · ${skill.latestPublishedVersion}`}
            {` · ${fmtDate(skill.updatedAt)}`}
          </div>
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${status.cls}`}>
          {status.text}
        </span>
      </div>
      <div className="text-xs text-text-tertiary line-clamp-2 leading-relaxed min-h-[2.5em]">
        {skill.summary || "No description"}
      </div>

      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100
                      transition-opacity flex items-center gap-1
                      bg-surface border border-border shadow-sm rounded-md p-0.5">
        <button
          onClick={stop(onEdit)}
          disabled={busy}
          title="Edit official skill files (creates a new draft version)"
          className="px-2 py-0.5 text-[11px] font-medium rounded
                     text-accent hover:bg-accent/10
                     disabled:opacity-30 transition-all"
        >
          Edit
        </button>
        {canPublish && (
          <button
            onClick={stop(onPublish)}
            disabled={busy}
            title="Self-approve and publish to market"
            className="px-2 py-0.5 text-[11px] font-medium rounded
                       text-white bg-emerald-600 hover:bg-emerald-700
                       disabled:opacity-50 transition-all"
          >
            {busy ? "…" : "Publish"}
          </button>
        )}
        <button
          onClick={stop(onDelete)}
          disabled={busy}
          title="Hard delete (DB + S3) — irreversible"
          className="px-2 py-0.5 text-[11px] font-medium rounded
                     text-red-600 hover:bg-red-50
                     disabled:opacity-30 transition-all"
        >
          Delete
        </button>
      </div>
    </button>
  );
}

/**
 * 把 admin official store 的 CRUD 包装成 SkillEditorModal 需要的 SkillEditorApi
 * 形态。``adminCreateOfficialSkill`` 必须显式传 ``app_id``，本函数从外部捕获。
 */
function useAdminOfficialEditorApi(targetAppId: string): SkillEditorApi {
  const { busyId, create, update, publish } = useAdminOfficialStore(
    useShallow((s) => ({
      busyId: s.busyId,
      create: s.create,
      update: s.update,
      publish: s.publish,
    })),
  );
  return {
    loading: !!busyId,
    create: async (input) => {
      const skill = await create({
        appId: targetAppId,
        name: input.name,
        summary: input.summary,
        skillType: input.skillType,
        files: input.files,
      });
      return { name: skill.name };
    },
    update: async (input) => {
      const skill = await update(input);
      return { name: skill.name };
    },
    publish: async (skillId) => {
      const skill = await publish(skillId);
      return { needsApproval: false, skill: { name: skill.name } };
    },
    loadForEdit: async (skillId) => {
      const resp = await agentClient.adminGetOfficialSkillForEdit({ skillId });
      const sk = resp.skill;
      if (!sk) throw new Error("Official skill not found");
      const st = (sk.skillType || "guide").trim().toLowerCase();
      return {
        skill: {
          name: sk.name,
          summary: sk.summary,
          skillType: (st === "tool" ? "tool" : "guide") as SkillKind,
        },
        files: resp.files.map((f) => ({ path: f.path, content: f.content })),
      };
    },
  };
}

export function AdminOfficialPage() {
  const {
    items,
    total,
    page,
    pageSize,
    loading,
    loaded,
    keyword,
    busyId,
    load,
    publish,
    hardDelete,
    reload,
  } = useAdminOfficialStore(
    useShallow((s) => ({
      items: s.items,
      total: s.total,
      page: s.page,
      pageSize: s.pageSize,
      loading: s.loading,
      loaded: s.loaded,
      keyword: s.keyword,
      busyId: s.busyId,
      load: s.load,
      publish: s.publish,
      hardDelete: s.hardDelete,
      reload: s.reload,
    })),
  );

  const [searchInput, setSearchInput] = useState(keyword);
  const [activeSkill, setActiveSkill] = useState<SkillInfo | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createAppId, setCreateAppId] = useState<string>(DEFAULT_APP_ID);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 给 editor 注入的 api —— 用 active skill / create modal 的 app_id 做 target
  const targetAppId = editingSkill?.appId || createAppId || DEFAULT_APP_ID;
  const editorApi = useAdminOfficialEditorApi(targetAppId);

  // 切到本 tab 时强制刷新一次：避免编辑 / 发布 / 删除后看到旧快照。
  useEffect(() => {
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === keyword) return;
    const t = setTimeout(() => {
      load({ keyword: trimmed, page: 1 });
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, keyword, load]);

  const headerHint = useMemo(() => {
    if (!loaded) return "Loading…";
    return `${total} official skill${total === 1 ? "" : "s"}`;
  }, [total, loaded]);

  const onClickPublish = async (skill: SkillInfo) => {
    if (busyId) return;
    setErrMsg(null);
    try {
      await publish(skill.id);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const onClickDelete = async (skill: SkillInfo) => {
    if (busyId) return;
    const ok = window.confirm(
      `Hard delete official skill "${skill.name}"?\n` +
        `This is irreversible: DB rows + all S3 versions will be removed.`,
    );
    if (!ok) return;
    setErrMsg(null);
    try {
      await hardDelete(skill.id);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const onClickCreate = () => {
    setErrMsg(null);
    if (!DEFAULT_APP_ID) {
      // VITE_APP_ID 没配，弹个 prompt 让 admin 手填
      const v = window.prompt(
        "Enter the target app_id for this official skill (no default VITE_APP_ID configured):",
      );
      if (!v) return;
      setCreateAppId(v.trim());
    } else {
      setCreateAppId(DEFAULT_APP_ID);
    }
    setShowCreate(true);
  };

  const onCloseEditor = (didMutate: boolean) => {
    setEditingSkill(null);
    setShowCreate(false);
    if (didMutate) {
      // 列表可能变动 —— 重新拉
      void reload();
    }
  };

  return (
    <AdminLayout>
      <div className="px-8 py-6 max-w-7xl mx-auto flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Official Skills</h1>
            <p className="text-xs text-text-tertiary mt-1">
              {headerHint}
              <span className="ml-2 text-text-tertiary">
                · Source <span className="font-mono">agnes</span>; admin Publish self-approves
                and bypasses the review queue.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search official skills..."
              className="px-3 py-1.5 text-sm border border-border rounded-lg w-64
                         focus:outline-none focus:border-accent transition-colors"
            />
            <button
              onClick={onClickCreate}
              disabled={!!busyId}
              className="px-3 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                         hover:bg-accent-hover transition-colors disabled:opacity-50
                         flex items-center gap-1.5"
              title="Create a new official skill (source=agnes)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create
            </button>
          </div>
        </div>

        {errMsg && (
          <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
            {errMsg}
          </div>
        )}

        {loading && !loaded && (
          <div className="text-sm text-text-tertiary py-12 text-center">Loading…</div>
        )}

        {loaded && items.length === 0 && (
          <div className="text-sm text-text-tertiary py-16 text-center border border-dashed border-border rounded-xl">
            No official skills yet. Click <span className="text-text-secondary font-medium">Create</span> to author one.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((skill) => (
            <OfficialCard
              key={skill.id}
              skill={skill}
              busy={busyId === skill.id}
              onOpenDetail={() => setActiveSkill(skill)}
              onEdit={() => setEditingSkill(skill)}
              onPublish={() => onClickPublish(skill)}
              onDelete={() => onClickDelete(skill)}
            />
          ))}
        </div>

        {loaded && items.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            onChange={(p) => load({ page: p })}
          />
        )}
      </div>

      {activeSkill && (
        <SkillDetailModal skill={activeSkill} onClose={() => setActiveSkill(null)} />
      )}

      {showCreate && (
        <SkillEditorModal
          mode="create"
          api={editorApi}
          flavor="admin-official"
          headerHint={createAppId ? `app=${createAppId}` : undefined}
          onClose={() => onCloseEditor(true)}
        />
      )}

      {editingSkill && (
        <SkillEditorModal
          mode="edit"
          skillId={editingSkill.id}
          initialSkillName={editingSkill.name}
          api={editorApi}
          flavor="admin-official"
          headerHint={`app=${editingSkill.appId}`}
          onClose={() => onCloseEditor(true)}
        />
      )}
    </AdminLayout>
  );
}
