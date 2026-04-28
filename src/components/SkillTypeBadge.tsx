/**
 * Guide / Tool — 次要辅助：空心描边（无填充），字重常规。
 */
const OUTLINED =
  "inline-block border border-[#D9D9D9] bg-transparent text-[#595959] text-[10px] font-normal rounded-[4px] px-1.5 py-0.5 leading-tight";

export function SkillTypeBadge({ skillType }: { skillType?: string }) {
  const raw = (skillType ?? "guide").trim().toLowerCase();
  let label: string;
  if (raw === "tool") {
    label = "Tool";
  } else if (raw === "guide") {
    label = "Guide";
  } else {
    label = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Guide";
  }
  return <span className={`${OUTLINED} shrink-0`}>{label}</span>;
}
