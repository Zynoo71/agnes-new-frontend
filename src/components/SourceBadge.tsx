/**
 * 来源标签（Official / GitHub / Community …）
 * - 实色底 + 同色系细边框；圆角 4px；字重常规（分类标）。
 * - gitee / session / 未知：中性灰，避免抢色。
 */
const SOURCE_STYLES: Record<string, string> = {
  agnes:
    "bg-[#FFF7E6] text-[#D46B08] border border-[#F2DDB5] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)]",
  github:
    "bg-[#F0F5FF] text-[#2F54EB] border border-[#BFCEFB] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)]",
  /** Community / User：极致中性 Slate，弱化存在感 */
  user:
    "bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.75)]",
  gitee:
    "bg-[#FAFAFA] text-[#595959] border border-[#D9D9D9] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]",
  session:
    "bg-[#FAFAFA] text-[#595959] border border-[#D9D9D9] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]",
};

const FALLBACK_STYLE =
  "bg-[#FAFAFA] text-[#595959] border border-[#D9D9D9] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]";

const BADGE_SHELL = "inline-block text-[10px] font-normal rounded-[4px] px-1.5 py-0.5 leading-tight";

const DEFAULT_LABELS: Record<string, string> = {
  agnes: "Official",
  github: "GitHub",
  gitee: "Gitee",
  user: "Community",
  session: "会话已选",
};

export interface SourceBadgeProps {
  source: string;
  /** `source === "user"` 时文案，默认 Community；管理后台可传 User */
  userLabel?: string;
}

export function SourceBadge({ source, userLabel }: SourceBadgeProps) {
  let label: string;
  if (source === "user") {
    label = userLabel ?? DEFAULT_LABELS.user;
  } else {
    label = DEFAULT_LABELS[source] ?? (source.trim() || "Unknown");
  }
  const cls = SOURCE_STYLES[source] ?? FALLBACK_STYLE;
  return <span className={`${BADGE_SHELL} ${cls}`}>{label}</span>;
}
