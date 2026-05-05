/**
 * Optional **client-side** extras (comma-separated per tab), merged **after** server rules:
 * legacy ``skill_disallowed_names`` applies **only on ``super``**; other tabs use Nacos
 * ``skill_disallowed_names_by_agent_type`` + this map.
 *
 * Prefer Nacos ``llm.yaml`` so all clients stay consistent without redeploy.
 */
export const AGENT_TAB_IDS = ["super", "search", "research", "slide", "design", "sheet"] as const;
export type AgentTabId = (typeof AGENT_TAB_IDS)[number];

/** Tab id → comma-separated builtin skill names to disallow for that tab */
export const AGENT_TYPE_ADDITIONAL_DISALLOWED: Partial<Record<AgentTabId, string>> = {
  // search: "game-aigc",
};

export function syncExtraContextDisallowedSkills(
  prev: Record<string, string>,
  agentType: string,
): Record<string, string> {
  const next = { ...prev };
  const add = AGENT_TYPE_ADDITIONAL_DISALLOWED[agentType as AgentTabId];
  if (add?.trim()) {
    next.additional_disallowed_skill_names = add.trim();
  } else {
    delete next.additional_disallowed_skill_names;
  }
  return next;
}
