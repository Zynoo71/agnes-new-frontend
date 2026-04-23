import { useEffect, useState } from "react";
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

// SerpAPI thumbnails may be: string URL | base64 data URL | {url|static|rich|link|image|source}
// KG header_images are {image, source} where `image` is the CDN URL.
function extractThumb(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (isRecord(v)) {
    return asStr(v.url) ?? asStr(v.static) ?? asStr(v.rich) ?? asStr(v.image) ?? asStr(v.link) ?? asStr(v.source);
  }
  return undefined;
}

// ── league team-logo fallback ────────────────────────────────────────────────
// SerpAPI omits teams[].thumbnail in scoreboard-style queries. ESPN CDN is a
// stable public source for the big 4 US leagues. Keys match SerpAPI's team name.
const NBA_ABBR: Record<string, string> = {
  "Hawks": "atl", "Celtics": "bos", "Nets": "bkn", "Hornets": "cha", "Bulls": "chi",
  "Cavaliers": "cle", "Mavericks": "dal", "Nuggets": "den", "Pistons": "det", "Warriors": "gs",
  "Rockets": "hou", "Pacers": "ind", "Clippers": "lac", "Lakers": "lal", "Grizzlies": "mem",
  "Heat": "mia", "Bucks": "mil", "Timberwolves": "min", "Pelicans": "no", "Knicks": "ny",
  "Thunder": "okc", "Magic": "orl", "76ers": "phi", "Suns": "phx", "Trail Blazers": "por",
  "Kings": "sac", "Spurs": "sa", "Raptors": "tor", "Jazz": "utah", "Wizards": "wsh",
};
const NFL_ABBR: Record<string, string> = {
  "Cardinals": "ari", "Falcons": "atl", "Ravens": "bal", "Bills": "buf", "Panthers": "car",
  "Bears": "chi", "Bengals": "cin", "Browns": "cle", "Cowboys": "dal", "Broncos": "den",
  "Lions": "det", "Packers": "gb", "Texans": "hou", "Colts": "ind", "Jaguars": "jax",
  "Chiefs": "kc", "Raiders": "lv", "Chargers": "lac", "Rams": "lar", "Dolphins": "mia",
  "Vikings": "min", "Patriots": "ne", "Saints": "no", "Giants": "nyg", "Jets": "nyj",
  "Eagles": "phi", "Steelers": "pit", "49ers": "sf", "Seahawks": "sea", "Buccaneers": "tb",
  "Titans": "ten", "Commanders": "wsh",
};
const MLB_ABBR: Record<string, string> = {
  "Diamondbacks": "ari", "Braves": "atl", "Orioles": "bal", "Red Sox": "bos", "Cubs": "chc",
  "White Sox": "cws", "Reds": "cin", "Guardians": "cle", "Rockies": "col", "Tigers": "det",
  "Astros": "hou", "Royals": "kc", "Angels": "laa", "Dodgers": "lad", "Marlins": "mia",
  "Brewers": "mil", "Twins": "min", "Mets": "nym", "Yankees": "nyy", "Athletics": "oak",
  "Phillies": "phi", "Pirates": "pit", "Padres": "sd", "Mariners": "sea",
  "Cardinals": "stl", "Rays": "tb", "Rangers": "tex", "Blue Jays": "tor", "Nationals": "wsh",
};
const NHL_ABBR: Record<string, string> = {
  "Ducks": "ana", "Coyotes": "ari", "Bruins": "bos", "Sabres": "buf", "Flames": "cgy",
  "Hurricanes": "car", "Blackhawks": "chi", "Avalanche": "col", "Blue Jackets": "cbj", "Stars": "dal",
  "Red Wings": "det", "Oilers": "edm", "Panthers": "fla", "Wild": "min",
  "Canadiens": "mtl", "Predators": "nsh", "Devils": "nj", "Islanders": "nyi",
  "Senators": "ott", "Flyers": "phi", "Penguins": "pit", "Sharks": "sj", "Kraken": "sea",
  "Blues": "stl", "Lightning": "tb", "Maple Leafs": "tor", "Canucks": "van", "Golden Knights": "vgk",
  "Capitals": "wsh", "Jets": "wpg",
};

// Soccer: ESPN uses numeric IDs. Keys include common aliases (SerpAPI may return
// "Man United"/"Manchester United"/"Man Utd"/"Palace"/"Crystal Palace" interchangeably).
const PREMIER_LEAGUE_ID: Record<string, number> = {
  "Arsenal": 359,
  "Aston Villa": 362, "Villa": 362,
  "Bournemouth": 349, "AFC Bournemouth": 349,
  "Brentford": 337,
  "Brighton": 331, "Brighton & Hove Albion": 331, "Brighton and Hove Albion": 331,
  "Burnley": 379,
  "Chelsea": 363,
  "Crystal Palace": 384, "Palace": 384,
  "Everton": 368,
  "Fulham": 370,
  "Ipswich": 373, "Ipswich Town": 373,
  "Leeds": 357, "Leeds United": 357,
  "Leicester": 375, "Leicester City": 375,
  "Liverpool": 364,
  "Luton": 301, "Luton Town": 301,
  "Man City": 382, "Manchester City": 382,
  "Man United": 360, "Man Utd": 360, "Manchester United": 360,
  "Newcastle": 361, "Newcastle United": 361,
  "Nottingham Forest": 393, "Nott'm Forest": 393, "Forest": 393,
  "Sheffield United": 398, "Sheffield Utd": 398,
  "Southampton": 376,
  "Spurs": 367, "Tottenham": 367, "Tottenham Hotspur": 367,
  "Sunderland": 366,
  "West Ham": 371, "West Ham United": 371,
  "Wolves": 380, "Wolverhampton": 380, "Wolverhampton Wanderers": 380,
};

// Top European leagues — covers most soccer queries likely to hit this renderer.
const LA_LIGA_ID: Record<string, number> = {
  "Real Madrid": 86, "Barcelona": 83, "Atletico Madrid": 1068, "Atlético Madrid": 1068,
  "Athletic Club": 93, "Athletic Bilbao": 93, "Real Sociedad": 89, "Real Betis": 244,
  "Villarreal": 102, "Valencia": 94, "Sevilla": 243, "Girona": 9812, "Osasuna": 97,
  "Celta Vigo": 85, "Celta de Vigo": 85, "Rayo Vallecano": 101, "Mallorca": 84, "RCD Mallorca": 84,
  "Espanyol": 88, "Leganes": 17534, "Leganés": 17534, "Getafe": 2922,
  "Alaves": 96, "Alavés": 96, "Las Palmas": 98, "Valladolid": 95, "Real Valladolid": 95,
};

