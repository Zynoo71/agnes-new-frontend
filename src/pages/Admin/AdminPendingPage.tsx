import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useAdminPendingStore } from "@/stores/adminPendingStore";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";
import { SourceBadge } from "@/components/SourceBadge";
import { SkillTypeBadge } from "@/components/SkillTypeBadge";
import { Pagination } from "@/pages/AgnesHub/Pagination";
import { AdminLayout } from "./AdminLayout";

const PENDING_CORNER_BADGE =
  "border border-border bg-surface-hover text-text-secondary rounded px-1.5 py-0.5";

function fmtDate(ms: bigint | number): string {
  const n = Number(ms);
  if (!n) return "—";
  return new Date(n).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PendingCard({
  skill,
  acting,
  onApprove,
  onReject,
}: {
  skill: SkillInfo;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isGithub = skill.source === "github";
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className="group p-4 border border-border rounded-xl hover:border-accent/40
                 hover:shadow-sm transition-all bg-surface relative flex flex-col gap-2"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary truncate">{skill.name}</span>
            <SourceBadge source={skill.source} />
            <SkillTypeBadge skillType={skill.skillType} />
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5 truncate">
            {skill.ownerUserId || "—"}
            {` · ${skill.appId || "—"}`}
            {` · ${fmtDate(skill.createdAt)}`}
          </div>
        </div>
        <span className={`text-[10px] font-medium shrink-0 ${PENDING_CORNER_BADGE}`}>
          Pending
        </span>
      </div>
      <div className="text-xs text-text-tertiary line-clamp-2 leading-relaxed min-h-[2.5em]">
        {skill.summary || "No description"}
      </div>
      {skill.sourceRef && (
        <a
          href={skill.sourceRef}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-accent hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
          title={skill.sourceRef}
        >
          {skill.sourceRef}
        </a>
      )}

      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100
                      transition-opacity flex items-center gap-1
                      bg-surface border border-border shadow-sm rounded-md p-0.5">
        <button
          disabled={acting}
          onClick={stop(onReject)}
          title={isGithub ? "Reject — will permanently delete this imported skill" : "Reject — owner can edit and resubmit"}
          className="px-2 py-0.5 text-[11px] font-medium rounded
                     text-text-secondary hover:text-red-500 hover:bg-red-500/10
                     disabled:opacity-50 transition-all"
        >
          Reject
        </button>
        <button
          disabled={acting}
          onClick={stop(onApprove)}
          className="px-2 py-0.5 text-[11px] font-medium rounded
                     bg-accent text-white hover:opacity-90
                     disabled:opacity-50 transition-all"
        >
          {acting ? "…" : "Approve"}
        </button>
      </div>
    </div>
  );
}

export function AdminPendingPage() {
  const {
    items,
    total,
    page,
    pageSize,
    loading,
    loaded,
    actingId,
    keyword,
    load,
    approve,
    reject,
  } = useAdminPendingStore(
    useShallow((s) => ({
      items: s.items,
      total: s.total,
      page: s.page,
      pageSize: s.pageSize,
      loading: s.loading,
      loaded: s.loaded,
      actingId: s.actingId,
      keyword: s.keyword,
      load: s.load,
      approve: s.approve,
      reject: s.reject,
    })),
  );

  const [searchInput, setSearchInput] = useState(keyword);

  // 切到本 tab 时强制刷新一次：避免别人已审或新提交后看到旧快照。
  useEffect(() => {
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load({ keyword: searchInput.trim(), page: 1 });
  };

  const handleApprove = async (skill: SkillInfo) => {
    if (!confirm(`Approve "${skill.name}"? It will become visible in the market.`)) return;
    await approve(skill.id);
  };

  const handleReject = async (skill: SkillInfo) => {
    const isGithub = skill.source === "github";
    const msg = isGithub
      ? `Reject and PERMANENTLY DELETE "${skill.name}" (GitHub import)?\n\nThis cannot be undone — DB record + S3 files will all be removed.`
      : `Reject "${skill.name}"?\n\nThe owner will be able to edit and resubmit it.`;
    const reason = prompt(`${msg}\n\nOptional reason (will be logged):`, "");
    if (reason === null) return;
    const result = await reject(skill.id, reason);
    if (result.hardDeleted) {
      // 静默通过；UI 已经把行删了
    }
  };

  return (
    <AdminLayout>
      <div className="px-8 py-6 max-w-7xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Pending Skills</h1>
            <p className="text-xs text-text-tertiary mt-1">
              {loaded
                ? `${total} skill${total === 1 ? "" : "s"} waiting for review`
                : "Loading…"}
            </p>
          </div>
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or summary"
              className="px-3 py-1.5 text-sm border border-border rounded-lg
                         focus:outline-none focus:border-accent transition-colors w-64"
            />
            <button
              type="submit"
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-all"
            >
              Search
            </button>
            {keyword && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  load({ keyword: "", page: 1 });
                }}
                className="text-xs px-2 py-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {loading && !loaded && (
          <div className="text-sm text-text-tertiary py-12 text-center">Loading…</div>
        )}

        {loaded && items.length === 0 && (
          <div className="text-sm text-text-tertiary py-16 text-center border border-dashed border-border rounded-xl">
            No skills are currently waiting for review.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((skill) => (
            <PendingCard
              key={skill.id}
              skill={skill}
              acting={actingId === skill.id}
              onApprove={() => handleApprove(skill)}
              onReject={() => handleReject(skill)}
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
    </AdminLayout>
  );
}
