import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useMarketSkillsStore } from "@/stores/marketSkillsStore";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";
import { SourceBadge } from "@/components/SourceBadge";
import { SkillTypeBadge } from "@/components/SkillTypeBadge";
import { AgnesHubLayout } from "./AgnesHubLayout";
import { ImportModal } from "./ImportModal";
import { Pagination } from "./Pagination";
import { SkillDetailModal } from "./SkillDetailModal";

function SkillCard({
  skill,
  onClick,
  onAdd,
  adding,
}: {
  skill: SkillInfo;
  onClick: () => void;
  onAdd: () => void;
  adding: boolean;
}) {
  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAdd();
  };

  // GitHub 导入的 skill 即便 isOwner=true 也不显示 "Yours"——内容来自他人开源仓库，
  // "Yours" 容易让用户误以为是自己创作。统一展示为 "Added"，体现"我的列表里有这条"语义。
  const inMineLabel = skill.isInMine
    ? skill.isOwner && skill.source !== "github"
      ? "Yours"
      : "Added"
    : null;

  return (
    <button
      onClick={onClick}
      className="group text-left p-4 border border-border rounded-xl hover:border-accent/40
                 hover:shadow-sm transition-all bg-surface relative flex flex-col gap-2"
    >
      <div className="flex items-start gap-2">
        {/* pr-16 给右上角的 +/Added 留位置（Added pill 比单纯 + 宽，需要更大的让位）*/}
        <div className="flex-1 min-w-0 pr-16">
          <div className="text-sm font-semibold text-text-primary truncate">{skill.name}</div>
          {/* SourceBadge 移到 meta 行，避免与右上角 Added pill 重叠 */}
          <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary mt-0.5 flex-wrap">
            <SourceBadge source={skill.source} />
            <SkillTypeBadge skillType={skill.skillType} />
            <span>
              {skill.likeCount.toString()} uses
              {skill.latestPublishedVersion && ` · ${skill.latestPublishedVersion}`}
            </span>
          </div>
        </div>
      </div>
      <div className="text-xs text-text-tertiary line-clamp-2 leading-relaxed min-h-[2.5em]">
        {skill.summary || "No description"}
      </div>

      {/* 右上角：未加入时 hover 浮现 +；点击后稳定展示 Added/Yours pill。
          统一摆在右上角，避免之前"未加入在右下角、加入后跳到右上角"的视觉跳动。 */}
      <div className="absolute top-3 right-3">
        {inMineLabel ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium
                       text-emerald-600 bg-emerald-500/10 border border-emerald-500/20
                       px-1.5 py-0.5 rounded"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {inMineLabel}
          </span>
        ) : (
          <button
            onClick={handleAdd}
            disabled={adding}
            title="Add to My Skills"
            className="w-6 h-6 rounded-md flex items-center justify-center
                       bg-surface border border-border
                       text-text-tertiary hover:text-accent hover:bg-accent/10 hover:border-accent/40
                       disabled:opacity-50
                       opacity-0 group-hover:opacity-100 focus:opacity-100 focus-within:opacity-100
                       transition-all"
          >
            {adding ? (
              <span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
          </button>
        )}
      </div>
    </button>
  );
}

const SOURCE_FILTERS = [
  { key: "", label: "All" },
  { key: "agnes", label: "Official" },
  { key: "github", label: "GitHub" },
  { key: "user", label: "Community" },
] as const;

export function MarketPage() {
  const {
    items,
    loading,
    total,
    page,
    pageSize,
    keyword,
    source,
    addingId,
    loadError,
    load,
    addToMine,
  } = useMarketSkillsStore(
    useShallow((s) => ({
      items: s.items,
      loading: s.loading,
      total: s.total,
      page: s.page,
      pageSize: s.pageSize,
      keyword: s.keyword,
      source: s.source,
      addingId: s.addingId,
      loadError: s.loadError,
      load: s.load,
      addToMine: s.addToMine,
    })),
  );
  const [activeSkill, setActiveSkill] = useState<SkillInfo | null>(null);
  const [searchInput, setSearchInput] = useState(keyword);
  const [importOpen, setImportOpen] = useState(false);

  // 切到本 tab 时强制刷新一次：避免别人 publish / approve 后看到的还是旧快照。
  // load 是 zustand 的稳定引用，effect 等同 mount-only。
  useEffect(() => {
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search: 250ms after user stops typing
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === keyword) return;
    const t = setTimeout(() => {
      load({ keyword: trimmed, page: 1 });
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, keyword, load]);

  // Keep modal data in sync after Add (refreshOne via store would replace items[i])
  useEffect(() => {
    if (!activeSkill) return;
    const fresh = items.find((it) => it.id === activeSkill.id);
    if (fresh && fresh !== activeSkill) setActiveSkill(fresh);
  }, [items, activeSkill]);

  const isFiltered = Boolean(keyword || source);

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
          placeholder="Search by name..."
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
        onClick={() => setImportOpen(true)}
        className="px-3 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                   hover:bg-accent-hover transition-colors"
      >
        Import
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
            <span className="font-medium">Failed to load market: </span>
            {loadError}
            <p className="mt-1 text-xs opacity-90">
              Check gRPC target (<code className="rounded bg-red-100/80 px-1 dark:bg-red-900/50">VITE_API_BASE_URL</code>
              , default Envoy <code className="rounded bg-red-100/80 px-1 dark:bg-red-900/50">:8080</code>), that kw-agent is on
              <code className="ml-1 rounded bg-red-100/80 px-1 dark:bg-red-900/50">:9200</code>, and{" "}
              <code className="rounded bg-red-100/80 px-1 dark:bg-red-900/50">VITE_APP_ID</code> matches your tenant (
              e.g. <code className="rounded bg-red-100/80 px-1 dark:bg-red-900/50">agnes</code>).
            </p>
          </div>
        )}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            {SOURCE_FILTERS.map((f) => {
              const active = source === f.key;
              return (
                <button
                  key={f.key || "all"}
                  onClick={() => load({ source: f.key, page: 1 })}
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
          {!loading && isFiltered && (
            <span className="text-xs text-text-tertiary">
              {total} skill{total === 1 ? "" : "s"} matched
            </span>
          )}
        </div>

        {loading && items.length === 0 ? (
          <div className="text-sm text-text-tertiary text-center mt-16">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center mt-16">
            <p className="text-sm text-text-tertiary">
              {isFiltered ? "No skills match your filters." : "No skills available yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onClick={() => setActiveSkill(skill)}
                  onAdd={() => addToMine(skill.id)}
                  adding={addingId === skill.id}
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

      {activeSkill && (
        <SkillDetailModal
          skill={activeSkill}
          onClose={() => setActiveSkill(null)}
          marketView
        />
      )}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </AgnesHubLayout>
  );
}
