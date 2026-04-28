import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useShallow } from "zustand/shallow";
import { useMySkillsStore } from "@/stores/mySkillsStore";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";
import { SourceBadge } from "@/components/SourceBadge";
import { SkillTypeBadge } from "@/components/SkillTypeBadge";
import { AgnesHubLayout } from "./AgnesHubLayout";
import { Pagination } from "./Pagination";
import { SkillDetailModal } from "./SkillDetailModal";
import { SkillEditorModal } from "./SkillEditorModal";

function formatRelative(ms: bigint | number): string {
  const n = typeof ms === "bigint" ? Number(ms) : ms;
  if (!n) return "";
  const diff = Date.now() - n;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(n).toLocaleDateString();
}

const RELATION_FILTERS = [
  { key: "", label: "All" },
  { key: "owner", label: "Created" },
  { key: "added_from_market", label: "Added" },
] as const;

/**
 * 取一个最有信息量的 corner label：
 *
 * - 自建（非 github）：跟随审批 / 上架状态（Draft / Pending / Rejected / Published / Delisted）
 * - 来自市场：Added
 * - Clone 出来：Cloned
 * - GitHub 导入：Imported
 *
 * 原则：与 market 风格一致，corner 只展示「状态文案」，按钮不在 corner，
 * 按钮统一在 hover 时浮现于卡片右下角。
 */
function pickCornerLabel(skill: SkillInfo): { text: string; cls: string } | null {
  if (skill.mineRelation === "owner" && skill.source !== "github") {
    if (skill.marketDelisted) {
      return { text: "Delisted", cls: "bg-text-tertiary/15 text-text-secondary" };
    }
    if (skill.marketApprovalStatus === "pending") {
      return { text: "Pending", cls: "bg-amber-500/10 text-amber-600" };
    }
    if (skill.marketApprovalStatus === "rejected") {
      return { text: "Rejected", cls: "bg-red-500/10 text-red-600" };
    }
    if (skill.latestPublishedVersion && skill.marketVisible) {
      return { text: "Published", cls: "bg-emerald-500/10 text-emerald-600" };
    }
    return { text: "Draft", cls: "bg-text-tertiary/15 text-text-secondary" };
  }
  if (skill.mineRelation === "added_from_market") {
    return { text: "Added", cls: "bg-text-tertiary/15 text-text-secondary" };
  }
  if (skill.mineRelation === "cloned") {
    return { text: "Cloned", cls: "bg-purple-500/10 text-purple-600" };
  }
  if (skill.source === "github") {
    return { text: "Imported", cls: "bg-text-tertiary/15 text-text-secondary" };
  }
  return null;
}

