import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { agentClient } from "@/grpc/client";
import { SourceBadge } from "@/components/SourceBadge";
import { SkillTypeBadge } from "@/components/SkillTypeBadge";
import { useMarketSkillsStore } from "@/stores/marketSkillsStore";
import type {
  SkillFileNode,
  SkillInfo,
  SkillVersionInfo,
} from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

// ---------------------------------------------------------------------------
// 文件树折叠
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string; // 完整相对路径
  isDir: boolean;
  size: number;
  children: TreeNode[];
}

function buildTree(files: SkillFileNode[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, size: 0, children: [] };
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let cur = root;
    let acc = "";
    parts.forEach((seg, i) => {
      acc = acc ? `${acc}/${seg}` : seg;
      const isLast = i === parts.length - 1;
      let next = cur.children.find((c) => c.name === seg);
      if (!next) {
        next = {
          name: seg,
          path: acc,
          isDir: !isLast,
          size: isLast ? Number(f.size) : 0,
          children: [],
        };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  // 排序：目录优先，再按字母
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root;
}

/** Resolve ``![](foo/bar.png)`` relative to the current markdown file path (same rules as browser URL resolution). */
function resolveSkillAssetPath(markdownFilePath: string, rawSrc: string): "external" | string {
  const s = rawSrc.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return "external";
  try {
    const dir = markdownFilePath.includes("/")
      ? markdownFilePath.slice(0, markdownFilePath.lastIndexOf("/"))
      : "";
    const base = `http://skill.local/${dir ? `${dir}/` : ""}`;
    const u = new URL(s.replace(/^\.\//, ""), base);
    return u.pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

function SkillMarkdownImg({
  src,
  alt,
  skillId,
  version,
  mdPath,
}: {
  src?: string;
  alt?: string;
  skillId: string;
  version: string;
  mdPath: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "err">("loading");
  const [dataUrl, setDataUrl] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!src?.trim()) {
      setState("err");
      setMsg("Missing src");
      return;
    }
    const resolved = resolveSkillAssetPath(mdPath, src);
    if (resolved === "external") {
      setDataUrl(src.trim());
      setState("ready");
      return;
    }
    if (!resolved) {
      setState("err");
      setMsg("Invalid image path");
      return;
    }
    let cancelled = false;
    setState("loading");
    agentClient
      .getSkillFileContent({ skillId, path: resolved, version })
      .then((resp) => {
        if (cancelled) return;
        if (resp.contentType.startsWith("image/")) {
          setDataUrl(`data:${resp.contentType};base64,${resp.content}`);
          setState("ready");
        } else if (resp.content.startsWith("⚠️")) {
          setMsg(resp.content.split("\n")[0] ?? "Cannot preview");
          setState("err");
        } else {
          setMsg("Not an image");
          setState("err");
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setMsg(e instanceof Error ? e.message : String(e));
        setState("err");
      });
    return () => {
      cancelled = true;
    };
  }, [src, skillId, version, mdPath]);

  if (state === "loading") {
    return <span className="text-xs text-text-tertiary italic">Loading image…</span>;
  }
  if (state === "err") {
    return (
      <span className="text-xs text-red-500/90 block my-2" title={msg}>
        [image] {msg}
      </span>
    );
  }
  return (
    <img
      src={dataUrl}
      alt={alt ?? ""}
      className="max-w-full h-auto rounded border border-border-light my-2"
      loading="lazy"
    />
  );
}

function fileLanguage(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx")) return "markdown";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "bash";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".sql")) return "sql";
  return "text";
}

function FileIcon({ name, isDir }: { name: string; isDir: boolean }) {
  if (isDir) {
    return (
      <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
      </svg>
    );
  }
  const lower = name.toLowerCase();
  const isMd = lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx");
  return (
    <svg
      className={`w-3.5 h-3.5 shrink-0 ${isMd ? "text-blue-500" : "text-text-tertiary"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  const isActive = !node.isDir && selected === node.path;

  const handleClick = () => {
    if (node.isDir) onToggle(node.path);
    else onSelect(node.path);
  };

  return (
    <>
      <button
        onClick={handleClick}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={`w-full text-left flex items-center gap-1.5 py-1 pr-2 text-xs
                    ${isActive
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"}`}
      >
        {node.isDir ? (
          <svg
            className={`w-2.5 h-2.5 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M9 6l6 6-6 6V6z" />
          </svg>
        ) : (
          <span className="w-2.5 shrink-0" />
        )}
        <FileIcon name={node.name} isDir={node.isDir} />
        <span className="truncate">{node.name}</span>
      </button>
      {node.isDir && isOpen &&
        node.children.map((c) => (
          <TreeRow
            key={c.path}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

interface Props {
  skill: SkillInfo;
  onClose: () => void;
  /**
   * Market 视角：把版本下拉只展示「已发布」版本，并强制默认 latest_published。
   * Owner 自己的 draft 是「正在编辑」的私有产物，不该出现在 Market 详情里
   * （否则别人 / 自己在 Market 浏览时能直接看到尚未审核通过的内容）。
   * MyHub / Admin 等 owner-context 的入口默认不传，会保留原行为（owner 可看 draft）。
   */
  marketView?: boolean;
  /**
   * Admin 视角：admin 不是真实用户，没有「我的 Skills」概念。
   * 设置为 true 时隐藏底部的 "Add to My Skills" 按钮，仅留 Close。
   * 同时跳过任何依赖 user 身份的状态文案（"You created this skill" 等）。
   */
  adminView?: boolean;
}

function defaultSelectedPath(files: SkillFileNode[]): string {
  // 优先 SKILL.md / README.md（大小写不敏感），否则取第一个文件
  const lower = (s: string) => s.toLowerCase();
  const skill = files.find((f) => lower(f.path) === "skill.md");
  if (skill) return skill.path;
  const readme = files.find((f) => lower(f.path) === "readme.md");
  if (readme) return readme.path;
  return files[0]?.path ?? "";
}

export function SkillDetailModal({ skill, onClose, marketView = false, adminView = false }: Props) {
  const { addToMine, addingId } = useMarketSkillsStore(
    useShallow((s) => ({ addToMine: s.addToMine, addingId: s.addingId })),
  );
  const isAdding = addingId === skill.id;
  // owner 把自己的 skill 从 My Skills 移除后也应允许重新添加（后端 add_skill_to_mine
  // 在 service.py 里专门为 owner 走了 visibility 跳过分支），所以这里只看 isInMine。
  const canAdd = !skill.isInMine;
  // GitHub 导入的 skill 即使 isOwner=true 也不算"自己创作"，文案不强调 owner 身份。
  const ownerLabel = skill.isOwner && skill.source !== "github";

  const [files, setFiles] = useState<SkillFileNode[] | null>(null);
  const [filesError, setFilesError] = useState<string>("");
  const [filesLoading, setFilesLoading] = useState(false);

  const [selectedPath, setSelectedPath] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [content, setContent] = useState<string>("");
  const [contentType, setContentType] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string>("");

  // 版本下拉：选中 version 为空 = 让后端走默认（owner 看 latest_version，其它人看 latest_published）
  const [versions, setVersions] = useState<SkillVersionInfo[] | null>(null);
  const [versionsError, setVersionsError] = useState<string>("");
  const [activeVersion, setActiveVersion] = useState<string>("");

  // 拉版本列表（一次性）
  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    setVersionsError("");
    setActiveVersion("");
    agentClient
      .listSkillVersions({ skillId: skill.id })
      .then((resp) => {
        if (cancelled) return;
        // Market view：哪怕调用方是 owner，也只允许看「published」版本 ——
        // draft 是私有编辑产物，市场浏览不应曝光（否则审核流程就被绕过了）。
        const visible = marketView
          ? resp.versions.filter((v) => v.isPublished)
          : resp.versions;
        setVersions(visible);
        // 默认选中：
        //   - market view：永远 latest_published
        //   - owner 或 Hub admin 详情（adminView + x-admin-token）：优先 latest_version（含 draft）
        //   - 其它访客：latest_published（不暴露 draft；后端 ListSkillVersions 也不会下发 draft）
        const def = marketView
          ? resp.latestPublishedVersion
          : skill.isOwner || adminView
            ? resp.latestVersion || resp.latestPublishedVersion
            : resp.latestPublishedVersion;
        setActiveVersion(def || "");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setVersionsError(msg.replace(/^\[\w+\]\s*/, ""));
      });
    return () => {
      cancelled = true;
    };
  }, [skill.id, skill.isOwner, marketView, adminView]);

  // 拉文件列表（version 变就重拉）
  useEffect(() => {
    let cancelled = false;
    setFilesLoading(true);
    setFilesError("");
    setFiles(null);
    setSelectedPath("");
    agentClient
      .listSkillFiles({ skillId: skill.id, version: activeVersion })
      .then((resp) => {
        if (cancelled) return;
        setFiles(resp.files);
        if (resp.version && resp.version !== activeVersion) {
          // 后端解析后的实际 version（比如调用方传空）—— 同步回来便于 GetSkillFileContent 用同一 version
          setActiveVersion(resp.version);
        }
        const initial = defaultSelectedPath(resp.files);
        setSelectedPath(initial);
        const next = new Set<string>();
        const parts = initial.split("/");
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          next.add(acc);
        }
        setExpanded(next);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setFilesError(msg.replace(/^\[\w+\]\s*/, ""));
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skill.id, activeVersion]);

  // 拉选中文件内容
  useEffect(() => {
    if (!selectedPath) {
      setContent("");
      setContentType("");
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setContentError("");
    agentClient
      .getSkillFileContent({ skillId: skill.id, path: selectedPath, version: activeVersion })
      .then((resp) => {
        if (cancelled) return;
        setContent(resp.content);
        setContentType(resp.contentType);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setContentError(msg.replace(/^\[\w+\]\s*/, ""));
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skill.id, activeVersion, selectedPath]);

  const tree = useMemo(() => (files ? buildTree(files) : null), [files]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const isImagePreview = contentType.startsWith("image/");
  const isMarkdown =
    !isImagePreview &&
    (contentType.startsWith("text/markdown") || /\.(md|markdown|mdx)$/i.test(selectedPath));

  // 详情页表头的 name/summary 必须跟随当前选中版本走 history 快照，否则会出现
  // "顶部还是 V2 draft 的 22，但下面文件内容是 V1 published 的 1" 这种错位。
  // 旧 history 行 name 字段可能为空（迁移前数据），fallback 到 SkillInfo.name。
  const currentVersionMeta = activeVersion
    ? versions?.find((v) => v.version === activeVersion)
    : undefined;
  const displayName = currentVersionMeta?.name || skill.name;
  const displaySummary = currentVersionMeta?.summary || skill.summary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-5xl mx-4 flex flex-col max-h-[85vh] h-[85vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-start gap-3 border-b border-border-light">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-base font-semibold text-text-primary truncate">{displayName}</h3>
              <SourceBadge source={skill.source} />
              <SkillTypeBadge skillType={skill.skillType} />
              {versions && versions.length > 0 && (
                <select
                  value={activeVersion}
                  onChange={(e) => setActiveVersion(e.target.value)}
                  className="text-[11px] border border-border rounded px-1.5 py-0.5 bg-surface
                             text-text-secondary focus:outline-none focus:border-accent
                             cursor-pointer"
                  title="Switch version"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      {v.version}
                      {v.isPublished ? " · published" : v.isDraft ? " · draft" : ""}
                    </option>
                  ))}
                </select>
              )}
              {versionsError && (
                <span className="text-[10px] text-red-500" title={versionsError}>
                  versions error
                </span>
              )}
            </div>
            {displaySummary && (
              <p className="text-xs text-text-tertiary line-clamp-2 leading-relaxed">{displaySummary}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body: tree + content */}
        <div className="flex-1 flex min-h-0">
          {/* Tree */}
          <div className="w-60 shrink-0 border-r border-border-light overflow-y-auto py-2 bg-surface-alt">
            {filesLoading && <div className="px-3 text-xs text-text-tertiary">Loading files...</div>}
            {filesError && (
              <div className="px-3 text-xs text-red-500">{filesError}</div>
            )}
            {!filesLoading && !filesError && tree && tree.children.length === 0 && (
              <div className="px-3 text-xs text-text-tertiary">No files in this skill.</div>
            )}
            {tree?.children.map((c) => (
              <TreeRow
                key={c.path}
                node={c}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                selected={selectedPath}
                onSelect={setSelectedPath}
              />
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {!selectedPath ? (
              <div className="h-full flex items-center justify-center text-sm text-text-tertiary">
                Select a file to preview
              </div>
            ) : contentLoading ? (
              <div className="px-6 py-4 text-xs text-text-tertiary">Loading {selectedPath}...</div>
            ) : contentError ? (
              <div className="px-6 py-4 text-xs text-red-500">{contentError}</div>
            ) : (
              <div className="px-6 py-5">
                <div className="text-[11px] text-text-tertiary mb-3 font-mono">{selectedPath}</div>
                {isImagePreview ? (
                  <img
                    src={`data:${contentType};base64,${content}`}
                    alt={selectedPath}
                    className="max-w-full h-auto rounded border border-border-light"
                  />
                ) : isMarkdown ? (
                  <div className="prose prose-sm max-w-none prose-headings:text-text-primary prose-p:text-text-secondary prose-li:text-text-secondary prose-strong:text-text-primary prose-code:text-accent prose-pre:bg-surface-alt prose-pre:text-text-primary">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        img: ({ src, alt }) => (
                          <SkillMarkdownImg
                            src={typeof src === "string" ? src : undefined}
                            alt={typeof alt === "string" ? alt : undefined}
                            skillId={skill.id}
                            version={activeVersion}
                            mdPath={selectedPath}
                          />
                        ),
                      }}
                    >
                      {content}
                    </Markdown>
                  </div>
                ) : (
                  <pre className="text-xs leading-relaxed text-text-primary bg-surface-alt rounded-lg p-4 overflow-x-auto">
                    <code className={`language-${fileLanguage(selectedPath)}`}>{content}</code>
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-2 border-t border-border-light">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-text-secondary border border-border rounded-lg
                       hover:bg-surface-hover transition-colors"
          >
            Close
          </button>
          {/* Admin 视角不需要 "Add to My Skills"：admin 不是真实用户，没有「我的」概念。
               官方账号（owner='agnes'）也没有加入/不加入的语义。 */}
          {adminView ? null : skill.isInMine ? (
            <span className="px-4 py-1.5 text-sm text-text-tertiary">
              {ownerLabel ? "You created this skill" : "Already in My Skills"}
            </span>
          ) : (
            <>
              {ownerLabel && (
                <span className="px-2 py-1.5 text-xs text-text-tertiary italic">
                  Created by you
                </span>
              )}
              <button
                onClick={() => canAdd && !isAdding && addToMine(skill.id)}
                disabled={isAdding}
                className="px-4 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                           hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isAdding ? "Adding..." : "Add to My Skills"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
