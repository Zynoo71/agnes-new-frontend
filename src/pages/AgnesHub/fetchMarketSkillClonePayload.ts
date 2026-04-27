import { agentClient } from "@/grpc/client";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

export type SkillCreatePrefill = {
  name: string;
  summary: string;
  files: Record<string, string>;
};

function stripRpcPrefix(msg: string): string {
  return msg.replace(/^\[\w+\]\s*/, "");
}

/**
 * Load the latest published snapshot of a market skill so it can be pasted into
 * the "create skill" editor as a new draft (new name, new owner).
 */
export async function fetchMarketSkillClonePayload(skill: SkillInfo): Promise<SkillCreatePrefill> {
  const verResp = await agentClient.listSkillVersions({ skillId: skill.id });
  const publishedVer = verResp.latestPublishedVersion?.trim() || "";
  if (!publishedVer) {
    throw new Error("This skill has no published version yet — try again after it is approved.");
  }

  const vmeta = verResp.versions.find((v) => v.version === publishedVer);
  const baseName = (vmeta?.name || skill.name).trim() || "skill";
  const name = baseName.toLowerCase().includes("(copy)")
    ? baseName
    : `${baseName} (copy)`;
  const summary = (vmeta?.summary || skill.summary || "").trim();

  const listResp = await agentClient.listSkillFiles({
    skillId: skill.id,
    version: publishedVer,
  });
  const resolvedVer = listResp.version?.trim() || publishedVer;
  const paths = listResp.files.filter((f) => !f.isDir).map((f) => f.path);

  const contents = await Promise.all(
    paths.map(async (path) => {
      const r = await agentClient.getSkillFileContent({
        skillId: skill.id,
        path,
        version: resolvedVer,
      });
      return { path, content: r.content };
    }),
  );

  const files: Record<string, string> = {};
  for (const { path, content } of contents) {
    files[path] = content;
  }

  if (Object.keys(files).length === 0) {
    throw new Error("No files found for this published version.");
  }

  return { name, summary, files };
}

export async function fetchMarketSkillClonePayloadSafe(
  skill: SkillInfo,
): Promise<SkillCreatePrefill | { error: string }> {
  try {
    return await fetchMarketSkillClonePayload(skill);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: stripRpcPrefix(msg) };
  }
}
