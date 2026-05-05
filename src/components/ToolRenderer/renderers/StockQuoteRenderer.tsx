import { useState } from "react";
import type { ToolRenderProps } from "../registry";

// ── helpers ──────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function asStr(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

// Currency symbol — trust summary.currency over summary.price (HK/USD 都是 "$")
const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", HKD: "HK$", CNY: "¥", EUR: "€", GBP: "£", JPY: "¥", KRW: "₩",
  AUD: "A$", CAD: "C$", SGD: "S$", TWD: "NT$", INR: "₹",
};

function formatPrice(price: number | undefined, currency: string | undefined, fallback?: string): string {
  if (price == null) return fallback ?? "";
  const opts: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: price < 10 ? 4 : 2,
  };
  const formatted = price.toLocaleString("en-US", opts);
  if (!currency) return formatted; // crypto
  return (CURRENCY_SYMBOL[currency] ?? `${currency} `) + formatted;
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return String(n);
}

function parsePriceMovement(pm: unknown): { isUp: boolean; value: number; percentage: number } | null {
  if (!isRecord(pm)) return null;
  const movement = asStr(pm.movement);
  const value = asNum(pm.value) ?? 0;
  const percentage = asNum(pm.percentage) ?? 0;
  if (!movement) return null;
  return { isUp: movement === "Up", value: Math.abs(value), percentage: Math.abs(percentage) };
}

// ── sparkline ────────────────────────────────────────────────────────────────

interface GraphPoint {
  price: number;
  afterHours: boolean;
}

function Sparkline({ points }: { points: GraphPoint[] }) {
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const W = 520;
  const H = 56;
  const step = W / (points.length - 1);

  const up = prices[prices.length - 1] >= prices[0];
  const stroke = up ? "#10b981" : "#ef4444";
  const fill = up ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)";

  // Split regular-hours vs after-hours segments so we can dash the latter.
  const segments: Array<{ d: string; dashed: boolean }> = [];
  let current: { path: string[]; dashed: boolean } | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = i * step;
    const y = H - ((p.price - min) / range) * H;
    const dashed = p.afterHours;
    if (!current || current.dashed !== dashed) {
      if (current) segments.push({ d: current.path.join(" "), dashed: current.dashed });
      current = { path: [`M ${x.toFixed(1)} ${y.toFixed(1)}`], dashed };
    } else {
      current.path.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  }
  if (current) segments.push({ d: current.path.join(" "), dashed: current.dashed });

  // Area fill for regular-hours only
  const regularPath = points.map((p, i) => {
    const x = i * step;
    const y = H - ((p.price - min) / range) * H;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[56px] block"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${regularPath} L ${W} ${H} L 0 ${H} Z`} fill={fill} />
      {segments.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={s.dashed ? "3 3" : undefined}
          opacity={s.dashed ? 0.6 : 1}
        />
      ))}
    </svg>
  );
}

// ── main card ────────────────────────────────────────────────────────────────

