const epochByConv: Record<string, number> = {};

/**
 * 丢弃过期的 listConversationSkillSelections 结果。
 * 在发起 List、本地改动选用、或 Set 成功后递增，避免慢请求用空列表覆盖刚写入/刚选中的 store。
 */
export function bumpConversationSkillHydrateEpoch(convId: string): number {
  if (!convId) return 0;
  const n = (epochByConv[convId] ?? 0) + 1;
  epochByConv[convId] = n;
  return n;
}

export function getConversationSkillHydrateEpoch(convId: string): number {
  if (!convId) return 0;
  return epochByConv[convId] ?? 0;
}