const SERIE_A_ID: Record<string, number> = {
  "Inter": 110, "Inter Milan": 110, "AC Milan": 103, "Milan": 103, "Juventus": 111,
  "Napoli": 114, "Roma": 104, "AS Roma": 104, "Lazio": 105, "Atalanta": 105,
  "Fiorentina": 109, "Bologna": 107, "Torino": 2739, "Genoa": 2832, "Udinese": 115,
  "Lecce": 2735, "Cagliari": 2721, "Parma": 113, "Empoli": 108, "Hellas Verona": 2778,
  "Verona": 2778, "Como": 2947, "Monza": 20142, "Venezia": 114521,
};

const BUNDESLIGA_ID: Record<string, number> = {
  "Bayern Munich": 132, "Bayern München": 132, "Bayer Leverkusen": 131, "Leverkusen": 131,
  "Borussia Dortmund": 124, "Dortmund": 124, "RB Leipzig": 11420, "Leipzig": 11420,
  "Eintracht Frankfurt": 125, "Frankfurt": 125, "VfB Stuttgart": 134, "Stuttgart": 134,
  "VfL Wolfsburg": 135, "Wolfsburg": 135, "Borussia Mönchengladbach": 129, "M'gladbach": 129,
  "SC Freiburg": 128, "Freiburg": 128, "Mainz": 130, "Mainz 05": 130, "Werder Bremen": 127,
  "Union Berlin": 598, "FC Augsburg": 133, "Augsburg": 133, "Hoffenheim": 7911,
  "1. FC Heidenheim": 11393, "Heidenheim": 11393, "St. Pauli": 10169, "Holstein Kiel": 2489,
  "Bochum": 126, "VfL Bochum": 126,
};

const LIGUE_1_ID: Record<string, number> = {
  "PSG": 160, "Paris Saint-Germain": 160, "Paris SG": 160,
  "Marseille": 176, "Monaco": 174, "Lille": 166, "Nice": 170, "Lyon": 165,
  "Lens": 173, "Rennes": 175, "Reims": 1241, "Toulouse": 192, "Nantes": 172,
  "Strasbourg": 180, "Brest": 1249, "Montpellier": 177, "Auxerre": 162,
  "Angers": 161, "Saint-Etienne": 178, "Saint-Étienne": 178, "Le Havre": 164,
};

function espnUsLogo(sport: string, abbr: string): string {
  return `https://a.espncdn.com/i/teamlogos/${sport}/500/scoreboard/${abbr}.png`;
}