function MovementBadge({ pm, compact = false }: { pm: { isUp: boolean; value: number; percentage: number }; compact?: boolean }) {
  const color = pm.isUp ? "text-emerald-600" : "text-red-600";
  const sign = pm.isUp ? "+" : "−";
  const arrow = pm.isUp ? "↑" : "↓";
  if (compact) {
    return (
      <span className={`text-[10px] font-semibold tabular-nums ${color}`}>
        {sign}{pm.percentage.toFixed(2)}% {arrow}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-baseline gap-1.5 tabular-nums ${color}`}>
      <span className="text-[13px] font-semibold">{sign}{pm.value.toFixed(2)}</span>
      <span className="text-[12px] font-semibold">{sign}{pm.percentage.toFixed(2)}%</span>
      <span className="text-[12px]">{arrow}</span>
    </span>
  );
}

function MainCard({
  summary,
  googleFinanceUrl,
}: {
  summary: Record<string, unknown>;
  googleFinanceUrl: string | null;
}) {
  const title = asStr(summary.title);
  const stock = asStr(summary.stock);
  const exchange = asStr(summary.exchange);
  const currency = asStr(summary.currency);
  const priceNum = asNum(summary.extracted_price);
  const priceStr = asStr(summary.price);
  const pm = parsePriceMovement(summary.price_movement);
  const date = asStr(summary.date);
  const extensions = Array.isArray(summary.extensions) ? (summary.extensions as string[]) : [];

  const market = isRecord(summary.market) ? summary.market : null;
  const marketTrading = market ? asStr(market.trading) : undefined;
  const marketPrice = market ? asNum(market.extracted_price) : undefined;
  const marketCurrency = market ? asStr(market.currency) ?? currency : currency;
  const marketPm = market ? parsePriceMovement(market.price_movement) : null;

  return (
    <div className="mt-2">
      {/* Top: company + ticker badge + external link */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {title && <div className="text-[14px] font-semibold text-text-primary leading-tight line-clamp-2">{title}</div>}
          {(stock || exchange) && (
            <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold tracking-wider">
              {stock && <span>{stock}</span>}
              {stock && exchange && <span className="opacity-50">·</span>}
              {exchange && <span>{exchange}</span>}
            </div>
          )}
        </div>
        {googleFinanceUrl && (
          <a
            href={googleFinanceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-[10px] text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-0.5"
          >
            Google Finance
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </a>
        )}
      </div>

      {/* Price row */}
      <div className="mt-2 flex items-baseline gap-2.5 flex-wrap">
        <span className="text-[26px] font-light text-text-primary leading-none tabular-nums">
          {formatPrice(priceNum, currency, priceStr)}
        </span>
        {pm && <MovementBadge pm={pm} />}
      </div>

      {/* market sub-line (US pre/after hours) */}
      {marketTrading && marketPrice != null && (
        <div className="mt-1 text-[11px] text-text-tertiary tabular-nums flex items-baseline gap-1.5">
          <span className="font-medium text-text-secondary">{marketTrading}:</span>
          <span>{formatPrice(marketPrice, marketCurrency)}</span>
          {marketPm && <MovementBadge pm={marketPm} compact />}
        </div>
      )}

      {(date || extensions.length > 0) && (
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-text-tertiary truncate">
          {date && <span>{date}</span>}
          {date && extensions.length > 0 && <span>·</span>}
          {extensions.length > 0 && <span className="truncate">{extensions.join(" · ")}</span>}
        </div>
      )}
    </div>
  );
}

// ── key stats ────────────────────────────────────────────────────────────────

function KeyStatsGrid({ stats }: { stats: Record<string, unknown>[] }) {
  if (!stats.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border-light/60 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
      {stats.map((s, i) => {
        const label = asStr(s.label);
        const value = asStr(s.value);
        const description = asStr(s.description);
        if (!label || !value) return null;
        return (
          <div key={i} className="min-w-0" title={description || undefined}>
            <div className="text-[9px] text-text-tertiary uppercase tracking-wider truncate">{label}</div>
            <div className="text-[11.5px] font-medium text-text-primary tabular-nums truncate">{value}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── about ────────────────────────────────────────────────────────────────────

function AboutSection({ about }: { about: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const description = isRecord(about.description) ? about.description : null;
  const snippet = description ? asStr(description.snippet) : undefined;
  const sourceLink = description ? asStr(description.link) : undefined;
  const sourceText = description ? asStr(description.link_text) : undefined;
  const info = asArr(about.info);

  if (!snippet && info.length === 0) return null;

  const previewLength = 160;
  const isLong = snippet && snippet.length > previewLength;
  const shownSnippet = expanded || !isLong ? snippet : `${snippet!.slice(0, previewLength).trim()}…`;

  return (
    <CollapsibleSection title="About" summary={snippet ? shownSnippet?.slice(0, 70) + "…" : undefined}>
      {snippet && (
        <div className="text-[11.5px] text-text-secondary leading-relaxed">
          {shownSnippet}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-1 text-emerald-600 hover:text-emerald-700 font-medium text-[10px]"
            >
              {expanded ? "less" : "more"}
            </button>
          )}
          {sourceLink && (
            <>
              {" "}
              <a
                href={sourceLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-emerald-600 hover:text-emerald-700 font-medium text-[10px]"
              >
                {sourceText ?? "Source"} →
              </a>
            </>
          )}
        </div>
      )}
      {info.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {info.map((item, i) => {
            const label = asStr(item.label);
            const value = asStr(item.value);
            const link = asStr(item.link);
            if (!label || !value) return null;
            return (
              <div key={i} className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-[9px] text-text-tertiary uppercase tracking-wider shrink-0 w-[68px] truncate">
                  {label}
                </span>
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 truncate min-w-0"
                  >
                    {value}
                  </a>
                ) : (
                  <span className="text-[11px] text-text-primary truncate min-w-0">{value}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}

// ── news ─────────────────────────────────────────────────────────────────────

function NewsSection({ groups }: { groups: Record<string, unknown>[] }) {
  const items = groups.flatMap((g) => asArr(g.items));
  if (!items.length) return null;

  return (
    <CollapsibleSection title="News" count={items.length}>
      <div className="space-y-2">
        {items.slice(0, 5).map((n, i) => {
          const snippet = asStr(n.snippet);
          const link = asStr(n.link);
          const source = asStr(n.source);
          const date = asStr(n.date);
          const thumb = asStr(n.thumbnail);
          if (!snippet) return null;
          return (
            <a
              key={i}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex gap-2 p-1.5 -mx-1.5 rounded-lg hover:bg-background transition-colors"
            >
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-16 h-12 rounded-md object-cover shrink-0 ring-1 ring-border-light/60 bg-gray-50"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-medium text-text-primary line-clamp-2 leading-snug">{snippet}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-text-tertiary">
                  {source && <span className="truncate">{source}</span>}
                  {source && date && <span>·</span>}
                  {date && <span>{date}</span>}
                </div>
              </div>
            </a>
          );
        })}
        {items.length > 5 && (
          <div className="text-[10px] text-text-tertiary text-center">+{items.length - 5} more articles</div>
        )}
      </div>
    </CollapsibleSection>
  );
}

// ── financials ───────────────────────────────────────────────────────────────

function FinancialsSection({ financials, currency }: { financials: Record<string, unknown>[]; currency?: string }) {
  const [activeTab, setActiveTab] = useState(0);
  if (!financials.length) return null;
  const safeTab = Math.min(activeTab, financials.length - 1);
  const active = financials[safeTab];
  const results = asArr(active.results).slice(0, 4); // last 4 periods

  // Build union of all row titles (Revenue, Net Income, etc.) across results
  const rowTitles: string[] = [];
  for (const r of results) {
    for (const row of asArr(r.table)) {
      const t = asStr(row.title);
      if (t && !rowTitles.includes(t)) rowTitles.push(t);
    }
  }

  return (
    <CollapsibleSection
      title="Financials"
      summary={asStr(financials[0].title) ?? undefined}
    >
      {/* tabs */}
      {financials.length > 1 && (
        <div className="flex gap-1 mb-2">
          {financials.map((f, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                safeTab === i
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-background text-text-secondary hover:text-text-primary"
              }`}
            >
              {asStr(f.title) ?? `Table ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] tabular-nums">
            <thead>
              <tr className="text-[9px] text-text-tertiary uppercase tracking-wider">
                <th className="text-left font-medium pr-2 py-1 whitespace-nowrap">Item</th>
                {results.map((r, i) => (
                  <th key={i} className="text-right font-medium pr-2 py-1 whitespace-nowrap">
                    {asStr(r.date) ?? ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowTitles.slice(0, 6).map((rowTitle) => (
                <tr key={rowTitle} className="border-t border-border-light/60">
                  <td className="py-1 pr-2 text-text-secondary whitespace-nowrap">{rowTitle}</td>
                  {results.map((r, i) => {
                    const row = asArr(r.table).find((rw) => asStr(rw.title) === rowTitle);
                    const raw = row ? asNum(row.value) : undefined;
                    const change = row ? asStr(row.change) : undefined;
                    const changeNum = change ? Number(change.replace(/[%]/g, "")) : undefined;
                    const pretty = raw != null ? `${currency === "USD" || !currency ? "$" : ""}${formatLargeNumber(raw)}` : "-";
                    const changeColor = changeNum == null ? "text-text-tertiary" : changeNum >= 0 ? "text-emerald-600" : "text-red-600";
                    return (
                      <td key={i} className="py-1 pr-2 text-right whitespace-nowrap">
                        <div className="text-text-primary">{pretty}</div>
                        {change && (
                          <div className={`text-[9px] ${changeColor}`}>
                            {changeNum != null && changeNum >= 0 ? "+" : ""}{change}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleSection>
  );
}

// ── related strip ───────────────────────────────────────────────────────────

function RelatedStrip({ groups }: { groups: Record<string, unknown>[] }) {
  const items = groups.flatMap((g) => asArr(g.items));
  if (!items.length) return null;
  const title = asStr(groups[0].title) ?? "Related";

  return (
    <div className="mt-3 pt-3 border-t border-border-light/60">
      <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">{title}</div>
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {items.map((r, i) => {
          const name = asStr(r.name) ?? asStr(r.stock);
          const stock = asStr(r.stock);
          const priceStr = asStr(r.price);
          const pm = parsePriceMovement(r.price_movement);
          const link = asStr(r.link);
          const body = (
            <div className="w-[130px] shrink-0 rounded-lg border border-border-light p-1.5 bg-surface hover:bg-background transition-colors">
              {name && <div className="text-[10px] font-semibold text-text-primary truncate">{name}</div>}
              {stock && <div className="text-[8px] text-text-tertiary truncate">{stock}</div>}
              <div className="mt-1 flex items-baseline gap-1 tabular-nums">
                <span className="text-[11px] font-medium text-text-primary truncate">{priceStr}</span>
                {pm && <MovementBadge pm={pm} compact />}
              </div>
            </div>
          );
          return link ? (
            <a
              key={i}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block"
            >
              {body}
            </a>
          ) : (
            <div key={i}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}

// ── collapsible wrapper ─────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  summary,
  count,
  children,
}: {
  title: string;
  summary?: string;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 pt-3 border-t border-border-light/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary"
      >
        <svg
          className={`w-2.5 h-2.5 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span>{title}</span>
        {count != null && <span className="text-text-tertiary font-normal">· {count}</span>}
        {!open && summary && (
          <span className="ml-2 font-normal text-text-tertiary normal-case tracking-normal truncate">
            {summary}
          </span>
        )}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export function StockQuoteRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query = (toolInput.query as string) ?? "";
  const data = toolResult;
  const isError = data && data.error === true;

  const summary = data && isRecord(data.summary) ? data.summary : null;
  const graph = asArr(data?.graph);
  const kg = data && isRecord(data.knowledge_graph) ? data.knowledge_graph : null;
  const keyStats = kg && isRecord(kg.key_stats) ? asArr(kg.key_stats.stats) : [];
  const aboutList = kg ? asArr(kg.about) : [];
  const about = aboutList.length > 0 ? aboutList[0] : null;
  const newsGroups = asArr(data?.news_results);
  const financials = asArr(data?.financials);
  const discover = asArr(data?.discover_more);

  const hasContent = !!(summary || graph.length || keyStats.length || about || newsGroups.length || financials.length || discover.length);

  const stock = summary ? asStr(summary.stock) : undefined;
  const exchange = summary ? asStr(summary.exchange) : undefined;
  const googleFinanceUrl = stock && exchange
    ? `https://www.google.com/finance/quote/${encodeURIComponent(stock)}:${encodeURIComponent(exchange)}`
    : null;

  const graphPoints: GraphPoint[] = graph
    .map((g) => ({ price: asNum(g.price), afterHours: g.after_hours === true }))
    .filter((p): p is GraphPoint => p.price != null)
    .map((p) => ({ price: p.price, afterHours: p.afterHours }));

  const summaryCurrency = summary ? asStr(summary.currency) : undefined;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm max-w-[560px]">
      {/* header */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l6-6 4 4 7-8" />
            <path d="M14 7h6v6" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Stock Quote</span>
        {query && <span className="text-[11px] text-text-secondary truncate min-w-0 flex-1">&ldquo;{query}&rdquo;</span>}
        {!data && <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Fetching...</span>}
      </div>

      {isError && (
        <div className="mt-2 text-[11px] text-red-600">{asStr(data!.message) ?? "Failed to fetch stock quote."}</div>
      )}

      {data && !isError && !hasContent && (
        <div className="mt-2 text-[11px] text-text-tertiary">No stock quote found.</div>
      )}

      {summary && <MainCard summary={summary} googleFinanceUrl={googleFinanceUrl} />}

      {graphPoints.length >= 2 && (
        <div className="mt-3 pt-3 border-t border-border-light/60">
          <Sparkline points={graphPoints} />
        </div>
      )}

      {keyStats.length > 0 && <KeyStatsGrid stats={keyStats} />}

      {about && <AboutSection about={about} />}

      {newsGroups.length > 0 && <NewsSection groups={newsGroups} />}

      {financials.length > 0 && <FinancialsSection financials={financials} currency={summaryCurrency} />}

      {discover.length > 0 && <RelatedStrip groups={discover} />}
    </div>
  );
}
