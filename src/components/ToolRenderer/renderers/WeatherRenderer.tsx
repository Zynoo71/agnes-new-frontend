import type { ToolRenderProps } from "../registry";

// ── Filled SVG icons ──

function IconSun({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="14" fill="#FBBF24" />
      <g stroke="#FBBF24" strokeWidth="3" strokeLinecap="round">
        <path d="M32 6v8M32 50v8M6 32h8M50 32h8M14.1 14.1l5.6 5.6M44.3 44.3l5.6 5.6M14.1 49.9l5.6-5.6M44.3 19.7l5.6-5.6" />
      </g>
    </svg>
  );
}

function IconMoon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M42 12a20 20 0 100 40 16 16 0 010-40z" fill="#A5B4FC" />
      <circle cx="36" cy="26" r="2" fill="#818CF8" opacity={0.5} />
      <circle cx="42" cy="36" r="1.5" fill="#818CF8" opacity={0.4} />
    </svg>
  );
}

function IconCloud({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M48 42H18a10 10 0 01-1.5-19.9A14 14 0 0144 22a12 12 0 014 20z" fill="#94A3B8" />
      <path d="M48 42H18a10 10 0 01-1.5-19.9A14 14 0 0144 22a12 12 0 014 20z" fill="white" opacity={0.15} />
    </svg>
  );
}

function IconCloudSun({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="22" cy="24" r="10" fill="#FBBF24" />
      <g stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round">
        <path d="M22 8v5M22 35v3M8 24h5M34 24h2M12.3 14.3l3.5 3.5M28.2 14.3l-3.5 3.5" />
      </g>
      <path d="M50 46H22a9 9 0 01-1.2-17.9A12 12 0 0146 28a10 10 0 014 18z" fill="#CBD5E1" />
      <path d="M50 46H22a9 9 0 01-1.2-17.9A12 12 0 0146 28a10 10 0 014 18z" fill="white" opacity={0.2} />
    </svg>
  );
}

function IconRain({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M48 36H18a10 10 0 01-1.5-19.9A14 14 0 0144 16a12 12 0 014 20z" fill="#64748B" />
      <path d="M48 36H18a10 10 0 01-1.5-19.9A14 14 0 0144 16a12 12 0 014 20z" fill="white" opacity={0.1} />
      <g stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round">
        <path d="M22 42l-2 6M32 42l-2 6M42 42l-2 6M27 44l-2 6M37 44l-2 6" />
      </g>
    </svg>
  );
}

function IconThunder({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M48 34H18a10 10 0 01-1.5-19.9A14 14 0 0144 14a12 12 0 014 20z" fill="#475569" />
      <path d="M35 36l-4 10h6l-4 10" stroke="#FBBF24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <g stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" opacity={0.6}>
        <path d="M22 40l-1.5 5M42 40l-1.5 5" />
      </g>
    </svg>
  );
}

function IconSnow({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M48 36H18a10 10 0 01-1.5-19.9A14 14 0 0144 16a12 12 0 014 20z" fill="#94A3B8" />
      <g fill="#BFDBFE">
        <circle cx="22" cy="46" r="2.5" /><circle cx="32" cy="44" r="2.5" />
        <circle cx="42" cy="46" r="2.5" /><circle cx="27" cy="52" r="2" />
        <circle cx="37" cy="52" r="2" />
      </g>
    </svg>
  );
}

function IconMist({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <g stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" opacity={0.7}>
        <path d="M12 20h40M8 30h48M14 40h36M18 50h28" />
      </g>
    </svg>
  );
}

type IconComponent = typeof IconSun;

interface IconDef { Icon: IconComponent; bg: string }