function espnSoccerLogo(id: number): string {
  return `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
}

// Normalize: strip trailing "F.C.", "FC", "AFC", drop extra whitespace.
function normalizeTeam(n: string): string {
  return n.replace(/\s+(F\.?\s*C\.?|A\.?\s*F\.?\s*C\.?|S\.?\s*C\.?)$/i, "").trim();
}

function lookupSoccer(map: Record<string, number>, raw: string): number | undefined {
  return map[raw] ?? map[normalizeTeam(raw)];
}

function guessTeamLogo(league: string | undefined, teamName: string | undefined): string | undefined {
  if (!teamName) return undefined;
  const l = (league ?? "").toUpperCase();
  const n = teamName.trim();
  if (l.includes("NBA") && NBA_ABBR[n]) return espnUsLogo("nba", NBA_ABBR[n]);
  if (l.includes("NFL") && NFL_ABBR[n]) return espnUsLogo("nfl", NFL_ABBR[n]);
  if (l.includes("MLB") && MLB_ABBR[n]) return espnUsLogo("mlb", MLB_ABBR[n]);
  if (l.includes("NHL") && NHL_ABBR[n]) return espnUsLogo("nhl", NHL_ABBR[n]);

  // Soccer leagues
  if (l.includes("PREMIER LEAGUE") || l.includes("EPL")) {
    const id = lookupSoccer(PREMIER_LEAGUE_ID, n);
    if (id) return espnSoccerLogo(id);
  }
  if (l.includes("LA LIGA") || l.includes("LALIGA") || l.includes("PRIMERA DIVISION")) {
    const id = lookupSoccer(LA_LIGA_ID, n);
    if (id) return espnSoccerLogo(id);
  }
  if (l.includes("SERIE A")) {
    const id = lookupSoccer(SERIE_A_ID, n);
    if (id) return espnSoccerLogo(id);
  }
  if (l.includes("BUNDESLIGA")) {
    const id = lookupSoccer(BUNDESLIGA_ID, n);
    if (id) return espnSoccerLogo(id);
  }
  if (l.includes("LIGUE 1")) {
    const id = lookupSoccer(LIGUE_1_ID, n);
    if (id) return espnSoccerLogo(id);
  }

  // Last-resort: try all soccer maps (e.g. UCL/UEL mixed pool where league isn't named)
  const all = { ...PREMIER_LEAGUE_ID, ...LA_LIGA_ID, ...SERIE_A_ID, ...BUNDESLIGA_ID, ...LIGUE_1_ID };
  const id = lookupSoccer(all, n);
  if (id) return espnSoccerLogo(id);

  return undefined;
}

// ── dynamic badge lookup (TheSportsDB public API) ────────────────────────────
// Covers anything the static maps miss: CSL / J-League / Saudi Pro / MLS /
// Brasileirão / national teams / WNBA / NWSL / Champions League pools, etc.
// Module-level cache dedupes concurrent requests and across renders.
type BadgeCacheEntry = string | null;
const badgeCache = new Map<string, BadgeCacheEntry>();
const badgeInflight = new Map<string, Promise<BadgeCacheEntry>>();

function fetchBadge(league: string | undefined, name: string): Promise<BadgeCacheEntry> {
  const key = `${(league ?? "").toLowerCase()}|${name.toLowerCase()}`;
  if (badgeCache.has(key)) return Promise.resolve(badgeCache.get(key) ?? null);
  const existing = badgeInflight.get(key);
  if (existing) return existing;

  const task = fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { teams?: Array<{ strBadge?: string; strLeague?: string; strSport?: string }> } | null) => {
      const teams = json?.teams ?? [];
      if (!teams.length) return null;
      const leagueLc = (league ?? "").toLowerCase();
      // Prefer exact/substring league match; else first result
      const match = leagueLc
        ? teams.find((t) => {
            const tl = (t.strLeague ?? "").toLowerCase();
            return tl && (tl.includes(leagueLc) || leagueLc.includes(tl));
          })
        : null;
      return (match ?? teams[0]).strBadge ?? null;
    })
    .catch(() => null)
    .then((badge) => {
      badgeCache.set(key, badge ?? null);
      badgeInflight.delete(key);
      return badge ?? null;
    });

  badgeInflight.set(key, task);
  return task;
}

type Score = string | number | Record<string, string | number> | null | undefined;

function totalScore(s: Score): string | undefined {
  if (s == null) return undefined;
  if (typeof s === "number") return String(s);
  if (typeof s === "string") return s;
  if (isRecord(s)) {
    const t = (s as Record<string, unknown>).total;
    if (t != null) return String(t);
    const parts = Object.entries(s)
      .filter(([k]) => k.startsWith("part-"))
      .map(([, v]) => Number(v))
      .filter((n) => !Number.isNaN(n));
    if (parts.length) return String(parts.reduce((a, b) => a + b, 0));
  }
  return undefined;
}

function periodScores(s: Score): string[] | null {
  if (!isRecord(s)) return null;
  const parts = Object.entries(s)
    .filter(([k]) => k.startsWith("part-"))
    .sort(([a], [b]) => Number(a.slice(5)) - Number(b.slice(5)))
    .map(([, v]) => String(v));
  return parts.length ? parts : null;
}

function setScores(sets: unknown): string[] {
  if (!isRecord(sets)) return [];
  return Object.entries(sets)
    .filter(([k]) => k.startsWith("set-"))
    .sort(([a], [b]) => Number(a.slice(4)) - Number(b.slice(4)))
    .map(([, v]) => String(v));
}

function statusPill(status?: string): { text: string; cls: string } | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "live") return { text: "LIVE", cls: "bg-red-500 text-white animate-gentle-pulse" };
  if (s === "ft" || s === "final") return { text: "FT", cls: "bg-gray-100 text-gray-600" };
  if (s === "upcoming") return { text: "Upcoming", cls: "bg-blue-50 text-blue-600" };
  return { text: status, cls: "bg-gray-100 text-gray-600" };
}

// ── atoms ────────────────────────────────────────────────────────────────────

// Google Sports thumbnails are gstatic — without no-referrer policy some hosts/CDNs
// block hotlinking. Always set it. Team crests aren't circular (rounded-md), while
// player/driver headshots are (portrait).
const FALLBACK_GRADIENTS = [
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-indigo-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-violet-400 to-purple-500",
  "from-cyan-400 to-sky-500",
  "from-lime-400 to-green-500",
  "from-fuchsia-400 to-rose-500",
];

function TeamLogo({
  url,
  name,
  league,
  size = 20,
  shape = "crest",
}: {
  url?: string;
  name?: string;
  league?: string;
  size?: number;
  shape?: "crest" | "portrait";
}) {
  // Priority: explicit URL > static league map > async TheSportsDB lookup > initials.
  // Sync guess renders without flash for known leagues. Async fallback populates
  // module-level badgeCache and bumps a tick to re-render.
  const syncUrl = url ?? guessTeamLogo(league, name);
  const cacheKey = !syncUrl && name && shape === "crest"
    ? `${(league ?? "").toLowerCase()}|${name.toLowerCase()}`
    : null;
  const [, tick] = useState(0);
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(() => new Set());
  const round = shape === "portrait" ? "rounded-full" : "rounded-md";

  useEffect(() => {
    if (!cacheKey || badgeCache.has(cacheKey) || !name) return;
    let cancelled = false;
    fetchBadge(league, name).then(() => {
      if (!cancelled) tick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, league, name]);

  const dynamicUrl = cacheKey ? badgeCache.get(cacheKey) ?? null : null;
  const displayUrl = syncUrl ?? dynamicUrl ?? undefined;
  const isFailed = displayUrl ? failedUrls.has(displayUrl) : false;

  if (!displayUrl || isFailed) {
    const seed = name ? name.charCodeAt(0) + (name.charCodeAt(name.length - 1) || 0) : 0;
    const grad = FALLBACK_GRADIENTS[seed % FALLBACK_GRADIENTS.length];
    const initials = (name ?? "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
    return (
      <div
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4) }}
        className={`${round} bg-gradient-to-br ${grad} text-white flex items-center justify-center font-bold shrink-0 shadow-sm ring-1 ring-black/5`}
      >
        {initials}
      </div>
    );
  }
  return (
    <img
      src={displayUrl}
      alt={name ?? ""}
      style={{ width: size, height: size }}
      referrerPolicy="no-referrer"
      loading="lazy"
      className={`${round} object-contain shrink-0 ${
        shape === "crest"
          ? "bg-white p-0.5 ring-1 ring-border-light/70"
          : "bg-gray-100 ring-1 ring-border-light/70"
      }`}
      onError={() => {
        const u = displayUrl;
        setFailedUrls((s) => {
          const next = new Set(s);
          next.add(u);
          return next;
        });
      }}
    />
  );
}

function HighlightLink({ link, duration, thumbnail }: { link?: string; duration?: string; thumbnail?: string }) {
  const [failed, setFailed] = useState(false);
  if (!link) return null;
  const thumb = thumbnail && !failed ? thumbnail : null;

  if (thumb) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Watch highlights"
        className="relative block w-[68px] h-[38px] rounded-md overflow-hidden bg-gray-100 shrink-0 ring-1 ring-border-light/70 hover:opacity-90 transition-opacity group"
      >
        <img
          src={thumb}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/40 via-black/10 to-transparent">
          <svg className="w-3.5 h-3.5 text-white drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        {duration && (
          <span className="absolute bottom-0.5 right-0.5 bg-black/75 text-white text-[8px] font-semibold px-1 py-[1px] rounded leading-none tabular-nums">
            {duration}
          </span>
        )}
      </a>
    );
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-medium transition-colors"
      title="Watch highlights"
    >
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      {duration ?? "Highlights"}
    </a>
  );
}

// ── soccer goal / red card summary (§1.5) ────────────────────────────────────

function formatGoalTime(t: unknown): string | null {
  if (!isRecord(t)) return null;
  const minute = asStr(t.minute);
  const stoppage = asStr(t.stoppage);
  if (!minute) return null;
  return stoppage ? `${minute}+${stoppage}'` : `${minute}'`;
}

function MatchEventSummary({
  goals,
  reds,
  align = "left",
}: {
  goals?: Record<string, unknown>[];
  reds?: Record<string, unknown>[];
  align?: "left" | "right" | "center";
}) {
  const hasGoals = goals && goals.length > 0;
  const hasReds = reds && reds.length > 0;
  if (!hasGoals && !hasReds) return null;

  const alignCls = align === "right" ? "items-end text-right" : align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <div className={`mt-1 flex flex-col gap-0.5 text-[10px] text-text-secondary ${alignCls}`}>
      {hasGoals &&
        goals!.map((entry, i) => {
          const player = isRecord(entry.player) ? entry.player : null;
          const name = player ? asStr(player.name) : undefined;
          const times = asArr(entry.goals).map((g) => formatGoalTime(g.in_game_time)).filter(Boolean);
          if (!name) return null;
          return (
            <div key={`g${i}`} className="flex items-center gap-1">
              <span className="text-[9px]">⚽</span>
              <span className="font-medium text-text-primary truncate max-w-[140px]">{name}</span>
              {times.length > 0 && <span className="tabular-nums opacity-80">{times.join(" ")}</span>}
            </div>
          );
        })}
      {hasReds &&
        reds!.map((entry, i) => {
          const player = isRecord(entry.player) ? entry.player : null;
          const name = player ? asStr(player.name) : undefined;
          const times = asArr(entry.red_cards ?? entry.goals).map((g) => formatGoalTime(g.in_game_time)).filter(Boolean);
          if (!name) return null;
          return (
            <div key={`r${i}`} className="flex items-center gap-1">
              <span className="inline-block w-[7px] h-[10px] bg-red-500 rounded-[1px]" />
              <span className="font-medium text-text-primary truncate max-w-[140px]">{name}</span>
              {times.length > 0 && <span className="tabular-nums opacity-80">{times.join(" ")}</span>}
            </div>
          );
        })}
    </div>
  );
}

// ── scenario B: game_spotlight ───────────────────────────────────────────────

function TeamColumn({ team, league, align = "center" }: { team: Record<string, unknown>; league?: string; align?: "center" | "left" | "right" }) {
  const stats = isRecord(team.team_stats) ? team.team_stats : null;
  const wl = stats && asStr(stats.wins) && asStr(stats.losses)
    ? `${asStr(stats.wins)}–${asStr(stats.losses)}`
    : null;
  const goals = asArr(team.goal_summary);
  const reds = asArr(team.red_cards_summary);
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${
      align === "center" ? "items-center" : align === "right" ? "items-end" : "items-start"
    }`}>
      <TeamLogo url={extractThumb(team.thumbnail)} name={asStr(team.name)} league={league} size={52} shape="crest" />
      <div className={`text-[11px] font-semibold text-text-primary leading-tight line-clamp-2 max-w-[120px] ${
        align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"
      }`}>
        {asStr(team.name) ?? "?"}
      </div>
      {wl && <div className="text-[9px] text-text-tertiary tabular-nums">{wl}</div>}
      {(goals.length > 0 || reds.length > 0) && (
        <MatchEventSummary goals={goals} reds={reds} align={align} />
      )}
    </div>
  );
}