function SkillCard({
  skill,
  onRemove,
  removing,
  confirming,
  onAskConfirm,
  onCancelConfirm,
  onEdit,
  onPublish,
  publishing,
  onOpenDetail,
}: {
  skill: SkillInfo;
  onRemove: () => void;
  removing: boolean;
  confirming: boolean;
  onAskConfirm: () => void;
  onCancelConfirm: () => void;
  onEdit: () => void;
  onPublish: () => void;
  publishing: boolean;
  onOpenDetail: () => void;
}) {
  // 自建 + 非 github：可 Edit / Publish
  const isEditable = skill.mineRelation === "owner" && skill.source !== "github";
  // 审核中：当前版本已经在队列里，禁止再 Edit / Publish ——
  // 必须等审核通过 / 驳回后才能改下一稿，避免「审核员看的快照」和「owner 在编辑的内容」分叉。
  // 后端在 update_skill / publish_skill 也会再卡一次。
  const isPendingReview = skill.marketApprovalStatus === "pending";
  // 没有新草稿可发：当前最新版本和已发布版本是同一个，再点 Publish 既不会带来
  // 新内容也不会改变审批状态。必须先 Edit 出新版本（latestVersion 增大）再发。
  // 后端 publish_skill 也会再卡一次。
  const hasDraftToPublish = Boolean(
    skill.latestVersion &&
      skill.latestVersion !== skill.latestPublishedVersion,
  );
  const corner = pickCornerLabel(skill);
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
          {/* 标题单独一行并 truncate；来源/类型固定下一行，避免短标题时标签跟在名称后面、长标题时又换行导致不一致 */}
          <div className="text-sm font-semibold text-text-primary truncate pr-1">{skill.name}</div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <SourceBadge source={skill.source} />
            <SkillTypeBadge skillType={skill.skillType} />
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {skill.likeCount.toString()} uses
            {skill.latestVersion && ` · ${skill.latestVersion}`}
            <span> · Added {formatRelative(skill.mineAddedAt)}</span>
          </div>
        </div>
        {corner && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${corner.cls}`}>
            {corner.text}
          </span>
        )}
      </div>
      <div className="text-xs text-text-tertiary line-clamp-2 leading-relaxed min-h-[2.5em]">
        {skill.summary || "No description"}
      </div>

      {confirming ? (
        <div className="absolute bottom-2 right-2 flex items-center gap-1
                        bg-surface border border-border shadow-sm rounded-md px-1.5 py-1">
          <span className="text-[11px] text-text-secondary mr-0.5">Remove?</span>
          <button
            onClick={stop(onRemove)}
            disabled={removing}
            className="px-2 py-0.5 text-[11px] font-medium text-white bg-red-500 rounded
                       hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {removing ? "..." : "Yes"}
          </button>
          <button
            onClick={stop(onCancelConfirm)}
            disabled={removing}
            className="px-2 py-0.5 text-[11px] font-medium text-text-secondary border border-border
                       rounded hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            No
          </button>
        </div>
      ) : (
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100
                        transition-opacity flex items-center gap-1
                        bg-surface border border-border shadow-sm rounded-md p-0.5">
          {isEditable && (
            <>
              <button
                onClick={stop(onEdit)}
                disabled={isPendingReview}
                title={
                  isPendingReview
                    ? "Skill is pending review — wait for the result before editing again."
                    : "Edit"
                }
                className="px-2 py-0.5 text-[11px] font-medium
                           text-text-secondary rounded
                           hover:bg-surface-hover hover:text-text-primary
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
                           transition-all"
              >
                Edit
              </button>
              <button
                onClick={stop(onPublish)}
                disabled={publishing || isPendingReview || !hasDraftToPublish}
                title={
                  isPendingReview
                    ? "Skill is already pending review — wait for the result."
                    : !hasDraftToPublish
                      ? "No new draft to publish — edit the skill first to create a new version."
                      : "Publish current draft to the market"
                }
                className="px-2 py-0.5 text-[11px] font-medium
                           text-white bg-emerald-600 rounded
                           hover:bg-emerald-700
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600
                           transition-all"
              >
                {publishing ? "..." : "Publish"}
              </button>
            </>
          )}
          <button
            onClick={stop(onAskConfirm)}
            disabled={isPendingReview}
            title={
              isPendingReview
                ? "Skill is pending review — wait for the result before removing."
                : "Remove from My Skills"
            }
            className="w-6 h-6 rounded flex items-center justify-center
                       text-text-tertiary hover:text-red-500 hover:bg-red-500/10
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-tertiary
                       transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
              />
            </svg>
          </button>
        </div>
      )}
    </button>
  );
}

export function MySkillsPage() {
  const navigate = useNavigate();
  const {
    items,
    total,
    page,
    pageSize,
    loading,
    keyword,
    relation,
    removingId,
    loadError,
    load,
    remove,
    publish,
  } = useMySkillsStore(
    useShallow((s) => ({
      items: s.items,
      total: s.total,
      page: s.page,
      pageSize: s.pageSize,
      loading: s.loading,
      keyword: s.keyword,
      relation: s.relation,
      removingId: s.removingId,
      loadError: s.loadError,
      load: s.load,
      remove: s.remove,
      publish: s.publish,
    })),
  );
  const [searchInput, setSearchInput] = useState(keyword);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [activeSkill, setActiveSkill] = useState<SkillInfo | null>(null);

  useEffect(() => {
    if (!activeSkill) return;
    const fresh = items.find((it) => it.id === activeSkill.id);
    if (fresh && fresh !== activeSkill) setActiveSkill(fresh);
  }, [items, activeSkill]);

  // 切到本 tab 时强制刷新一次：避免 Market 加号 / Publish / 编辑后看到旧快照。
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

  const handleRemove = async (id: string) => {
    await remove(id);
    setConfirmId(null);
  };

  const handlePublish = async (id: string) => {
    if (publishingId) return;
    setPublishingId(id);
    try {
      const result = await publish(id);
      const name = result.skill?.name ?? "Skill";
      const msg = result.needsApproval
        ? `Submitted "${name}" for review.`
        : `Published "${name}" to the market.`;
      // 简单提示：用 alert 避免引入 toast 依赖
      window.alert(msg);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      window.alert(m.replace(/^\[\w+\]\s*/, ""));
    } finally {
      setPublishingId(null);
    }
  };

  const isFiltered = Boolean(keyword || relation);

  const rightSlot = (
    <>
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
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search my skills..."
          className="pl-8 pr-8 py-1.5 text-sm border border-border rounded-lg bg-surface w-72
                     focus:outline-none focus:border-accent transition-colors"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            title="Clear"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <button
        onClick={() => navigate("/agnes-hub/market")}
        className="px-3 py-1.5 text-sm font-medium text-text-secondary border border-border
                   rounded-lg hover:bg-surface-hover transition-colors flex items-center gap-1.5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        Browse Market
      </button>
      <button
        onClick={() => setShowCreate(true)}
        className="px-3 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                   hover:bg-accent-hover transition-colors flex items-center gap-1.5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Create Skill
      </button>
    </>
  );

  return (
    <AgnesHubLayout rightSlot={rightSlot}>
      <div className="p-8 max-w-7xl mx-auto">
        {loadError && (
          <div
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800
                       dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            <span className="font-medium">Failed to load my skills: </span>
            {loadError}
          </div>
        )}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            {RELATION_FILTERS.map((f) => {
              const active = relation === f.key;
              return (
                <button
                  key={f.key || "all"}
                  onClick={() => load({ relation: f.key, page: 1 })}
                  disabled={loading}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
                    ${active
                      ? "bg-accent text-white border-accent"
                      : "bg-surface text-text-secondary border-border hover:border-accent/40 hover:text-text-primary"
                    }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          {!loading && items.length > 0 && isFiltered && (
            <span className="text-xs text-text-tertiary">
              {total} matched
            </span>
          )}
        </div>

        {loading && items.length === 0 ? (
          <div className="text-sm text-text-tertiary text-center mt-16">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center mt-20 px-6">
            {isFiltered ? (
              <p className="text-sm text-text-tertiary">No skills match your filters.</p>
            ) : (
              <div className="max-w-sm mx-auto">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-accent/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-text-primary mb-1">Your toolkit is empty</p>
                <p className="text-xs text-text-tertiary mb-5">
                  Create your own skill, or browse the Market to add existing ones.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setShowCreate(true)}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                               hover:bg-accent-hover transition-colors"
                  >
                    Create Skill
                  </button>
                  <button
                    onClick={() => navigate("/agnes-hub/market")}
                    className="px-4 py-1.5 text-sm font-medium text-text-secondary border border-border
                               rounded-lg hover:bg-surface-hover transition-colors"
                  >
                    Browse Market
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  removing={removingId === skill.id}
                  confirming={confirmId === skill.id}
                  onAskConfirm={() => setConfirmId(skill.id)}
                  onCancelConfirm={() => setConfirmId(null)}
                  onRemove={() => handleRemove(skill.id)}
                  onEdit={() => setEditing({ id: skill.id, name: skill.name })}
                  onPublish={() => handlePublish(skill.id)}
                  publishing={publishingId === skill.id}
                  onOpenDetail={() => setActiveSkill(skill)}
                />
              ))}
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              loading={loading}
              onChange={(p) => load({ page: p })}
            />
          </>
        )}
      </div>
      {showCreate && (
        <SkillEditorModal mode="create" onClose={() => setShowCreate(false)} />
      )}
      {editing && (
        <SkillEditorModal
          mode="edit"
          skillId={editing.id}
          initialSkillName={editing.name}
          onClose={() => setEditing(null)}
        />
      )}
      {activeSkill && (
        <SkillDetailModal skill={activeSkill} onClose={() => setActiveSkill(null)} />
      )}
    </AgnesHubLayout>
  );
}