const ICON_MAP: Record<string, IconDef> = {
  "01d": { Icon: IconSun,      bg: "from-amber-400 via-orange-300 to-yellow-300" },
  "01n": { Icon: IconMoon,     bg: "from-indigo-500 via-purple-500 to-slate-600" },
  "02d": { Icon: IconCloudSun, bg: "from-sky-400 via-blue-300 to-amber-200" },
  "02n": { Icon: IconCloudSun, bg: "from-indigo-400 via-slate-500 to-slate-600" },
  "03d": { Icon: IconCloud,    bg: "from-slate-300 via-gray-300 to-slate-400" },
  "03n": { Icon: IconCloud,    bg: "from-slate-500 via-slate-600 to-gray-600" },
  "04d": { Icon: IconCloud,    bg: "from-gray-400 via-slate-400 to-gray-500" },
  "04n": { Icon: IconCloud,    bg: "from-slate-600 via-gray-600 to-slate-700" },
  "09d": { Icon: IconRain,     bg: "from-blue-400 via-sky-400 to-slate-400" },
  "09n": { Icon: IconRain,     bg: "from-blue-600 via-slate-600 to-indigo-700" },
  "10d": { Icon: IconRain,     bg: "from-sky-400 via-blue-400 to-slate-400" },
  "10n": { Icon: IconRain,     bg: "from-blue-600 via-indigo-600 to-slate-700" },
  "11d": { Icon: IconThunder,  bg: "from-slate-500 via-gray-500 to-amber-400" },
  "11n": { Icon: IconThunder,  bg: "from-slate-700 via-gray-700 to-amber-500" },
  "13d": { Icon: IconSnow,     bg: "from-sky-200 via-blue-200 to-slate-300" },
  "13n": { Icon: IconSnow,     bg: "from-blue-400 via-indigo-400 to-slate-500" },
  "50d": { Icon: IconMist,     bg: "from-gray-300 via-slate-300 to-gray-400" },
  "50n": { Icon: IconMist,     bg: "from-gray-500 via-slate-500 to-gray-600" },
};

const DEFAULT_ICON: IconDef = { Icon: IconCloudSun, bg: "from-sky-400 via-blue-300 to-slate-400" };

function getIcon(code: string): IconDef {
  return ICON_MAP[code] ?? DEFAULT_ICON;
}

// ── Temperature bar color by avg temp ──

function tempBarGradient(min: number, max: number): string {
  const avg = (min + max) / 2;
  if (avg <= 0)  return "from-blue-300 to-blue-400";
  if (avg <= 10) return "from-sky-300 to-sky-400";
  if (avg <= 18) return "from-emerald-300 to-teal-400";
  if (avg <= 25) return "from-amber-300 to-orange-400";
  return "from-orange-400 to-red-400";
}

// ── Helpers ──

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface CurrentWeather {
  city: string; country: string; temperature: number; feels_like: number;
  humidity: number; pressure: number; description: string; icon: string;
  wind_speed: number; visibility: number; sunrise: number; sunset: number;
}

interface ForecastDay {
  date: string; weekday: string; temperature: number; min_temperature: number;
  max_temperature: number; feels_like: number; humidity: number;
  wind_speed: number; description: string; icon: string;
}

// ── Component ──

