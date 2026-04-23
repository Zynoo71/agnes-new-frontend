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

function formatViews(v: unknown): string | undefined {
  if (typeof v === "number") return `${v.toLocaleString()} views`;
  if (typeof v === "string") return v;
  return undefined;
}

function VerifiedIcon() {
  return (
    <svg className="w-2.5 h-2.5 text-text-tertiary inline-block ml-0.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.2 2.1 3-.3.6 3 2.5 1.7-1.4 2.7 1.4 2.7-2.5 1.7-.6 3-3-.3L12 22l-2.2-2.1-3 .3-.6-3-2.5-1.7 1.4-2.7L3.7 10l2.5-1.7.6-3 3 .3L12 2z" />
      <path d="M10 12.5l1.5 1.5L15 10.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExtensionBadge({ label }: { label: string }) {
  const upper = label.toUpperCase();
  const cls = upper === "LIVE"
    ? "bg-red-500 text-white"
    : upper === "4K"
    ? "bg-black text-white"
    : upper === "NEW"
    ? "bg-emerald-500 text-white"
    : "bg-gray-100 text-gray-600";
  return <span className={`text-[8px] font-bold px-1 py-[1px] rounded ${cls}`}>{upper}</span>;
}

function Thumb({ url, aspectClass, className = "", children }: { url?: string; aspectClass: string; className?: string; children?: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <div className={`${aspectClass} bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg ${className}`} />;
  }
  return (
    <div className={`relative ${aspectClass} rounded-lg overflow-hidden bg-gray-100 ${className}`}>
      <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      {children}
    </div>
  );
}

// ── video row ────────────────────────────────────────────────────────────────

function VideoRow({ v }: { v: Record<string, unknown> }) {
  const thumb = isRecord(v.thumbnail) ? asStr(v.thumbnail.static) : undefined;
  const length = asStr(v.length);
  const extensions = Array.isArray(v.extensions) ? (v.extensions as string[]) : [];
  const channel = isRecord(v.channel) ? v.channel : null;
  const title = asStr(v.title);
  const link = asStr(v.link);
  const views = formatViews(v.views);
  const published = asStr(v.published_date);
  const isLive = v.live === true || extensions.some((e) => e.toUpperCase() === "LIVE");

  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="flex gap-2.5 p-1.5 -mx-1.5 rounded-lg hover:bg-background transition-colors">
      <Thumb url={thumb} aspectClass="w-[120px] h-[68px]" className="shrink-0">
        {length && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-medium px-1 py-[1px] rounded">
            {length}
          </span>
        )}
        {isLive && (
          <span className="absolute top-1 left-1 bg-red-500 text-white text-[8px] font-bold px-1 py-[1px] rounded animate-gentle-pulse">
            LIVE
          </span>
        )}
      </Thumb>
      <div className="flex-1 min-w-0">
        {title && <div className="text-[12px] font-medium text-text-primary line-clamp-2 leading-snug">{title}</div>}
        {channel && (
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-text-secondary">
            <span className="truncate">{asStr(channel.name) ?? "?"}</span>
            {channel.verified === true && <VerifiedIcon />}
          </div>
        )}
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-text-tertiary">
          {views && <span>{views}</span>}
          {views && published && <span>·</span>}
          {published && <span>{published}</span>}
          {extensions.length > 0 && (
            <span className="ml-1 flex gap-0.5">
              {extensions.filter((e) => e.toUpperCase() !== "LIVE").map((e, i) => <ExtensionBadge key={i} label={e} />)}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

// ── shorts ───────────────────────────────────────────────────────────────────

function ShortCard({ s }: { s: Record<string, unknown> }) {
  const views = typeof s.views === "number"
    ? s.views >= 1_000_000 ? `${(s.views / 1_000_000).toFixed(1)}M` : s.views >= 1_000 ? `${(s.views / 1_000).toFixed(1)}K` : String(s.views)
    : asStr(s.views_original);
  return (
    <a href={asStr(s.link)} target="_blank" rel="noopener noreferrer" className="shrink-0 w-[110px] group">
      <Thumb url={asStr(s.thumbnail)} aspectClass="h-[196px] w-full">
        {views && (
          <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] font-medium px-1 py-[1px] rounded">
            {views}
          </span>
        )}
      </Thumb>
      <div className="mt-1 text-[10px] text-text-primary line-clamp-2 leading-tight group-hover:text-text-secondary">{asStr(s.title)}</div>
    </a>
  );
}

function ShortsSection({ items }: { items: Record<string, unknown>[] }) {
  const shorts = items.flatMap((g) => asArr(g.shorts));
  if (!shorts.length) return null;
  return (
    <div>
      <SectionHeader icon="shorts" title={`Shorts · ${shorts.length}`} />
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {shorts.map((s, i) => <ShortCard key={i} s={s} />)}
      </div>
    </div>
  );
}

// ── channel / playlist / movie ──────────────────────────────────────────────

function ChannelRow({ c }: { c: Record<string, unknown> }) {
  const [failed, setFailed] = useState(false);
  const thumb = asStr(c.thumbnail);
  return (
    <a href={asStr(c.link)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 p-1.5 -mx-1.5 rounded-lg hover:bg-background transition-colors">
      {thumb && !failed ? (
        <img src={thumb} alt="" className="w-10 h-10 rounded-full object-cover bg-gray-100 shrink-0" onError={() => setFailed(true)} />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[12px] font-medium text-text-primary">
          <span className="truncate">{asStr(c.title) ?? "?"}</span>
          {c.verified === true && <VerifiedIcon />}
        </div>
        <div className="text-[10px] text-text-tertiary truncate">
          {[asStr(c.handle), asStr(c.subscribers)].filter(Boolean).join(" · ")}
        </div>
        {asStr(c.description) && <div className="text-[10px] text-text-secondary line-clamp-1 mt-0.5">{asStr(c.description)}</div>}
      </div>
    </a>
  );
}

function PlaylistRow({ p }: { p: Record<string, unknown> }) {
  const previews = asArr(p.videos).slice(0, 3);
  const channel = isRecord(p.channel) ? p.channel : null;
  return (
    <a href={asStr(p.link)} target="_blank" rel="noopener noreferrer" className="flex gap-2.5 p-1.5 -mx-1.5 rounded-lg hover:bg-background transition-colors">
      <Thumb url={asStr(p.thumbnail)} aspectClass="w-[100px] h-[56px]" className="shrink-0">
        <span className="absolute inset-y-0 right-0 w-7 bg-black/50 flex flex-col items-center justify-center text-white text-[8px] font-semibold">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 6h13v2H3V6zm0 5h13v2H3v-2zm0 5h9v2H3v-2zm15-5v6l5-3-5-3z" />
          </svg>
          {asStr(p.video_count) ?? ""}
        </span>
      </Thumb>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-text-primary line-clamp-1 leading-snug">{asStr(p.title)}</div>
        {channel && <div className="text-[10px] text-text-tertiary truncate mt-0.5">{asStr(channel.name) ?? ""}</div>}
        {previews.length > 0 && (
          <div className="mt-0.5 text-[10px] text-text-secondary space-y-[1px]">
            {previews.map((prev, i) => (
              <div key={i} className="truncate">· {asStr(prev.title)} {asStr(prev.length) && <span className="text-text-tertiary">({asStr(prev.length)})</span>}</div>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

function MovieRow({ m }: { m: Record<string, unknown> }) {
  const thumb = isRecord(m.thumbnail) ? asStr(m.thumbnail.static) : undefined;
  const info = Array.isArray(m.info) ? (m.info as string[]) : [];
  const extensions = Array.isArray(m.extensions) ? (m.extensions as string[]) : [];
  const channel = isRecord(m.channel) ? m.channel : null;
  return (
    <a href={asStr(m.link)} target="_blank" rel="noopener noreferrer" className="flex gap-2.5 p-1.5 -mx-1.5 rounded-lg hover:bg-background transition-colors">
      <Thumb url={thumb} aspectClass="w-[72px] h-[100px]" className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-text-primary line-clamp-2 leading-snug">{asStr(m.title)}</div>
        {channel && <div className="text-[10px] text-text-tertiary truncate mt-0.5">{asStr(channel.name) ?? ""}</div>}
        {info.length > 0 && <div className="text-[10px] text-text-secondary truncate mt-0.5">{info.join(" · ")}</div>}
        {asStr(m.description) && <div className="text-[10px] text-text-secondary line-clamp-2 mt-0.5">{asStr(m.description)}</div>}
        {extensions.length > 0 && (
          <div className="mt-1 flex gap-0.5">
            {extensions.map((e, i) => <ExtensionBadge key={i} label={e} />)}
          </div>
        )}
      </div>
    </a>
  );
}

// ── section wrapper ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: "video" | "shorts" | "channel" | "playlist" | "movie"; title: string }) {
  const icons: Record<string, React.ReactNode> = {
    video: <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>,
    shorts: <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" fill="currentColor" /></svg>,
    channel: <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" /></svg>,
    playlist: <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h13v2H3V6zm0 5h13v2H3v-2zm0 5h9v2H3v-2zm15-5v6l5-3-5-3z" /></svg>,
    movie: <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4" /></svg>,
  };
  return (
    <div className="flex items-center gap-1.5 mt-3 mb-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
      <span className="text-red-500">{icons[icon]}</span>
      {title}
    </div>
  );
}

function PaginatedList<T>({ items, limit, render }: { items: T[]; limit: number; render: (it: T, i: number) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  return (
    <div>
      <div className="space-y-0.5">{visible.map((it, i) => render(it, i))}</div>
      {items.length > limit && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-[10px] text-text-tertiary hover:text-text-secondary">
          {expanded ? "Collapse" : `Show ${items.length - limit} more`}
        </button>
      )}
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export function YoutubeVideosRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query = (toolInput.query as string) ?? (toolInput.search_query as string) ?? "";
  const data = toolResult;
  const isError = data && data.error === true;

  const videos = asArr(data?.video_results);
  const shortGroups = asArr(data?.shorts_results);
  const shortsCount = shortGroups.reduce((n, g) => n + asArr(g.shorts).length, 0);
  const channels = asArr(data?.channel_results);
  const playlists = asArr(data?.playlist_results);
  const movies = asArr(data?.movie_results);
  const total = videos.length + shortsCount + channels.length + playlists.length + movies.length;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm max-w-[560px]">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-red-50 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-red-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.6 7.2c-.2-.9-.9-1.6-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8c.2.9.9 1.6 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5 3-5 3z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">YouTube</span>
        {query && <span className="text-[11px] text-text-secondary truncate min-w-0 flex-1">&ldquo;{query}&rdquo;</span>}
        {!data && <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Searching...</span>}
        {data && !isError && total > 0 && (
          <span className="text-[10px] text-text-tertiary ml-auto shrink-0 tabular-nums">{total} results</span>
        )}
      </div>

      {isError && (
        <div className="mt-2 text-[11px] text-red-600">{asStr(data!.message) ?? "Failed to fetch YouTube results."}</div>
      )}

      {data && !isError && total === 0 && (
        <div className="mt-2 text-[11px] text-text-tertiary">No results found.</div>
      )}

      {videos.length > 0 && (
        <>
          <SectionHeader icon="video" title={`Videos · ${videos.length}`} />
          <PaginatedList items={videos} limit={3} render={(v, i) => <VideoRow key={i} v={v} />} />
        </>
      )}

      {shortsCount > 0 && <ShortsSection items={shortGroups} />}

      {channels.length > 0 && (
        <>
          <SectionHeader icon="channel" title={`Channels · ${channels.length}`} />
          <PaginatedList items={channels} limit={3} render={(c, i) => <ChannelRow key={i} c={c} />} />
        </>
      )}

      {playlists.length > 0 && (
        <>
          <SectionHeader icon="playlist" title={`Playlists · ${playlists.length}`} />
          <PaginatedList items={playlists} limit={3} render={(p, i) => <PlaylistRow key={i} p={p} />} />
        </>
      )}

      {movies.length > 0 && (
        <>
          <SectionHeader icon="movie" title={`Movies · ${movies.length}`} />
          <PaginatedList items={movies} limit={3} render={(m, i) => <MovieRow key={i} m={m} />} />
        </>
      )}
    </div>
  );
}
