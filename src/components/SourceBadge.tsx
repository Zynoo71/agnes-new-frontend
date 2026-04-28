/** 来源标签 — 与主题 accent 同色系的浅色底（与侧栏选中项 `bg-accent/10 text-accent` 同思路，略加深一点便于辨认） */
const BADGE_STYLE = "bg-accent/15 text-accent border border-accent/25";

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
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${BADGE_STYLE}`}>{label}</span>
  );
}
