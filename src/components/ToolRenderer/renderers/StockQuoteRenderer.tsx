import { useMemo, useState } from "react";
import type { ToolRenderProps } from "../registry";

// ── helpers ──────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStr(v: unknown): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", HKD: "HK$", CNY: "¥", EUR: "€", GBP: "£", JPY: "¥", KRW: "₩",
  AUD: "A$", CAD: "C$", SGD: "S$", TWD: "NT$", INR: "₹",
};

function currencyPrefix(currency?: string): string {
  if (!currency) return "";
  return CURRENCY_SYMBOL[currency] ?? `${currency} `;
}

function formatPrice(price: number, currency?: string): string {
  const opts: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(price) < 10 ? 4 : 2,
  };
  return currencyPrefix(currency) + price.toLocaleString("en-US", opts);
}

function formatPlainPrice(price: number): string {
  const opts: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(price) < 10 ? 4 : 2,
  };
  return price.toLocaleString("en-US", opts);
}

function formatLargeNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const ACRONYM = new Set(["EBITDA", "EBIT", "EPS", "ROE", "ROA"]);
function prettifyMetric(snake: string): string {
  return snake
    .split("_")
    .map((w) => {
      if (!w) return w;
      const upper = w.toUpperCase();
      if (ACRONYM.has(upper)) return upper;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// CN-region exchanges flip up/down semantics (red=up, green=down).
const CN_EXCHANGES = new Set(["SHA", "SHE", "HKG"]);

interface Colors {
  upHex: string;
  downHex: string;
  upPillBg: string;
  upPillText: string;
  downPillBg: string;
  downPillText: string;
}

function regionColors(exchange?: string): Colors {
  const cn = !!exchange && CN_EXCHANGES.has(exchange);
  return cn
    ? {
        upHex: "#dc2626",
        downHex: "#10b981",
        upPillBg: "rgba(220,38,38,0.13)",
        upPillText: "#a01818",
        downPillBg: "rgba(16,185,129,0.13)",
        downPillText: "#0e6b4d",
      }
    : {
        upHex: "#34c759",
        downHex: "#ef4444",
        upPillBg: "rgba(52,199,89,0.13)",
        upPillText: "#1f7a3d",
        downPillBg: "rgba(239,68,68,0.13)",
        downPillText: "#a01818",
      };
}

// ── chart ────────────────────────────────────────────────────────────────────

interface ChartPoint { t: string; p: number; v: number }

function readChartPoints(arr: unknown): ChartPoint[] {
  return asArr(arr)
    .map((raw) => {
      if (!isRecord(raw)) return null;
      const t = asStr(raw.t);
      const p = asNum(raw.p);
      if (!t || p == null) return null;
      return { t, p, v: asNum(raw.v) ?? 0 };
    })
    .filter((x): x is ChartPoint => x != null);
}

const CHART_WINDOWS = ["1d", "1mo", "1y"] as const;
type ChartWindow = typeof CHART_WINDOWS[number];
const CHART_WINDOW_LABELS: Record<ChartWindow, string> = { "1d": "1D", "1mo": "1M", "1y": "1Y" };

function formatChartTick(iso: string, window: ChartWindow): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (window === "1d") {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (window === "1mo") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function Sparkline({
  points,
  prevClose,
  upHex,
  downHex,
}: {
  points: ChartPoint[];
  prevClose?: number;
  upHex: string;
  downHex: string;
}) {
  if (points.length < 2) return null;
  const prices = points.map((p) => p.p);
  const allValues = prevClose != null ? [...prices, prevClose] : prices;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const W = 560;
  const H = 76;
  const step = W / (points.length - 1);

  const up = prices[prices.length - 1] >= prices[0];
  const stroke = up ? upHex : downHex;
  const fill = `${stroke}22`; // ~13% alpha

  const linePath = points
    .map((p, i) => {
      const x = i * step;
      const y = H - ((p.p - min) / range) * H;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const prevPct = prevClose != null ? ((max - prevClose) / range) * 100 : null;
  // Suppress min/max label if it sits right on top of the prev-close label.
  const collisionEps = range * 0.08;
  const showMaxLabel = prevClose == null || prevClose < max - collisionEps;
  const showMinLabel = prevClose == null || prevClose > min + collisionEps;

  return (
    <div className="relative h-[76px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 w-full h-full block"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={`${linePath} L ${W} ${H} L 0 ${H} Z`} fill={fill} />
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showMaxLabel && (
        <div className="absolute right-0 top-0 bg-surface-alt pl-1 text-[9px] text-text-tertiary tabular-nums leading-none">
          {formatPlainPrice(max)}
        </div>
      )}
      {showMinLabel && (
        <div className="absolute right-0 bottom-0 bg-surface-alt pl-1 text-[9px] text-text-tertiary tabular-nums leading-none">
          {formatPlainPrice(min)}
        </div>
      )}
      {prevPct != null && prevClose != null && (
        <>
          <div
            className="absolute inset-x-0 border-t border-dashed border-text-tertiary/40 pointer-events-none"
            style={{ top: `${prevPct}%` }}
          />
          <div
            className="absolute right-0 bg-surface-alt pl-1 text-[9px] text-text-tertiary tabular-nums leading-none"
            style={{ top: `${prevPct}%`, transform: "translateY(-50%)" }}
          >
            {formatPlainPrice(prevClose)}
          </div>
        </>
      )}
    </div>
  );
}

function ChartTickLabels({ points, window }: { points: ChartPoint[]; window: ChartWindow }) {
  if (points.length < 2) return null;
  const tickCount = Math.min(5, points.length);
  const indices: number[] = [];
  for (let i = 0; i < tickCount; i++) {
    indices.push(Math.round((i * (points.length - 1)) / (tickCount - 1)));
  }
  return (
    <div className="mt-1 flex justify-between text-[9px] text-text-tertiary tabular-nums">
      {indices.map((idx) => (
        <span key={idx}>{formatChartTick(points[idx].t, window)}</span>
      ))}
    </div>
  );
}

function ChartSection({
  chart,
  prevClose,
  colors,
}: {
  chart: Record<string, unknown>;
  prevClose?: number;
  colors: Colors;
}) {
  const seriesByWindow = useMemo(() => {
    const out = {} as Record<ChartWindow, ChartPoint[]>;
    for (const w of CHART_WINDOWS) out[w] = readChartPoints(chart[w]);
    return out;
  }, [chart]);

  const initial = CHART_WINDOWS.find((w) => seriesByWindow[w].length >= 2) ?? "1d";
  const [active, setActive] = useState<ChartWindow>(initial);
  const series = seriesByWindow[active];

  const hasAny = CHART_WINDOWS.some((w) => seriesByWindow[w].length >= 2);
  if (!hasAny) return null;

  const refPrev = active === "1d" ? prevClose : undefined;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1 mb-1.5">
        {CHART_WINDOWS.map((w) => {
          const enabled = seriesByWindow[w].length >= 2;
          const isActive = active === w;
          return (
            <button
              key={w}
              disabled={!enabled}
              onClick={() => setActive(w)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider transition-colors ${
                isActive
                  ? "bg-text-primary/[0.07] text-text-primary"
                  : enabled
                    ? "text-text-tertiary hover:text-text-primary"
                    : "text-text-tertiary/40 cursor-not-allowed"
              }`}
            >
              {CHART_WINDOW_LABELS[w]}
            </button>
          );
        })}
      </div>
      {series.length >= 2 ? (
        <>
          <Sparkline
            points={series}
            prevClose={refPrev}
            upHex={colors.upHex}
            downHex={colors.downHex}
          />
          <ChartTickLabels points={series} window={active} />
        </>
      ) : (
        <div className="h-[76px] flex items-center justify-center text-[10px] text-text-tertiary">
          No data for this period
        </div>
      )}
    </div>
  );
}

// ── main card ────────────────────────────────────────────────────────────────

function ChangePill({
  change,
  changePercent,
  colors,
}: {
  change?: number;
  changePercent?: number;
  colors: Colors;
}) {
  if (change == null && changePercent == null) return null;
  const ref = changePercent ?? change ?? 0;
  const isUp = ref >= 0;
  const sign = isUp ? "+" : "−";
  const arrow = isUp ? "▲" : "▼";
  const bg = isUp ? colors.upPillBg : colors.downPillBg;
  const text = isUp ? colors.upPillText : colors.downPillText;
  const absChange = change != null ? Math.abs(change) : null;
  const absPct = changePercent != null ? Math.abs(changePercent) : null;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold tabular-nums whitespace-nowrap"
      style={{ background: bg, color: text }}
    >
      <span className="text-[8px] leading-none">{arrow}</span>
      {absChange != null && (
        <span>
          {sign}
          {absChange.toFixed(absChange < 10 ? 4 : 2)}
        </span>
      )}
      {absPct != null && (
        <span>
          ({sign}
          {absPct.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

function MainCard({
  quote,
  yahooUrl,
  colors,
}: {
  quote: Record<string, unknown>;
  yahooUrl: string | null;
  colors: Colors;
}) {
  const name = asStr(quote.name);
  const ticker = asStr(quote.ticker);
  const exchange = asStr(quote.exchange);
  const currency = asStr(quote.currency);
  const price = asNum(quote.price);
  const previousClose = asNum(quote.previous_close);
  const change = asNum(quote.change);
  const changePercent = asNum(quote.change_percent);
  const asOf = asStr(quote.as_of);
  const marketState = asStr(quote.market_state);

  return (
    <div className="mt-2.5">
      {name && (
        <div className="text-[13px] font-semibold text-text-primary leading-tight line-clamp-2">
          {name}
        </div>
      )}

      {(ticker || exchange || currency || yahooUrl) && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-secondary">
          {ticker && <span className="font-semibold text-text-primary">{ticker}</span>}
          {ticker && exchange && <span className="text-text-tertiary/50">·</span>}
          {exchange && <span>{exchange}</span>}
          {(ticker || exchange) && currency && <span className="text-text-tertiary/50">·</span>}
          {currency && <span>{currency}</span>}
          {yahooUrl && (
            <a
              href={yahooUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ml-auto text-[10px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-0.5"
            >
              Yahoo Finance
              <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
          )}
        </div>
      )}

      {price != null && (
        <div className="mt-2 flex items-end gap-2 flex-wrap">
          <span className="text-[22px] font-semibold text-text-primary leading-none tracking-[-0.02em] tabular-nums">
            {formatPrice(price, currency)}
          </span>
          <div className="pb-0.5">
            <ChangePill change={change} changePercent={changePercent} colors={colors} />
          </div>
        </div>
      )}

      {(previousClose != null || asOf || marketState) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-tertiary tabular-nums">
          {previousClose != null && (
            <span>
              <span className="text-text-secondary">Prev</span>{" "}
              {formatPrice(previousClose, currency)}
            </span>
          )}
          {previousClose != null && (asOf || marketState) && <span className="text-text-tertiary/40">·</span>}
          {asOf && <span>{formatLocalTime(asOf)}</span>}
          {asOf && marketState && <span className="text-text-tertiary/40">·</span>}
          {marketState && <span className="uppercase tracking-wider">{marketState}</span>}
        </div>
      )}
    </div>
  );
}

// ── key stats ────────────────────────────────────────────────────────────────

interface KeyStatField {
  key: string;
  label: string;
  format: (v: number, currency?: string) => string;
}

const KEY_STAT_FIELDS: KeyStatField[] = [
  { key: "market_cap",          label: "Mkt Cap",   format: (v, c) => `${currencyPrefix(c)}${formatLargeNumber(v)}` },
  { key: "pe_ratio",            label: "P/E",       format: (v) => v.toFixed(2) },
  { key: "forward_pe",          label: "Fwd P/E",   format: (v) => v.toFixed(2) },
  { key: "dividend_yield",      label: "Div Yield", format: (v) => `${v.toFixed(2)}%` },
  { key: "fifty_two_week_high", label: "52W High",  format: (v, c) => formatPrice(v, c) },
  { key: "fifty_two_week_low",  label: "52W Low",   format: (v, c) => formatPrice(v, c) },
  { key: "average_volume",      label: "Avg Vol",   format: (v) => formatLargeNumber(v) },
  { key: "beta",                label: "Beta",      format: (v) => v.toFixed(2) },
];

function KeyStatsGrid({ stats, currency }: { stats: Record<string, unknown>; currency?: string }) {
  const rendered = KEY_STAT_FIELDS.map((f) => {
    const v = asNum(stats[f.key]);
    return { label: f.label, display: v == null ? "—" : f.format(v, currency) };
  });
  if (rendered.every((r) => r.display === "—")) return null;
  return (
    <div className="mt-3 grid grid-cols-4 gap-x-3 gap-y-2">
      {rendered.map((r) => (
        <div key={r.label} className="min-w-0">
          <div className="text-[9px] text-text-tertiary uppercase tracking-wider truncate">{r.label}</div>
          <div className="text-[11.5px] font-semibold text-text-primary tabular-nums truncate tracking-tight">
            {r.display}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── section title ───────────────────────────────────────────────────────────

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 mt-3 mb-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
      <span>{title}</span>
      {count != null && (
        <span className="text-text-tertiary font-normal normal-case tracking-normal">· {count}</span>
      )}
    </div>
  );
}

// ── news ─────────────────────────────────────────────────────────────────────

const NEWS_DEFAULT_VISIBLE = 2;

function NewsItemRow({ n }: { n: Record<string, unknown> }) {
  const title = asStr(n.title);
  const url = asStr(n.url);
  const publisher = asStr(n.publisher);
  const publishedAt = asStr(n.published_at);
  const thumb = asStr(n.thumbnail);
  if (!title) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex gap-2.5 p-1.5 -mx-1.5 rounded-lg hover:bg-background transition-colors"
    >
      {thumb && (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-[80px] h-[56px] rounded-md object-cover shrink-0 bg-background"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-text-primary line-clamp-2 leading-snug">{title}</div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-text-tertiary">
          {publisher && <span className="truncate">{publisher}</span>}
          {publisher && publishedAt && <span className="text-text-tertiary/50">·</span>}
          {publishedAt && <span>{formatLocalTime(publishedAt)}</span>}
        </div>
      </div>
    </a>
  );
}

function NewsSection({ items }: { items: unknown[] }) {
  const [expanded, setExpanded] = useState(false);
  const news = items.filter(isRecord);
  if (!news.length) return null;

  // Default preview prefers items with thumbnails; expanded view keeps the same
  // items at the top so they don't reshuffle on click.
  const preview: Record<string, unknown>[] = [];
  for (const n of news) {
    if (preview.length >= NEWS_DEFAULT_VISIBLE) break;
    if (asStr(n.thumbnail)) preview.push(n);
  }
  for (const n of news) {
    if (preview.length >= NEWS_DEFAULT_VISIBLE) break;
    if (!preview.includes(n)) preview.push(n);
  }
  const rest = news.filter((n) => !preview.includes(n));
  const visible = expanded ? [...preview, ...rest] : preview;
  const hidden = news.length - visible.length;

  return (
    <div>
      <SectionTitle title="News" count={news.length} />
      <div className="space-y-0.5">
        {visible.map((n, i) => (
          <NewsItemRow key={i} n={n} />
        ))}
      </div>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-1 text-[10px] text-text-tertiary hover:text-text-secondary"
        >
          Show {hidden} more {hidden === 1 ? "article" : "articles"}
        </button>
      )}
    </div>
  );
}

// ── financials ───────────────────────────────────────────────────────────────

const FINANCIAL_TABS = [
  { key: "income_statement", label: "Income" },
  { key: "balance_sheet",    label: "Balance" },
  { key: "cash_flow",        label: "Cash Flow" },
] as const;

function FinancialsBody({
  financials,
  currency,
}: {
  financials: Record<string, unknown>;
  currency?: string;
}) {
  const tabs = FINANCIAL_TABS.map((t) => ({
    ...t,
    periods: asArr(financials[t.key]).filter(isRecord),
  })).filter((t) => t.periods.length > 0);

  const [activeIdx, setActiveIdx] = useState(0);
  if (!tabs.length) return <div className="text-[10px] text-text-tertiary">No financials available.</div>;
  const safeIdx = Math.min(activeIdx, tabs.length - 1);
  const periods = tabs[safeIdx].periods.slice(0, 4);

  const metricKeys: string[] = [];
  for (const p of periods) {
    const m = isRecord(p.metrics) ? p.metrics : null;
    if (!m) continue;
    for (const k of Object.keys(m)) if (!metricKeys.includes(k)) metricKeys.push(k);
  }
  const visibleKeys = metricKeys.slice(0, 10);
  const prefix = currencyPrefix(currency);

  return (
    <div>
      <div className="flex gap-1 mb-1.5">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            onClick={() => setActiveIdx(i)}
            className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors ${
              safeIdx === i
                ? "bg-text-primary/[0.07] text-text-primary"
                : "text-text-tertiary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {visibleKeys.length === 0 ? (
        <div className="text-[10px] text-text-tertiary">No metrics available.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] tabular-nums">
            <thead>
              <tr className="text-[9px] text-text-tertiary uppercase tracking-wider">
                <th className="text-left font-medium pr-2 py-1 whitespace-nowrap">Metric</th>
                {periods.map((p, i) => (
                  <th key={i} className="text-right font-medium pr-2 py-1 whitespace-nowrap">
                    {asStr(p.period) ?? ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleKeys.map((k) => (
                <tr key={k} className="border-t border-border-light/60">
                  <td className="py-1 pr-2 text-text-secondary whitespace-nowrap">{prettifyMetric(k)}</td>
                  {periods.map((p, i) => {
                    const m = isRecord(p.metrics) ? p.metrics : null;
                    const v = m ? asNum(m[k]) : undefined;
                    let display = "—";
                    if (v != null) {
                      display = Math.abs(v) >= 1e6
                        ? `${prefix}${formatLargeNumber(v)}`
                        : v.toLocaleString("en-US", { maximumFractionDigits: 4 });
                    }
                    return (
                      <td key={i} className="py-1 pr-2 text-right whitespace-nowrap text-text-primary">
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {metricKeys.length > visibleKeys.length && (
            <div className="mt-1 text-[9px] text-text-tertiary">
              +{metricKeys.length - visibleKeys.length} more metrics omitted
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FinancialsSection({
  financials,
  currency,
}: {
  financials: Record<string, unknown>;
  currency?: string;
}) {
  const tabKeys = FINANCIAL_TABS.filter((t) => asArr(financials[t.key]).filter(isRecord).length > 0)
    .map((t) => t.label);
  if (!tabKeys.length) return null;
  return (
    <FoldRow title="Financials" hint={tabKeys.join(" · ")}>
      <FinancialsBody financials={financials} currency={currency} />
    </FoldRow>
  );
}

// ── about ────────────────────────────────────────────────────────────────────

function AboutBody({ about }: { about: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const summary = asStr(about.summary);
  const sector = asStr(about.sector);
  const industry = asStr(about.industry);
  const website = asStr(about.website);
  const employees = asNum(about.employees);
  const headquarters = asStr(about.headquarters);
  const founded = asNum(about.founded);

  const previewLength = 180;
  const isLong = !!summary && summary.length > previewLength;
  const shownSummary = !summary
    ? undefined
    : expanded || !isLong
      ? summary
      : `${summary.slice(0, previewLength).trim()}…`;

  const infoRows: { label: string; value: string; link?: string }[] = [];
  if (sector) infoRows.push({ label: "Sector", value: sector });
  if (industry) infoRows.push({ label: "Industry", value: industry });
  if (headquarters) infoRows.push({ label: "HQ", value: headquarters });
  if (employees != null) infoRows.push({ label: "Employees", value: employees.toLocaleString("en-US") });
  if (founded != null) infoRows.push({ label: "Founded", value: String(founded) });
  if (website) infoRows.push({ label: "Website", value: website.replace(/^https?:\/\//, ""), link: website });

  return (
    <div>
      {summary && (
        <div className="text-[11px] text-text-secondary leading-relaxed">
          {shownSummary}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-1 text-emerald-700 hover:text-emerald-800 font-semibold text-[10px]"
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
      )}
      {infoRows.length > 0 && (
        <div className={`${summary ? "mt-2" : ""} grid grid-cols-2 gap-x-3 gap-y-1`}>
          {infoRows.map((r) => (
            <div key={r.label} className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[9px] text-text-tertiary uppercase tracking-wider shrink-0 w-[64px] truncate">
                {r.label}
              </span>
              {r.link ? (
                <a
                  href={r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] text-emerald-700 hover:text-emerald-800 truncate min-w-0"
                >
                  {r.value}
                </a>
              ) : (
                <span className="text-[11px] text-text-primary truncate min-w-0">{r.value}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AboutSection({ about }: { about: Record<string, unknown> }) {
  const summary = asStr(about.summary);
  const sector = asStr(about.sector);
  const industry = asStr(about.industry);
  const website = asStr(about.website);
  const employees = asNum(about.employees);
  const headquarters = asStr(about.headquarters);
  const founded = asNum(about.founded);

  if (!summary && !sector && !industry && !website && employees == null && !headquarters && founded == null) {
    return null;
  }

  const hint = summary
    ? summary.length > 60 ? `${summary.slice(0, 60).trim()}…` : summary
    : [sector, industry].filter(Boolean).join(" · ") || undefined;

  return (
    <FoldRow title="About" hint={hint}>
      <AboutBody about={about} />
    </FoldRow>
  );
}

// ── fold row (Financials / About) ────────────────────────────────────────────

function FoldRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border-light/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left py-2 text-[11px] text-text-primary hover:bg-background/40 -mx-1.5 px-1.5 rounded transition-colors"
      >
        <svg
          className={`w-2.5 h-2.5 shrink-0 text-text-tertiary transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="font-medium">{title}</span>
        {!open && hint && (
          <span className="ml-auto text-[10px] text-text-tertiary truncate min-w-0">{hint}</span>
        )}
      </button>
      {open && <div className="pb-2.5 pt-0.5">{children}</div>}
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export function StockQuoteRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query = (toolInput.query as string) ?? "";
  const data = toolResult;
  const isError = !!(data && data.error === true);

  const quote = data && isRecord(data.quote) ? data.quote : null;
  const chart = data && isRecord(data.chart) ? data.chart : null;
  const keyStats = data && isRecord(data.key_stats) ? data.key_stats : null;
  const about = data && isRecord(data.about) ? data.about : null;
  const news = asArr(data?.news);
  const financials = data && isRecord(data.financials) ? data.financials : null;

  const ticker = quote ? asStr(quote.ticker) : undefined;
  const exchange = quote ? asStr(quote.exchange) : undefined;
  const currency = quote ? asStr(quote.currency) : undefined;
  const price = quote ? asNum(quote.price) : undefined;
  const previousClose = quote ? asNum(quote.previous_close) : undefined;

  const yahooUrl = ticker ? `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}` : null;
  const colors = regionColors(exchange);

  const hasMain = price != null;
  const hasChart = !!chart && CHART_WINDOWS.some((w) => asArr(chart[w]).length > 0);
  const hasAnyContent = hasMain || hasChart || !!keyStats || !!about || news.length > 0 || !!financials;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm max-w-[560px]">
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
        <div className="mt-2 text-[11px] text-red-600">
          {asStr(data!.message) ?? "Failed to fetch stock quote."}
        </div>
      )}

      {data && !isError && !hasAnyContent && (
        <div className="mt-2 text-[11px] text-text-tertiary">No stock quote found.</div>
      )}

      {quote && hasMain && <MainCard quote={quote} yahooUrl={yahooUrl} colors={colors} />}
      {hasChart && chart && <ChartSection chart={chart} prevClose={previousClose} colors={colors} />}
      {keyStats && <KeyStatsGrid stats={keyStats} currency={currency} />}
      {news.length > 0 && <NewsSection items={news} />}
      {(financials || about) && (
        <div className="mt-3">
          {financials && <FinancialsSection financials={financials} currency={currency} />}
          {about && <AboutSection about={about} />}
        </div>
      )}
    </div>
  );
}