function ScoresColumn({ a, b }: { a: Score; b: Score }) {
  const tA = totalScore(a);
  const tB = totalScore(b);
  const pA = periodScores(a);
  const pB = periodScores(b);
  const showPeriods = pA && pB && (pA.length > 1 || pB.length > 1);
  const periodCount = Math.max(pA?.length ?? 0, pB?.length ?? 0);

  return (
    <div className="flex flex-col items-center gap-1.5 px-2">
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-[34px] font-light text-text-primary leading-none">{tA ?? "-"}</span>
        <span className="text-[13px] text-text-tertiary font-light">:</span>
        <span className="text-[34px] font-light text-text-primary leading-none">{tB ?? "-"}</span>
      </div>
      {showPeriods && (
        <div className="flex gap-2 text-[9px] tabular-nums text-text-tertiary">
          {Array.from({ length: periodCount }).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <span className="text-[8px] opacity-60 uppercase">Q{i + 1}</span>
              <span className="text-text-secondary font-medium">{pA?.[i] ?? "-"}</span>
              <span className="text-text-secondary font-medium">{pB?.[i] ?? "-"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GameSpotlight({ data }: { data: Record<string, unknown> }) {
  const teams = asArr(data.teams);
  if (teams.length !== 2) return null;
  const pill = statusPill(asStr(data.status));
  const igt = isRecord(data.in_game_time) ? data.in_game_time : null;
  const igtText = igt
    ? [
        asStr(igt.quarter),
        asStr(igt.time),
        asStr(igt.minute) ? `${asStr(igt.minute)}'` : undefined,
        asStr(igt.stoppage) ? `+${asStr(igt.stoppage)}` : undefined,
      ]
        .filter(Boolean)
        .join(" ")
    : undefined;
  const penalty = asStr(data.penalty_score);
  const highlights = [
    ...(isRecord(data.video_highlights) ? [data.video_highlights] : []),
    ...asArr(data.video_highlight_carousel),
  ];

  return (
    <div className="mt-2 rounded-xl bg-surface border border-border-light relative overflow-hidden">
      {/* top gradient accent */}
      <div className="h-[3px] bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500" />

      <div className="p-3.5">
        {/* meta row */}
        <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
          {asStr(data.league) && (
            <span className="font-bold text-emerald-700 uppercase tracking-wider text-[9px]">
              {asStr(data.league)}
            </span>
          )}
          {asStr(data.stage) && <span className="truncate">{asStr(data.stage)}</span>}
          {asStr(data.date) && <span className="truncate">· {asStr(data.date)}</span>}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {igtText && (
              <span className="text-[10px] font-semibold text-red-600 tabular-nums bg-red-50 px-1.5 py-0.5 rounded">
                {igtText}
              </span>
            )}
            {pill && (
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider ${pill.cls}`}>
                {pill.text}
              </span>
            )}
          </div>
        </div>

        {/* hero team/score row */}
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamColumn team={teams[0]} league={asStr(data.league)} />
          <ScoresColumn a={teams[0].score as Score} b={teams[1].score as Score} />
          <TeamColumn team={teams[1]} league={asStr(data.league)} />
        </div>

        {penalty && (
          <div className="mt-2 text-center text-[10px] text-text-tertiary">Penalties: {penalty}</div>
        )}

        {/* highlights */}
        {highlights.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border-light/60 flex flex-wrap gap-2 justify-center">
            {highlights.map((v, i) => (
              <HighlightLink
                key={i}
                link={asStr(v.link)}
                duration={asStr(v.duration)}
                thumbnail={extractThumb(v.thumbnail)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── scenario A: games[] ──────────────────────────────────────────────────────

function GameRow({ g, defaultLeague }: { g: Record<string, unknown>; defaultLeague?: string }) {
  const teams = asArr(g.teams);
  if (teams.length !== 2) return null;
  const league = asStr(g.tournament) ?? defaultLeague;
  const pill = statusPill(asStr(g.status));
  const vh = isRecord(g.video_highlights) ? g.video_highlights : null;
  const s0 = totalScore(teams[0].score as Score);
  const s1 = totalScore(teams[1].score as Score);
  const isLive = asStr(g.status)?.toLowerCase() === "live";
  const stage = asStr(g.stage);
  const stadium = asStr(g.stadium);
  // Suppress "Regular season" — adds nothing; show knockout/finals stage.
  const stageBadge = stage && !/regular season/i.test(stage) ? stage : null;

  const t0Goals = asArr(teams[0].goal_summary);
  const t0Reds = asArr(teams[0].red_cards_summary);
  const t1Goals = asArr(teams[1].goal_summary);
  const t1Reds = asArr(teams[1].red_cards_summary);
  const hasEvents = t0Goals.length > 0 || t0Reds.length > 0 || t1Goals.length > 0 || t1Reds.length > 0;

  return (
    <div
      className="flex flex-col py-2 border-t border-border-light/60 first:border-t-0"
      title={stadium || undefined}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-[48px] shrink-0 text-[10px] text-text-tertiary leading-tight">
          <div className="font-medium text-text-secondary">{asStr(g.date) ?? ""}</div>
          {asStr(g.time) && <div className="text-[9px] opacity-70">{asStr(g.time)}</div>}
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo url={extractThumb(teams[0].thumbnail)} name={asStr(teams[0].name)} league={league} size={26} shape="crest" />
            <span className="text-[11.5px] font-medium text-text-primary truncate">{asStr(teams[0].name) ?? "?"}</span>
          </div>
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md tabular-nums ${
              isLive ? "bg-red-50" : "bg-background"
            }`}
          >
            <span className="text-[14px] font-bold text-text-primary">{s0 ?? "-"}</span>
            <span className="text-text-tertiary text-[10px]">:</span>
            <span className="text-[14px] font-bold text-text-primary">{s1 ?? "-"}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0 justify-end">
            <span className="text-[11.5px] font-medium text-text-primary truncate text-right">
              {asStr(teams[1].name) ?? "?"}
            </span>
            <TeamLogo url={extractThumb(teams[1].thumbnail)} name={asStr(teams[1].name)} league={league} size={26} shape="crest" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {stageBadge && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-medium whitespace-nowrap">
              {stageBadge}
            </span>
          )}
          {vh && (
            <HighlightLink
              link={asStr(vh.link)}
              duration={asStr(vh.duration)}
              thumbnail={extractThumb(vh.thumbnail)}
            />
          )}
          {pill && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider ${pill.cls}`}>{pill.text}</span>}
        </div>
      </div>

      {hasEvents && (
        <div className="flex gap-3 mt-1 pl-[58px] pr-2">
          <div className="flex-1 min-w-0">
            <MatchEventSummary goals={t0Goals} reds={t0Reds} align="left" />
          </div>
          <div className="flex-1 min-w-0">
            <MatchEventSummary goals={t1Goals} reds={t1Reds} align="right" />
          </div>
        </div>
      )}
    </div>
  );
}

function GamesList({ games, defaultLeague }: { games: Record<string, unknown>[]; defaultLeague?: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? games : games.slice(0, 5);
  return (
    <div className="mt-2">
      {visible.map((g, i) => <GameRow key={i} g={g} defaultLeague={defaultLeague} />)}
      {games.length > 5 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-[10px] text-text-tertiary hover:text-text-secondary">
          {expanded ? "Collapse" : `Show ${games.length - 5} more`}
        </button>
      )}
    </div>
  );
}

// ── scenario C: tennis ───────────────────────────────────────────────────────

function TennisSection({ tables }: { tables: Record<string, unknown> }) {
  const title = asStr(tables.title);
  const games = asArr(tables.games);
  if (!games.length) return null;

  return (
    <div className="mt-2">
      {title && <div className="text-[11px] font-semibold text-text-primary mb-1.5">{title}</div>}
      <div className="space-y-1.5">
        {games.map((g, i) => {
          const players = asArr(g.players);
          if (players.length !== 2) return null;
          const stage = asStr(g.stage);
          return (
            <div key={i} className="bg-background rounded-lg p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary mb-1">
                {asStr(g.date) && <span>{asStr(g.date)}</span>}
                {stage && <span>· {stage}</span>}
                {asStr(g.location) && <span className="truncate">· {asStr(g.location)}</span>}
                {asStr(g.status) && <span className="ml-auto">{asStr(g.status)}</span>}
              </div>
              {players.map((p, j) => {
                const sets = setScores(p.sets);
                return (
                  <div key={j} className="flex items-center gap-2 py-0.5">
                    <TeamLogo url={extractThumb(p.thumbnail)} name={asStr(p.name)} size={24} shape="portrait" />
                    <span className="flex-1 text-[11px] text-text-primary truncate">
                      {asStr(p.name) ?? "?"}
                      {p.ranking != null && <span className="ml-1 text-[9px] text-text-tertiary">#{String(p.ranking)}</span>}
                    </span>
                    <div className="flex gap-1.5 tabular-nums">
                      {sets.map((s, k) => (
                        <span key={k} className="text-[11px] font-semibold text-text-primary min-w-[14px] text-center">{s}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── scenario D: F1 ───────────────────────────────────────────────────────────

function F1Section({ tables }: { tables: Record<string, unknown> }) {
  const title = asStr(tables.title);
  const results = isRecord(tables.results) ? tables.results : null;
  const standings = results ? asArr(results.standings) : [];
  const track = results && isRecord(results.track) ? asStr(results.track.name) : undefined;
  const trackLink = results && isRecord(results.track) ? asStr(results.track.link) : undefined;
  const date = results ? asStr(results.date) : undefined;
  if (!standings.length) return null;

  return (
    <div className="mt-2">
      {(title || track) && (
        <div className="flex items-baseline gap-1.5 mb-1.5">
          {title && <div className="text-[11px] font-semibold text-text-primary">{title}</div>}
          {track && (
            trackLink ? (
              <a
                href={trackLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-emerald-700 hover:text-emerald-800"
              >
                · {track}
              </a>
            ) : (
              <div className="text-[10px] text-text-tertiary">· {track}</div>
            )
          )}
          {date && <div className="text-[10px] text-text-tertiary ml-auto">{date}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-[9px] text-text-tertiary uppercase tracking-wider">
              <th className="text-left font-medium pr-2 py-1">#</th>
              <th className="text-left font-medium pr-2 py-1">Driver</th>
              <th className="text-left font-medium pr-2 py-1">Team</th>
              <th className="text-right font-medium pr-2 py-1">Time</th>
              <th className="text-right font-medium py-1">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((r, i) => (
              <tr key={i} className="border-t border-border-light/60">
                <td className="py-1 pr-2 text-text-tertiary">{asStr(r.rank) ?? i + 1}</td>
                <td className="py-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <TeamLogo url={extractThumb(r.thumbnail)} name={asStr(r.name)} size={22} shape="portrait" />
                    <span className="text-text-primary truncate">{asStr(r.name) ?? "?"}</span>
                    {asStr(r.vehicle_number) && (
                      <span className="text-[9px] text-text-tertiary bg-background px-1 rounded">{asStr(r.vehicle_number)}</span>
                    )}
                  </div>
                </td>
                <td className="py-1 pr-2 text-text-secondary truncate">{asStr(r.team) ?? ""}</td>
                <td className="py-1 pr-2 text-right text-text-secondary">{asStr(r.time) ?? ""}</td>
                <td className="py-1 text-right font-semibold text-text-primary">{asStr(r.points) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── scenario E: player stats ─────────────────────────────────────────────────

function statsColumns(rows: Record<string, unknown>[]): string[] {
  const cols = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) cols.add(k);
  // Keep year first if present
  const ordered = Array.from(cols).sort((a, b) => (a === "year" ? -1 : b === "year" ? 1 : 0));
  return ordered;
}

function StatsTable({ games, heading }: { games: Record<string, unknown>[]; heading?: string }) {
  if (!games.length) return null;
  const nested = new Set(["game", "team"]);
  const cols = statsColumns(games).filter((k) => !nested.has(k));
  return (
    <div className="mt-1.5">
      {heading && <div className="text-[10px] font-semibold text-text-secondary mb-1">{heading}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] tabular-nums">
          <thead>
            <tr className="text-[9px] text-text-tertiary uppercase tracking-wider">
              {games[0].game != null && <th className="text-left font-medium pr-2 py-1">Match</th>}
              {cols.map((c) => (
                <th key={c} className="text-right font-medium pr-2 py-1">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {games.map((r, i) => {
              const game = isRecord(r.game) ? r.game : null;
              return (
                <tr key={i} className="border-t border-border-light/60">
                  {games[0].game != null && (
                    <td className="py-1 pr-2 text-text-secondary whitespace-nowrap">
                      {game ? `${asStr(game.versus) ?? ""} ${asStr(game.date) ?? ""}`.trim() : ""}
                    </td>
                  )}
                  {cols.map((c) => (
                    <td key={c} className="py-1 pr-2 text-right text-text-primary">{asStr(r[c]) ?? "-"}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// F1 "next race" mini — the shape SerpAPI actually returns for F1 queries in practice
// (not the documented scenario D with results.standings[]). Compact single-line card.
function F1NextRaceSection({ tables }: { tables: Record<string, unknown> }) {
  const raceName = asStr(tables.title);
  const games = asArr(tables.games);
  if (!raceName && !games.length) return null;

  return (
    <div className="mt-2 flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface border border-border-light">
      <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12h4l2-6h8l2 6h4" />
          <circle cx="7" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        {raceName && <div className="text-[11.5px] font-semibold text-text-primary truncate">{raceName}</div>}
        {games.length > 0 && (
          <div className="text-[10px] text-text-tertiary truncate">
            {games
              .flatMap((g) =>
                [asStr(g.date), asStr(g.stage), asStr(g.status), asStr(g.venue)].filter(Boolean)
              )
              .join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function StatsSection({ tables }: { tables: Record<string, unknown> | Record<string, unknown>[] }) {
  if (Array.isArray(tables)) {
    return (
      <div className="mt-2 space-y-3">
        {tables.map((t, i) => (
          <StatsTable key={i} games={asArr((t as Record<string, unknown>).games)} heading={asStr((t as Record<string, unknown>).title)} />
        ))}
      </div>
    );
  }
  // soccer: dict keyed by club name — skip entries whose value isn't an array
  // (avoids leaking scalar keys like "title"/"games" as headings when the shape
  // is actually something else that slipped through our scenario detection).
  const clubEntries = Object.entries(tables).filter(([, v]) => Array.isArray(v));
  if (!clubEntries.length) return null;
  return (
    <div className="mt-2 space-y-3">
      {clubEntries.map(([club, entries]) => (
        <div key={club}>
          <div className="text-[11px] font-semibold text-text-primary mb-1">{club}</div>
          {asArr(entries).map((t, i) => (
            <StatsTable key={i} games={asArr(t.games)} heading={asStr(t.tournament)} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── scenario F: league standings ─────────────────────────────────────────────

function standingsColumns(rows: Record<string, unknown>[]): string[] {
  const skip = new Set(["team", "last_5"]);
  const cols = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!skip.has(k)) cols.add(k);
  // Natural order for common football keys
  const pref = ["pos", "mp", "w", "d", "l", "gf", "ga", "gd", "pts", "pct", "gb"];
  return Array.from(cols).sort((a, b) => {
    const ia = pref.indexOf(a); const ib = pref.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function StandingsTable({ rows, heading, league }: { rows: Record<string, unknown>[]; heading?: string; league?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows.length) return null;
  const cols = standingsColumns(rows);
  const visible = expanded ? rows : rows.slice(0, 8);
  return (
    <div>
      {heading && <div className="text-[11px] font-semibold text-text-primary mb-1">{heading}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] tabular-nums">
          <thead>
            <tr className="text-[9px] text-text-tertiary uppercase tracking-wider">
              <th className="text-left font-medium pr-2 py-1">Team</th>
              {cols.map((c) => (
                <th key={c} className="text-right font-medium pr-2 py-1">{c}</th>
              ))}
              {rows[0].last_5 != null && <th className="text-right font-medium py-1">Form</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const team = isRecord(r.team) ? r.team : null;
              const last5 = Array.isArray(r.last_5) ? (r.last_5 as string[]) : [];
              return (
                <tr key={i} className="border-t border-border-light/60">
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <TeamLogo url={team ? extractThumb(team.thumbnail) : undefined} name={team ? asStr(team.name) : undefined} league={league ?? heading} size={20} shape="crest" />
                      <span className="text-text-primary truncate">{team ? asStr(team.name) : "?"}</span>
                    </div>
                  </td>
                  {cols.map((c) => (
                    <td key={c} className="py-1 pr-2 text-right text-text-primary">{asStr(r[c]) ?? "-"}</td>
                  ))}
                  {rows[0].last_5 != null && (
                    <td className="py-1 text-right whitespace-nowrap">
                      <span className="inline-flex gap-0.5">
                        {last5.map((f, k) => {
                          const ch = String(f).toLowerCase();
                          const cls = ch.startsWith("w") ? "bg-emerald-500" : ch.startsWith("l") ? "bg-red-400" : "bg-gray-300";
                          return <span key={k} className={`w-1.5 h-1.5 rounded-full ${cls}`} />;
                        })}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-[10px] text-text-tertiary hover:text-text-secondary">
          {expanded ? "Collapse" : `Show ${rows.length - 8} more`}
        </button>
      )}
    </div>
  );
}

function StandingsSection({ league, other }: { league: Record<string, unknown>; other: Record<string, unknown>[] }) {
  const divisions = asArr(league.divisions);
  const standings = asArr(league.standings);
  return (
    <div className="mt-2 space-y-3">
      {divisions.length > 0
        ? divisions.map((d, i) => (
            <StandingsTable key={i} rows={asArr(d.standings)} heading={asStr(d.name) ?? asStr(league.name)} league={asStr(league.name)} />
          ))
        : <StandingsTable rows={standings} heading={asStr(league.name)} league={asStr(league.name)} />}
      {other.map((o, i) => (
        <StandingsTable
          key={i}
          rows={asArr(isRecord(o.standings) || Array.isArray(o.standings) ? o.standings : [])}
          heading={asStr(o.name)}
          league={asStr(o.name)}
        />
      ))}
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export function SportsResultsRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query = (toolInput.query as string) ?? "";
  const envelope = toolResult;
  const isError = envelope && envelope.error === true;

  // Envelope (per updated backend docs): { sports_results, answer_box, knowledge_graph }
  // — any combination, all optional. Fall back to treating toolResult itself as
  // sports_results if none of the envelope keys are present (handles rollout lag).
  const hasEnvelopeShape = !!envelope && !isError && (
    "sports_results" in envelope || "answer_box" in envelope || "knowledge_graph" in envelope
  );
  const sportsResults = hasEnvelopeShape
    ? (isRecord(envelope!.sports_results) ? envelope!.sports_results : null)
    : (envelope && !isError ? envelope : null);
  const answerBox = hasEnvelopeShape && isRecord(envelope!.answer_box) ? envelope!.answer_box : null;
  const knowledgeGraph = hasEnvelopeShape && isRecord(envelope!.knowledge_graph) ? envelope!.knowledge_graph : null;

  // sports_results may be non-null but hold no renderable content — treat as empty.
  const hasSportsContent = !!sportsResults && (
    !!sportsResults.title || !!sportsResults.league || !!sportsResults.tables
    || asArr(sportsResults.games).length > 0 || !!sportsResults.game_spotlight
  );
  const hasContent = hasSportsContent || !!answerBox || !!knowledgeGraph;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm max-w-[560px]">
      {/* header */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7M21 16v5h-5M21 21l-7-7M3 8V3h5M3 3l7 7" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Sports Results</span>
        {query && <span className="text-[11px] text-text-secondary truncate min-w-0 flex-1">&ldquo;{query}&rdquo;</span>}
        {!envelope && <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Searching...</span>}
      </div>

      {isError && (
        <div className="mt-2 text-[11px] text-red-600">{asStr(envelope!.message) ?? "Failed to fetch sports results."}</div>
      )}

      {envelope && !isError && !hasContent && (
        <div className="mt-2 text-[11px] text-text-tertiary">No sports results found.</div>
      )}

      {sportsResults && <SportsResultsBody data={sportsResults} />}
      {answerBox && <AnswerBoxPanel box={answerBox} stacked={!!sportsResults} />}
      {knowledgeGraph && <KnowledgeGraphPanel kg={knowledgeGraph} stacked={!!sportsResults || !!answerBox} />}
    </div>
  );
}

// ── panels for answer_box / knowledge_graph ─────────────────────────────────

function AnswerBoxPanel({ box, stacked }: { box: Record<string, unknown>; stacked?: boolean }) {
  const title = asStr(box.title);
  const body = asStr(box.snippet) ?? asStr(box.answer) ?? asStr(box.result);
  const link = asStr(box.link);
  const source = asStr(box.source) ?? asStr(box.displayed_link);
  const thumb = extractThumb(box.thumbnail);

  if (!title && !body && !thumb) return null;

  return (
    <div className={`${stacked ? "mt-3 pt-3 border-t border-border-light/60" : "mt-2"}`}>
      <div className="flex items-start gap-3">
        {thumb && (
          <img
            src={thumb}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-14 h-14 rounded-md object-cover shrink-0 ring-1 ring-border-light/60 bg-gray-50"
          />
        )}
        <div className="min-w-0 flex-1">
          {title && <div className="text-[12.5px] font-semibold text-text-primary leading-snug">{title}</div>}
          {body && <div className="mt-1 text-[11.5px] text-text-secondary leading-relaxed">{body}</div>}
          {(source || link) && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-tertiary">
              {source && <span className="truncate">{source}</span>}
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Source →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Keys that are structural (title/description/thumbnail/etc.) or noise —
// everything else on the KG root is treated as a user-facing attribute.
const KG_STRUCTURAL_KEYS = new Set([
  "title", "type", "description", "source", "thumbnail", "header_images",
  "attributes", "entity_type", "kgmid",
  "knowledge_graph_search_link", "serpapi_knowledge_graph_search_link",
]);

interface KGAttribute { key: string; value: string; link?: string }

function collectKgAttributes(kg: Record<string, unknown>): KGAttribute[] {
  const out: KGAttribute[] = [];
  const seen = new Set<string>();

  const push = (k: string, v: unknown, linkKey?: string) => {
    const val = asStr(v);
    if (!val || seen.has(k)) return;
    seen.add(k);
    const links = linkKey ? asArr(kg[linkKey]) : [];
    const firstLink = links.length > 0 ? asStr(links[0].link) : undefined;
    out.push({ key: k, value: val, link: firstLink });
  };

  // Documented `attributes{}` dict (spec-compliant shape)
  if (isRecord(kg.attributes)) {
    for (const [k, v] of Object.entries(kg.attributes)) push(k, v);
  }
  // Actual shape observed: attributes flattened onto the KG root, each with
  // an optional parallel `<key>_links[]` array. Skip structural keys.
  for (const [k, v] of Object.entries(kg)) {
    if (KG_STRUCTURAL_KEYS.has(k) || k.endsWith("_links") || k.endsWith("_link")) continue;
    push(k, v, `${k}_links`);
  }
  return out;
}

function KnowledgeGraphPanel({ kg, stacked }: { kg: Record<string, unknown>; stacked?: boolean }) {
  const title = asStr(kg.title);
  const type = asStr(kg.type);
  const description = asStr(kg.description);
  const thumb = extractThumb(kg.thumbnail);
  const source = isRecord(kg.source) ? kg.source : null;
  const sourceName = source ? asStr(source.name)?.trim() : undefined;
  const sourceLink = source ? asStr(source.link) : undefined;
  const headerImages = asArr(kg.header_images)
    .map((h) => asStr((h as Record<string, unknown>).image) ?? extractThumb(h))
    .filter((u): u is string => !!u);
  const attributes = collectKgAttributes(kg);

  if (!title && !description && !thumb && attributes.length === 0 && headerImages.length === 0) return null;

  // Entity-type → portrait (people) vs crest (teams/leagues/events)
  const isPerson = type ? /(driver|player|coach|manager|athlete|boxer|racer)/i.test(type) : false;
  const shape: "portrait" | "crest" = isPerson ? "portrait" : "crest";

  return (
    <div className={`${stacked ? "mt-3 pt-3 border-t border-border-light/60" : "mt-2"}`}>
      {headerImages.length > 0 && (
        <div className="flex gap-1 mb-2 overflow-x-auto -mx-1 px-1">
          {headerImages.slice(0, 6).map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-16 rounded-md object-cover shrink-0 ring-1 ring-border-light/60 bg-gray-50"
            />
          ))}
        </div>
      )}
      <div className="flex items-start gap-3">
        {thumb && <TeamLogo url={thumb} name={title} size={48} shape={shape} />}
        <div className="min-w-0 flex-1">
          {title && <div className="text-[13px] font-semibold text-text-primary leading-tight truncate">{title}</div>}
          {type && <div className="text-[10px] text-emerald-700 font-medium uppercase tracking-wider mt-0.5">{type}</div>}
          {description && <div className="mt-1 text-[11.5px] text-text-secondary leading-relaxed line-clamp-3">{description}</div>}
        </div>
      </div>

      {attributes.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
          {attributes.slice(0, 12).map(({ key, value, link }) => (
            <div key={key} className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[9px] text-text-tertiary uppercase tracking-wider shrink-0 w-24 truncate">{humanizeKey(key)}</span>
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
          ))}
        </div>
      )}

      {sourceLink && (
        <div className="mt-2 text-[10px] text-text-tertiary">
          <a
            href={sourceLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            {sourceName ? `${sourceName} →` : "Source →"}
          </a>
        </div>
      )}
    </div>
  );
}

function SportsResultsBody({ data }: { data: Record<string, unknown> }) {
  const title = asStr(data.title);
  const rankings = asStr(data.rankings) ?? asStr(data.ranking);
  const country = asStr(data.country);
  const profession = asStr(data.profession); // §1.9 stats (soccer only)
  const season = asStr(data.season); // §1.10 standings
  const round = asStr(data.round); // §1.10 standings
  const thumbnail = extractThumb(data.thumbnail);
  const league = isRecord(data.league) ? data.league : null;
  const tables = data.tables;
  const games = asArr(data.games);
  const spotlight = isRecord(data.game_spotlight) ? data.game_spotlight : null;

  const subtitleParts = [rankings, country, profession, season, round].filter(Boolean);

  // If sports_results is essentially empty, render nothing (envelope-level empty
  // state handles the "no results" message).
  if (!title && !league && !tables && !games.length && !spotlight) return null;

  const isTennis = isRecord(tables) && Array.isArray((tables as Record<string, unknown>).games) && !!(asArr((tables as Record<string, unknown>).games)[0]?.players);
  const isF1 = isRecord(tables) && isRecord((tables as Record<string, unknown>).results) && Array.isArray(((tables as Record<string, unknown>).results as Record<string, unknown>).standings);
  // F1 "next race" compact shape observed in practice:
  // {title, ranking?, tables: {title: "GP name", games: [{date|stage|...}]}}
  // Detect when tables is a dict with `title` + optional `games` (no results/players).
  const isF1NextRace = !isTennis && !isF1
    && isRecord(tables)
    && typeof (tables as Record<string, unknown>).title === "string"
    && !isRecord((tables as Record<string, unknown>).results);
  const isStats = tables && !isTennis && !isF1 && !isF1NextRace;

  // Hero thumbnail shape: tennis (country present) & F1 (ranking text) are players/drivers,
  // everything else is team/league crest.
  const heroShape: "crest" | "portrait" = country || (rankings && /formula|f1/i.test(rankings)) ? "portrait" : "crest";

  return (
    <>
      {/* title row */}
      {(title || subtitleParts.length > 0) && (
        <div className="flex items-center gap-2.5 mt-2.5">
          {thumbnail && <TeamLogo url={thumbnail} name={title} league={title} size={36} shape={heroShape} />}
          <div className="min-w-0">
            {title && <div className="text-[14px] font-semibold text-text-primary leading-tight truncate">{title}</div>}
            {subtitleParts.length > 0 && (
              <div className="text-[10px] text-text-tertiary truncate mt-0.5">
                {subtitleParts.join(" · ")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* scenario F: standings */}
      {league && <StandingsSection league={league} other={asArr(data.other_leagues)} />}

      {/* scenario B: spotlight */}
      {spotlight && <GameSpotlight data={spotlight} />}

      {/* scenario D (documented F1) */}
      {isF1 && isRecord(tables) && <F1Section tables={tables} />}

      {/* F1 next-race compact (real SerpAPI shape for F1/GP queries) */}
      {isF1NextRace && isRecord(tables) && <F1NextRaceSection tables={tables} />}

      {/* scenario C */}
      {isTennis && isRecord(tables) && <TennisSection tables={tables} />}

      {/* scenario E */}
      {isStats && !isF1 && !isTennis && !isF1NextRace && (
        <StatsSection tables={tables as Record<string, unknown> | Record<string, unknown>[]} />
      )}

      {/* scenario A: games list */}
      {games.length > 0 && <GamesList games={games} defaultLeague={title} />}
    </>
  );
}
