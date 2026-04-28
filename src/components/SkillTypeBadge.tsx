/** Skill 类型（guide / tool …）标签，放在来源标识（SourceBadge / Official）后面。 */
export function SkillTypeBadge({ skillType }: { skillType?: string }) {
  const raw = (skillType ?? "guide").trim().toLowerCase();
  let label: string;
  let cls: string;
  if (raw === "tool") {
    label = "Tool";
    cls = "bg-violet-500/10 text-violet-700";
  } else if (raw === "guide") {
    label = "Guide";
    cls = "bg-sky-500/10 text-sky-700";
  } else {
    label = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Guide";
    cls = "bg-text-tertiary/15 text-text-secondary";
  }
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${cls}`}>{label}</span>
  );
}