export function WeatherRenderer({ toolResult }: ToolRenderProps) {
  if (!toolResult) {
    return (
      <div className="rounded-2xl border border-border-light bg-surface-alt p-4 text-sm shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-md bg-sky-50 flex items-center justify-center">
            <IconCloud size={14} />
          </div>
          <span className="text-xs font-medium text-text-primary">Weather</span>
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Fetching...</span>
        </div>
      </div>
    );
  }

  const current = toolResult.current as unknown as CurrentWeather | undefined;
  const forecast = (toolResult.forecast ?? []) as unknown as ForecastDay[];
  if (!current) return null;

  const { Icon, bg } = getIcon(current.icon);
  const allTemps = forecast.flatMap((d) => [d.min_temperature, d.max_temperature]);
  const scaleMin = Math.min(...allTemps);
  const scaleMax = Math.max(...allTemps);
  const scaleRange = scaleMax - scaleMin || 1;

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-border-light flex w-full max-w-[520px]">
      {/* ── Left: Current ── */}
      <div className={`bg-gradient-to-br ${bg} relative overflow-hidden w-[200px] shrink-0`}>
        <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-black/5 blur-xl" />

        <div className="relative px-4 py-4 flex flex-col h-full">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-white/65 uppercase tracking-widest truncate">
                {current.city}
              </div>
              <div className="text-[40px] font-extralight text-white leading-none tracking-tight mt-1">
                {Math.round(current.temperature)}°
              </div>
            </div>
            <div className="opacity-90 drop-shadow-md shrink-0">
              <Icon size={40} />
            </div>
          </div>

          <div className="text-[12px] text-white/85 capitalize mt-1 font-medium leading-tight">{current.description}</div>
          <div className="text-[10px] text-white/50">Feels like {Math.round(current.feels_like)}°</div>

          {/* Stats row */}
          <div className="mt-auto pt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-white/[0.12]">
            <HeroStat icon="sunrise" value={formatTime(current.sunrise)} />
            <HeroStat icon="sunset" value={formatTime(current.sunset)} />
            <HeroStat icon="humidity" value={`${current.humidity}%`} />
            <HeroStat icon="wind" value={`${current.wind_speed.toFixed(1)} m/s`} />
          </div>
        </div>
      </div>

      {/* ── Right: Forecast ── */}
      {forecast.length > 0 && (
        <div className="flex-1 bg-surface min-w-0">
          <div className="px-3 pt-3 pb-0.5">
            <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-widest">Forecast</div>
          </div>
          <div className="px-3 pb-2">
            {forecast.map((day, i) => {
              const dayDef = getIcon(day.icon);
              const barLeft = ((day.min_temperature - scaleMin) / scaleRange) * 100;
              const barWidth = ((day.max_temperature - day.min_temperature) / scaleRange) * 100;
              const isToday = i === 0;

              return (
                <div
                  key={day.date}
                  className={`flex items-center gap-1.5 h-[28px] ${i > 0 ? "border-t border-border-light/60" : ""}`}
                >
                  <div className="w-8 shrink-0">
                    {isToday ? (
                      <span className="text-[11px] font-semibold text-text-primary">Today</span>
                    ) : (
                      <span className="text-[11px] text-text-secondary">{day.weekday.slice(0, 3)}</span>
                    )}
                  </div>

                  <div className="w-4 shrink-0 flex justify-center">
                    <dayDef.Icon size={14} />
                  </div>

                  <span className="w-6 text-right text-[10px] tabular-nums text-text-tertiary shrink-0">
                    {Math.round(day.min_temperature)}°
                  </span>

                  <div className="flex-1 h-1 rounded-full bg-border-light/80 relative mx-0.5">
                    <div
                      className={`absolute h-full rounded-full bg-gradient-to-r ${tempBarGradient(day.min_temperature, day.max_temperature)}`}
                      style={{ left: `${barLeft}%`, width: `${Math.max(barWidth, 8)}%` }}
                    />
                  </div>

                  <span className="w-6 text-[10px] tabular-nums text-text-primary font-medium shrink-0">
                    {Math.round(day.max_temperature)}°
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const STAT_ICONS: Record<string, React.ReactNode> = {
  sunrise: <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 3v2m0 14v2m7.07-15.07l-1.41 1.41M6.34 17.66l-1.41 1.41M21 12h-2M5 12H3" /></svg>,
  sunset: <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 3v2m0 14v2m7.07-15.07l-1.41 1.41M6.34 17.66l-1.41 1.41M21 12h-2M5 12H3" /><path d="M16 12a4 4 0 01-8 0" /></svg>,
  humidity: <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" /></svg>,
  wind: <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2" /></svg>,
};

function HeroStat({ icon, value }: { icon: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-white/60">
      {STAT_ICONS[icon]}
      <span className="text-[10px] tabular-nums font-medium">{value}</span>
    </div>
  );
}
