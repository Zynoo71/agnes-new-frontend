interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onChange: (page: number) => void;
}

/** 生成 [1, '...', 4, 5, 6, '...', 20] 这样的紧凑页码序列。 */
function buildPageList(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: (number | "...")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(totalPages - 1, current + 1);
  if (left > 2) out.push("...");
  for (let i = left; i <= right; i++) out.push(i);
  if (right < totalPages - 1) out.push("...");
  out.push(totalPages);
  return out;
}

/**
 * SkillsHub 列表分页：右下角，页码可点 + 总条数（灰色）。
 *
 * - 当 ``total <= pageSize`` 仍渲染（仅显示总条数 + 单页 1），避免列表底部突然没尾。
 * - ``loading`` 期间禁用按钮，避免双击连发。
 */
export function Pagination({ page, pageSize, total, loading, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pages = buildPageList(safePage, totalPages);

  const go = (p: number) => {
    if (loading) return;
    if (p < 1 || p > totalPages || p === safePage) return;
    onChange(p);
  };

  return (
    <div className="flex items-center justify-end gap-2 mt-6 text-xs">
      <span className="text-text-tertiary mr-2">{total} total</span>

      <button
        onClick={() => go(safePage - 1)}
        disabled={loading || safePage <= 1}
        className="px-2 py-1 rounded border border-border text-text-secondary
                   hover:bg-surface-hover hover:text-text-primary
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Previous page"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {pages.map((p, idx) =>
        p === "..." ? (
          <span key={`gap-${idx}`} className="px-1 text-text-tertiary select-none">…</span>
        ) : (
          <button
            key={p}
            onClick={() => go(p)}
            disabled={loading}
            className={`min-w-[28px] px-2 py-1 rounded border transition-colors
              ${p === safePage
                ? "bg-accent text-white border-accent"
                : "border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary"}
              disabled:opacity-50`}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => go(safePage + 1)}
        disabled={loading || safePage >= totalPages}
        className="px-2 py-1 rounded border border-border text-text-secondary
                   hover:bg-surface-hover hover:text-text-primary
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Next page"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
