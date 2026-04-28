import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useAdminAllStore } from "@/stores/adminAllStore";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";
import { SourceBadge } from "@/components/SourceBadge";
import { SkillTypeBadge } from "@/components/SkillTypeBadge";
import { Pagination } from "@/pages/AgnesHub/Pagination";
import { SkillDetailModal } from "@/pages/AgnesHub/SkillDetailModal";
import { AdminLayout } from "./AdminLayout";

const HARD_DELETE_ALLOWED = new Set(["agnes", "github", "gitee", "user"]);

const SOURCE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All sources" },
  { value: "agnes", label: "Official (agnes)" },
  { value: "github", label: "GitHub" },
  { value: "gitee", label: "Gitee" },
  { value: "user", label: "User created" },
];

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
  onOpenDetail: () => void;
  onHardDelete: () => void;
  deleting: boolean;
}

function AllCard({ skill, onOpenDetail, onHardDelete, deleting }: RowProps) {
  const canDelete = HARD_DELETE_ALLOWED.has(skill.source);
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary truncate">{skill.name}</span>
            <SourceBadge source={skill.source} userLabel="User" />
            <SkillTypeBadge skillType={skill.skillType} />
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5 truncate">
            {skill.likeCount.toString()} uses
            {skill.latestPublishedVersion && ` · ${skill.latestPublishedVersion}`}
            {` · ${skill.ownerUserId || "—"}`}
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

      {canDelete && (
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100
                        transition-opacity flex items-center gap-1
                        bg-surface border border-border shadow-sm rounded-md p-0.5">
          <button
            onClick={stop(onHardDelete)}
            disabled={deleting}
            title="Hard delete (DB + S3) — irreversible"
            className="px-2 py-0.5 text-[11px] font-medium
                       text-red-600 rounded
                       hover:bg-red-50 disabled:opacity-50 transition-all"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      )}
    </button>
  );
}

export function AdminAllSkillsPage() {
  const {
    items,
    total,
    page,
    pageSize,
    loading,
    loaded,
    keyword,
    source,
    load,
    hardDelete,
  } = useAdminAllStore(
    useShallow((s) => ({
      items: s.items,
      total: s.total,
      page: s.page,
      pageSize: s.pageSize,
      loading: s.loading,
      loaded: s.loaded,
      keyword: s.keyword,
      source: s.source,
      load: s.load,
      hardDelete: s.hardDelete,
    })),
  );

  const [searchInput, setSearchInput] = useState(keyword);
  const [activeSkill, setActiveSkill] = useState<SkillInfo | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 切到本 tab 时强制刷新一次：避免审批 / 删除后看到旧快照。
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

  const onChangeSource = (next: string) => {
    if (next === source) return;
    load({ source: next, page: 1 });
  };

  const headerHint = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${total} skill${total === 1 ? "" : "s"} across all tenants`);
    if (source) parts.push(`source=${source}`);
    if (keyword) parts.push(`"${keyword}"`);
    return parts.join(" · ");
  }, [total, source, keyword]);

  const onClickDelete = async (skill: SkillInfo) => {
    if (!HARD_DELETE_ALLOWED.has(skill.source)) return;
    const isUserOwned = skill.source === "user";
    const extra = isUserOwned
      ? "\n\n⚠  USER-OWNED skill: this will also remove it from every\n" +
        "   user's \"My Skills\" and break any in-flight conversation\n" +
        "   that selected it. Use admin_reject_skill instead if a soft\n" +
        "   state is enough."
      : "";
    const ok = window.confirm(
      `Hard delete "${skill.name}"?\n\n` +
        `Source: ${skill.source}\n` +
        `Owner: ${skill.ownerUserId || "—"}\n\n` +
        `This will purge DB rows + S3 files and cannot be undone.` +
        extra,
    );
    if (!ok) return;
    setDeletingId(skill.id);
    setErrMsg(null);
    try {
      await hardDelete(skill.id);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="px-8 py-6 max-w-7xl mx-auto flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">All Skills</h1>
            <p className="text-xs text-text-tertiary mt-1">
              {loaded ? headerHint : "Loading…"}
              <span className="ml-2 text-text-tertiary">
                · View any skill across tenants; hard delete allowed for{" "}
                <span className="font-mono">agnes / github / gitee / user</span> sources.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={source}
              onChange={(e) => onChangeSource(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-border rounded-lg
                         focus:outline-none focus:border-accent transition-colors bg-surface"
            >
              {SOURCE_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name / summary..."
              className="px-3 py-1.5 text-sm border border-border rounded-lg w-64
                         focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {errMsg && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {errMsg}
          </div>
        )}

        {loading && !loaded && (
          <div className="text-sm text-text-tertiary py-12 text-center">Loading…</div>
        )}

        {loaded && items.length === 0 && (
          <div className="text-sm text-text-tertiary py-16 text-center border border-dashed border-border rounded-xl">
            No skills match the current filters.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((skill) => (
            <AllCard
              key={skill.id}
              skill={skill}
              onOpenDetail={() => setActiveSkill(skill)}
              onHardDelete={() => onClickDelete(skill)}
              deleting={deletingId === skill.id}
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
    </AdminLayout>
  );
}
