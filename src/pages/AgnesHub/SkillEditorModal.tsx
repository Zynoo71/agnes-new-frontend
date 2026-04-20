import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { agentClient } from "@/grpc/client";
import { useMySkillsStore } from "@/stores/mySkillsStore";
import type { SkillCreatePrefill } from "./fetchMarketSkillClonePayload";

const REQUIRED_FILES = ["README.md", "SKILL.md", "LICENSE"] as const;
type RequiredFile = (typeof REQUIRED_FILES)[number];
const ALLOWED_GENERATED_FILES = new Set<string>([
  "README.md",
  "SKILL.md",
  "LICENSE",
  "examples/example.md",
  "references/reference.md",
]);

const PLACEHOLDER_README = `# My Skill

A short description of what this skill is for and when it's useful.

## Usage

Tell the user (and the agent) when to invoke this skill and what to expect.
`;

const PLACEHOLDER_SKILL = `# My Skill

> One-paragraph summary that the agent reads to decide whether to use this skill.

## When to use

- Bullet 1
- Bullet 2

## Steps

1. Step one
2. Step two
`;

const PLACEHOLDER_LICENSE = `MIT License

Copyright (c) ${new Date().getFullYear()} <Your Name>

Permission is hereby granted, free of charge, to any person obtaining a copy ...
`;

const PLACEHOLDER_GENERIC = "# New file\n\nWrite something useful here.\n";

function placeholderFor(path: string): string {
  if (path === "README.md") return PLACEHOLDER_README;
  if (path === "SKILL.md") return PLACEHOLDER_SKILL;
  if (path === "LICENSE") return PLACEHOLDER_LICENSE;
  return PLACEHOLDER_GENERIC;
}

interface FileMap {
  [path: string]: string;
}

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** 验证单段名字（不含 /）。 */
function validateSegment(seg: string): string | null {
  const s = seg.trim();
  if (!s) return "Name is required";
  if (s === "." || s === "..") return "Invalid name";
  if (s.length > 64) return "Name too long (max 64)";
  if (/[<>:"|?*\\/\x00-\x1f]/.test(s)) return "Invalid character in name";
  return null;
}

// ---------------------------------------------------------------------------
// 文件树渲染
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  fullPath: string;       // 文件: 路径；文件夹: 路径无尾斜杠
  isDir: boolean;
  required?: boolean;
  filled?: boolean;       // 文件: trim 后内容非空
  children?: TreeNode[];  // 仅文件夹
}

function buildTree(files: FileMap, dirs: Set<string>): TreeNode[] {
  // 先把所有路径的中间目录都铺出来，并入 dirs 集合视图
  const allDirs = new Set<string>(dirs);
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      allDirs.add(acc);
    }
  }

  const childrenOf = (parent: string): TreeNode[] => {
    const dirNodes: TreeNode[] = [];
    for (const d of allDirs) {
      if (dirname(d) !== parent) continue;
      dirNodes.push({
        name: basename(d),
        fullPath: d,
        isDir: true,
        children: childrenOf(d),
      });
    }
    const fileNodes: TreeNode[] = [];
    for (const path of Object.keys(files)) {
      if (dirname(path) !== parent) continue;
      const isReq = (REQUIRED_FILES as readonly string[]).includes(path);
      fileNodes.push({
        name: basename(path),
        fullPath: path,
        isDir: false,
        required: isReq,
        filled: (files[path] || "").trim().length > 0,
      });
    }
    // folder 字母序在上；file: 三必填固定置顶（按 README/SKILL/LICENSE 顺序），其余字母序
    dirNodes.sort((a, b) => a.name.localeCompare(b.name));
    fileNodes.sort((a, b) => {
      const ai = REQUIRED_FILES.indexOf(a.fullPath as RequiredFile);
      const bi = REQUIRED_FILES.indexOf(b.fullPath as RequiredFile);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.name.localeCompare(b.name);
    });
    return [...dirNodes, ...fileNodes];
  };

  return childrenOf("");
}

interface FileTreeProps {
  nodes: TreeNode[];
  depth?: number;
  selected: string;
  expanded: Set<string>;
  disabled: boolean;
  newRow: { parent: string; kind: "file" | "folder"; name: string } | null;
  onToggle: (dir: string) => void;
  onSelect: (path: string) => void;
  onAdd: (parent: string, kind: "file" | "folder") => void;
  onDelete: (node: TreeNode) => void;
  onNewRowChange: (name: string) => void;
  onNewRowCommit: () => void;
  onNewRowCancel: () => void;
}

function FileTree({
  nodes,
  depth = 0,
  selected,
  expanded,
  disabled,
  newRow,
  onToggle,
  onSelect,
  onAdd,
  onDelete,
  onNewRowChange,
  onNewRowCommit,
  onNewRowCancel,
}: FileTreeProps) {
  return (
    <div>
      {nodes.map((node) => {
        const indent = { paddingLeft: `${depth * 12 + 8}px` };
        if (node.isDir) {
          const isOpen = expanded.has(node.fullPath);
          return (
            <div key={`d:${node.fullPath}`}>
              <div
                className="group flex items-center gap-1 py-1 pr-2 rounded cursor-pointer
                           text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                style={indent}
                onClick={() => onToggle(node.fullPath)}
              >
                <svg
                  className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-3.5 h-3.5 shrink-0 text-text-tertiary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
                </svg>
                <span className="text-xs font-medium truncate flex-1">{node.name}/</span>
                {!disabled && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdd(node.fullPath, "file"); }}
                      title="New markdown file"
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded
                                 text-text-tertiary hover:text-accent hover:bg-accent/10
                                 flex items-center justify-center transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdd(node.fullPath, "folder"); }}
                      title="New folder"
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded
                                 text-text-tertiary hover:text-accent hover:bg-accent/10
                                 flex items-center justify-center transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(node); }}
                      title="Delete folder"
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded
                                 text-text-tertiary hover:text-red-500 hover:bg-red-500/10
                                 flex items-center justify-center transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              {isOpen && (
                <>
                  <FileTree
                    nodes={node.children || []}
                    depth={depth + 1}
                    selected={selected}
                    expanded={expanded}
                    disabled={disabled}
                    newRow={newRow}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    onAdd={onAdd}
                    onDelete={onDelete}
                    onNewRowChange={onNewRowChange}
                    onNewRowCommit={onNewRowCommit}
                    onNewRowCancel={onNewRowCancel}
                  />
                  {newRow && newRow.parent === node.fullPath && (
                    <NewRow
                      depth={depth + 1}
                      kind={newRow.kind}
                      name={newRow.name}
                      onChange={onNewRowChange}
                      onCommit={onNewRowCommit}
                      onCancel={onNewRowCancel}
                    />
                  )}
                </>
              )}
            </div>
          );
        }

        const isReq = node.required;
        return (
          <div
            key={`f:${node.fullPath}`}
            className={`group flex items-center gap-1 py-1 pr-2 rounded cursor-pointer
              ${selected === node.fullPath
                ? "bg-accent/10 text-accent"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"}`}
            style={indent}
            onClick={() => onSelect(node.fullPath)}
          >
            <span className="w-3 shrink-0" />
            <svg className="w-3.5 h-3.5 shrink-0 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-xs font-mono truncate flex-1">{node.name}</span>
            {isReq && !node.filled && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Required — content is empty" />
            )}
            {!isReq && !disabled && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(node); }}
                title="Delete file"
                className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-red-500"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NewRow({
  depth,
  kind,
  name,
  onChange,
  onCommit,
  onCancel,
}: {
  depth: number;
  kind: "file" | "folder";
  name: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1 py-1 pr-2"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span className="w-3 shrink-0" />
      <svg
        className="w-3.5 h-3.5 shrink-0 text-text-tertiary"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        {kind === "folder" ? (
          <path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
        ) : (
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
        )}
      </svg>
      <input
        autoFocus
        value={name}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        // 没填名字就失焦（点开了又点开 / 点别处）= 用户放弃，不该弹"Name is required"
        // 错误条留在屏幕底部不消失。只有在填了内容时 blur 才走 commit 校验。
        onBlur={() => (name.trim() ? onCommit() : onCancel())}
        placeholder={kind === "folder" ? "folder-name" : "filename.md"}
        className="flex-1 px-2 py-0.5 text-[11px] font-mono border border-accent rounded
                   bg-surface focus:outline-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agnes Help — 编辑器左下角的彩虹流光按钮 + 弹窗
// 仅在 create 模式下展示；点击后打开 AgnesHelpModal，让用户用一段自然语言
// 描述他想要的 skill；调用后端生成接口拿到 3~5 个文件并合并进当前文件树。
// 后端 RPC 尚未实现 —— 这里 generateSkillFiles 是占位，会抛出"coming soon"。
// ---------------------------------------------------------------------------

// Placeholder 直接当作"留白引导"——首段是引导句（替代之前外面的斜体），下面是 5 点示例。
// 用户开始输入后由原生 placeholder 行为自动消失。
const AGNES_HELP_PLACEHOLDER_LINES = [
  "Let Agnes help you craft your own skill — describe what you want to build, in as much detail as you can. The richer the prompt, the better the result.",
  "",
  "Agnes will produce up to five files for you:",
  "  1. SKILL.md  — instructions Agnes reads to know how to respond.",
  "  2. README.md — what humans see when browsing your skill.",
  "  3. LICENSE  — author signature; defaults to \"Author unspecified\" if omitted.",
  "  4. examples/example.md  — sample Q&A showing how the skill should behave.",
  "  5. references/reference.md — supporting reference material and citations.",
];

const AGNES_HELP_PLACEHOLDER = AGNES_HELP_PLACEHOLDER_LINES.join("\n");
// Tooltip 在 placeholder 末尾再补一行参考链接，方便用户回看灵感来源；
// 不放进 textarea 是因为 placeholder 越精简越优雅，链接放在"提示"里更合适。
const AGNES_HELP_TOOLTIP = [
  ...AGNES_HELP_PLACEHOLDER_LINES,
  "",
  "Reference a great guide-type skill: https://github.com/alchaincyf/steve-jobs-skill",
].join("\n");
// env: VITE_AGNES_HELP_MAX（默认 5000）。
// ⚠️ 必须与后端 AGNES_HELP_CONTENT_MAX_LEN 保持一致，否则前端能输入但后端拒绝。
const AGNES_HELP_MAX = Number(import.meta.env.VITE_AGNES_HELP_MAX) || 5000;

interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * AgnesHelp 真实 RPC 调用（spec §6.7 / §11.3.18 → GenerateSkillFiles）。
 *
 * - skillType 来自外层 SkillEditorModal Step1 的选择（一期只有 "guide"，"tool"
 *   后端 prompt 还是占位空串，会返回 INVALID_ARGUMENT，前端把错误原样冒出来即可）。
 * - 后端校验三件套（SKILL.md / README.md / LICENSE），不齐返回
 *   ``MISSING_CORE_CONTENT: ...``；前端 handleGenerate 又会再校一次，双保险。
 */
// LLM 一把吐 5 段 Markdown 的 JSON，30~120s 是常态。
// 后端 agnes_core TimeoutInterceptor 默认 30s（仅当上游不带 deadline 时生效），
// 这里显式带 grpc-timeout，让拦截器走 context.time_remaining() 透传的上游 deadline。
// env: VITE_AGNES_HELP_TIMEOUT_MS（默认 5 * 60 * 1000 = 5min）。
// ⚠️ 必须 ≥ 后端 AGNES_HELP_LLM_HTTP_TIMEOUT_SEC * 1000，否则前端先超时会看不到
// 真实 LLM 错误，只拿到 DEADLINE_EXCEEDED。
const AGNES_HELP_TIMEOUT_MS =
  Number(import.meta.env.VITE_AGNES_HELP_TIMEOUT_MS) || 5 * 60 * 1000;

async function generateSkillFiles(
  skillType: string,
  content: string,
): Promise<GeneratedFile[]> {
  const resp = await agentClient.generateSkillFiles(
    { skillType, content },
    { timeoutMs: AGNES_HELP_TIMEOUT_MS },
  );
  return resp.files.map((f) => ({ path: f.path, content: f.content }));
}

interface AgnesHelpButtonProps {
  disabled: boolean;
  onClick: () => void;
}

function AgnesHelpButton({ disabled, onClick }: AgnesHelpButtonProps) {
  return (
    <div className="relative shrink-0 group">
      {/* 彩虹流光环：外层渐变 + 内层白底按钮，padding 形成"边框"。
           disabled 时把 opacity 加在外层（彩虹+白底一起淡），不能加在内层 button
           —— 否则白色内层半透明会让外层彩虹"透"出来变成"内部炫彩填充"。 */}
      <div
        className={`rainbow-border p-[1.5px] rounded-full shadow-sm transition-opacity ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="px-3 py-1.5 rounded-full bg-surface text-xs font-semibold
                     text-text-primary flex items-center gap-1.5
                     hover:bg-surface-hover transition-colors
                     disabled:cursor-not-allowed"
        >
          <svg
            className="w-3.5 h-3.5 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
            />
          </svg>
          AgnesHelp
        </button>
      </div>
      <div
        className="pointer-events-none absolute bottom-full left-0 mb-2 px-2.5 py-1.5
                   text-[11px] text-white bg-text-primary/90 rounded-md whitespace-nowrap
                   opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
      >
        Let Agnes help you craft your own skill
      </div>
    </div>
  );
}

interface AgnesHelpModalProps {
  /** 由外层 Editor 传入；一期固定 "guide"，"tool" 上线后切到对应模版。 */
  skillType: string;
  onClose: () => void;
  onAccepted: (files: GeneratedFile[]) => void;
}

function AgnesHelpModal({ skillType, onClose, onAccepted }: AgnesHelpModalProps) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Esc 关闭：避免用户因为找不到 × 而困在弹窗里。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generating) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [generating, onClose]);

  const charCount = prompt.length;
  const canSubmit = prompt.trim().length > 0 && !generating;

  const handleGenerate = async () => {
    if (!canSubmit) return;
    setError("");
    setGenerating(true);
    try {
      const files = await generateSkillFiles(skillType, prompt.trim());
      // 防御式校验：与后端约束对齐 —— 三个 core 文件必须齐全，否则视为"缺少核心内容"。
      const present = new Set(files.map((f) => f.path));
      const missing = (REQUIRED_FILES as readonly string[]).filter((p) => !present.has(p));
      if (missing.length > 0 || files.length < 3) {
        throw new Error(
          missing.length > 0
            ? `Missing core content: ${missing.join(", ")}`
            : "Missing core content: at least 3 files (SKILL.md, README.md, LICENSE) are required.",
        );
      }
      onAccepted(files);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^\[\w+\]\s*/, ""));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* 比父弹窗更深一档的遮罩，避免与 SkillEditorModal 的 black/40 看起来一样 */}
      <div className="absolute inset-0 bg-black/55" onClick={() => !generating && onClose()} />

      {/* 比 SkillEditorModal（max-w-4xl=896px / 720px）显著小一档，
           制造清晰的"上层弹窗"层级感，避免和下层边缘重合的视觉拥挤。 */}
      <div
        className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col"
        style={{ height: "min(580px, 78vh)" }}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border-light">
          <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <svg
              className="w-4 h-4 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
              />
            </svg>
            AgnesHelp
          </h3>

          <div className="flex items-center gap-1">
            {/* 问号：hover 浮出和 placeholder 一致的示例，方便用户看清"应当怎么写" */}
            <div className="relative group">
              <button
                type="button"
                className="w-7 h-7 rounded-full text-text-tertiary hover:text-text-primary
                           hover:bg-surface-hover flex items-center justify-center transition-colors"
                aria-label="Show prompt example"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                  />
                </svg>
              </button>
              <div
                className="pointer-events-none absolute right-0 top-full mt-2 w-96 p-3 rounded-lg
                           bg-text-primary/95 text-white text-[11px] leading-relaxed font-mono
                           opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-10
                           whitespace-pre-line break-words"
              >
                {AGNES_HELP_TOOLTIP}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="w-7 h-7 rounded-full text-text-tertiary hover:text-text-primary
                         hover:bg-surface-hover flex items-center justify-center transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body：整个白色区域 = 输入区，无独立边框。
             ⚠️ 关键：必须加 .fixed-size 类，否则会命中 index.css 全局规则
             `textarea { max-height: 200px; field-sizing: content }`，导致无论怎么
             设 height/flex 都被顶在 200px 高（之前调了几小时的元凶）。
             .fixed-size 走 `:not(.fixed-size)` 分支，跳过全局自动尺寸规则。 */}
        <div className="flex-1 min-h-0 relative">
          <textarea
            ref={taRef}
            value={prompt}
            onChange={(e) => {
              const v = e.target.value;
              setPrompt(v.length > AGNES_HELP_MAX ? v.slice(0, AGNES_HELP_MAX) : v);
            }}
            disabled={generating}
            placeholder={AGNES_HELP_PLACEHOLDER}
            maxLength={AGNES_HELP_MAX}
            className="fixed-size subtle-scrollbar absolute inset-0 w-full h-full resize-none
                       px-5 py-4 text-sm leading-relaxed font-mono
                       bg-transparent text-text-primary placeholder:text-text-tertiary/70
                       border-0 focus:outline-none focus:ring-0
                       disabled:opacity-60"
          />

          {error && (
            <div className="absolute left-5 right-5 bottom-3 text-xs text-red-500
                            bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-light flex items-center justify-between gap-3">
          <span className="text-[11px] text-text-tertiary tabular-nums">
            {charCount} / {AGNES_HELP_MAX}
          </span>

          {/* 与 AgnesHelpButton 完全同款：彩虹胶囊 + sparkle 图标 + xs 字号。
               关键：disabled 时 opacity 加在外层 wrapper（彩虹+白底一起淡），
               不能加在内层 button —— 否则白色内层半透明会让外层彩虹"透"出来，
               看起来变成"内部炫彩填充"，破坏了"白底 + 彩虹边"的设计。 */}
          <div
            className={`rainbow-border p-[1.5px] rounded-full shadow-sm transition-opacity ${
              canSubmit ? "" : "opacity-50"
            }`}
          >
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canSubmit}
              className="px-3 py-1.5 rounded-full bg-surface text-xs font-semibold
                         text-text-primary flex items-center gap-1.5
                         hover:bg-surface-hover transition-colors
                         disabled:cursor-not-allowed"
            >
              {generating ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              ) : (
                <svg
                  className="w-3.5 h-3.5 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                  />
                </svg>
              )}
              {generating ? "Generating..." : "Start generating"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step1：类型选择（仅 create 用）
// ---------------------------------------------------------------------------

function Step1({ onPickGuide }: { onPickGuide: () => void }) {
  return (
    <div className="px-6 py-6 grid grid-cols-2 gap-3">
      <button
        onClick={onPickGuide}
        className="flex flex-col items-start gap-2 p-5 rounded-xl border border-border
                   hover:border-accent/40 hover:bg-accent/5 transition-all text-left"
      >
        <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-text-primary">Guide</div>
        <div className="text-xs text-text-tertiary leading-relaxed">
          Markdown-only skill. Works with the agent via SKILL.md instructions and reference docs.
        </div>
      </button>
      <div
        className="flex flex-col items-start gap-2 p-5 rounded-xl border border-border bg-surface
                   opacity-50 cursor-not-allowed"
      >
        <div className="w-9 h-9 rounded-lg bg-text-tertiary/15 text-text-tertiary flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.224 5.183a2.25 2.25 0 01-3.182 0L1.93 17.94a2.25 2.25 0 010-3.182l5.183-4.224m6.857-3.95l1.527-1.527M11.42 15.17a6 6 0 01-8.25-8.25l4.5 4.5m3.75 3.75L19.5 12m0 0l-3.75-3.75M19.5 12H8.25" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-text-primary">Toolkit</div>
        <div className="text-xs text-text-tertiary leading-relaxed">Code + tools skill. Coming soon.</div>
        <span className="text-[9px] uppercase tracking-wider text-text-tertiary mt-1">Soon</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor（create + edit 共用）
// ---------------------------------------------------------------------------

function defaultFiles(): FileMap {
  return { "README.md": "", "SKILL.md": "", LICENSE: "" };
}

/**
 * Editor 用的最小 API 抽象 —— 同时给"用户自建（MySkillsStore）"和"admin 官方
 * skill（AdminOfficialPage）"复用，避免一份 UI 维护两次。
 *
 * 实现方需要保证：
 * - ``create`` 成功后内部完成了"列表失效 / 自加入 mine"等副作用（MySkills 走原
 *   useMySkillsStore；admin 走 AdminOfficial store）
 * - ``loadForEdit`` 拉编辑预填的 skill + 全量文件
 */
export interface SkillEditorApi {
  loading: boolean;
  create: (input: {
    name: string;
    summary: string;
    skillType: string;
    files: { path: string; content: string }[];
  }) => Promise<{ name: string }>;
  update: (input: {
    skillId: string;
    name: string;
    summary: string;
    files: { path: string; content: string }[];
  }) => Promise<{ name: string }>;
  publish: (skillId: string) => Promise<{
    needsApproval: boolean;
    skill?: { name?: string };
  }>;
  loadForEdit: (skillId: string) => Promise<{
    skill: { name: string; summary: string };
    files: { path: string; content: string }[];
  }>;
}

/** 默认 api：用户自建路径，复用 mySkillsStore + agentClient.getSkillForEdit。 */
function useDefaultMineApi(): SkillEditorApi {
  const { creating, create, update, publish } = useMySkillsStore(
    useShallow((s) => ({
      creating: s.creating,
      create: s.create,
      update: s.update,
      publish: s.publish,
    })),
  );
  return {
    loading: creating,
    create: async (input) => {
      const skill = await create(input);
      return { name: skill.name };
    },
    update: async (input) => {
      const skill = await update(input);
      return { name: skill.name };
    },
    publish: async (skillId) => {
      const result = await publish(skillId);
      return { needsApproval: result.needsApproval, skill: result.skill ? { name: result.skill.name } : undefined };
    },
    loadForEdit: async (skillId) => {
      const resp = await agentClient.getSkillForEdit({ skillId });
      const sk = resp.skill;
      if (!sk) throw new Error("Skill not found");
      return {
        skill: { name: sk.name, summary: sk.summary },
        files: resp.files.map((f) => ({ path: f.path, content: f.content })),
      };
    },
  };
}

function mergeRequiredIntoFiles(files: FileMap): FileMap {
  const m = { ...files };
  for (const k of REQUIRED_FILES) {
    if (m[k] === undefined) m[k] = "";
  }
  return m;
}

function parentDirsFromFilePaths(paths: string[]): Set<string> {
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      dirs.add(acc);
    }
  }
  return dirs;
}

interface EditorProps {
  mode: "create" | "edit";
  skillId?: string;
  api: SkillEditorApi;
  /** 自定义文案 —— admin 视角 publish 永远 self-approve，需要换说明文字。 */
  flavor?: "user" | "admin-official";
  /** create 模式：从市场克隆等场景预填包内容（仍走新建 skill）。 */
  createPrefill?: SkillCreatePrefill;
  onClose: () => void;
}

function Editor({ mode, skillId, api, flavor: _flavor = "user", createPrefill, onClose }: EditorProps) {
  // 编辑器只负责"保存草稿"。发布的入口收敛在卡片列表的 Publish 按钮上 ——
  // 让"编辑 → 保存 → 在列表里再决定要不要发布"成为单一明确流程，避免编辑中误发布。
  const { loading: creating, create, update, loadForEdit } = api;

  const [name, setName] = useState(() =>
    mode === "create" && createPrefill ? createPrefill.name : "",
  );
  const [summary, setSummary] = useState(() =>
    mode === "create" && createPrefill ? createPrefill.summary : "",
  );
  // 编辑模式下 skill 名称不能改（涉及 UNIQUE(app_id, owner_user_id, name) 约束、
  // market 卡片稳定性、历史版本语义一致性）。initialNameRef 用于在提交时强制
  // 回填原始 name，即便前端控件被 DevTools 绕过 disabled 也不会被修改。
  const initialNameRef = useRef<string>("");
  const [files, setFiles] = useState<FileMap>(() => {
    if (mode === "create" && createPrefill) {
      return mergeRequiredIntoFiles(createPrefill.files);
    }
    return mode === "create" ? defaultFiles() : {};
  });
  // 用户显式新建过的"空文件夹"（buildTree 还会从已有文件路径自动推导出中间目录）
  const [explicitDirs, setExplicitDirs] = useState<Set<string>>(() => {
    const base = new Set<string>(["examples", "references"]);
    if (mode === "create" && createPrefill) {
      for (const d of parentDirsFromFilePaths(Object.keys(createPrefill.files))) {
        base.add(d);
      }
    }
    return base;
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const open = new Set<string>(["examples", "references"]);
    if (mode === "create" && createPrefill) {
      for (const d of parentDirsFromFilePaths(Object.keys(createPrefill.files))) {
        open.add(d);
      }
    }
    return open;
  });
  const [selected, setSelected] = useState<string>("SKILL.md");
  const [newRow, setNewRow] = useState<{ parent: string; kind: "file" | "folder"; name: string } | null>(null);
  const [error, setError] = useState<string>("");
  const [okMsg, setOkMsg] = useState<string>("");
  const [loadingDetail, setLoadingDetail] = useState(mode === "edit");
  const [submitting, setSubmitting] = useState(false);
  // AgnesHelp 弹窗 —— 仅在 create 模式下可触发
  const [agnesHelpOpen, setAgnesHelpOpen] = useState(false);

  const handleAgnesAccepted = (generated: GeneratedFile[]) => {
    // 与后端约定：path 只能是 README.md / SKILL.md / LICENSE / examples/example.md / references/reference.md。
    // 收到非白名单路径直接忽略，避免 LLM 写出 SKILL.md/blah.txt 这种污染目录树。
    const safe = generated.filter((f) => ALLOWED_GENERATED_FILES.has(f.path));
    if (safe.length === 0) return;

    setFiles((prev) => {
      const next = { ...prev };
      for (const f of safe) next[f.path] = f.content;
      return next;
    });

    // 自动展开生成文件所在的目录，避免用户找不到
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const f of safe) {
        const parts = f.path.split("/");
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          next.add(acc);
        }
      }
      return next;
    });

    // 选中 SKILL.md（最关键的文件），让用户立即看到生成结果
    setSelected("SKILL.md");
    setError("");
    setOkMsg("");
  };

  // edit 模式：进入时拉取
  useEffect(() => {
    if (mode !== "edit" || !skillId) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await loadForEdit(skillId);
        if (cancelled) return;
        const sk = resp.skill;
        if (!sk) throw new Error("Skill not found");
        const m: FileMap = {};
        for (const f of resp.files) m[f.path] = f.content;
        // 三必填即便 S3 上缺也确保 UI 出现
        for (const k of REQUIRED_FILES) if (m[k] === undefined) m[k] = "";
        setName(sk.name);
        initialNameRef.current = sk.name;
        setSummary(sk.summary);
        setFiles(m);
        // 把已有文件路径里的目录都展开
        const open = new Set<string>(["examples", "references"]);
        for (const p of Object.keys(m)) {
          const parts = p.split("/");
          let acc = "";
          for (let i = 0; i < parts.length - 1; i++) {
            acc = acc ? `${acc}/${parts[i]}` : parts[i];
            open.add(acc);
          }
        }
        setExpanded(open);
        setSelected("SKILL.md");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.replace(/^\[\w+\]\s*/, ""));
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, skillId, loadForEdit]);

  const tree = useMemo(() => buildTree(files, explicitDirs), [files, explicitDirs]);

  const handleAddRow = (parent: string, kind: "file" | "folder") => {
    setExpanded((prev) => new Set(prev).add(parent));
    setNewRow({ parent, kind, name: "" });
  };

  const handleCommitNewRow = () => {
    if (!newRow) return;
    // 空名 = 静默取消，不报错（Enter 键空提交也走这条）
    if (!newRow.name.trim()) {
      setNewRow(null);
      return;
    }
    const segErr = validateSegment(newRow.name);
    if (segErr) {
      setError(segErr);
      setNewRow(null);
      return;
    }
    const cleaned = newRow.name.trim();
    const parent = newRow.parent;
    if (newRow.kind === "folder") {
      const full = joinPath(parent, cleaned);
      setExplicitDirs((prev) => new Set(prev).add(full));
      setExpanded((prev) => new Set(prev).add(full));
    } else {
      const finalName = cleaned.toLowerCase().endsWith(".md") ? cleaned : `${cleaned}.md`;
      const full = joinPath(parent, finalName);
      if (files[full] !== undefined) {
        setError(`File already exists: ${full}`);
        setNewRow(null);
        return;
      }
      setFiles((prev) => ({ ...prev, [full]: "" }));
      setSelected(full);
    }
    setNewRow(null);
    setError("");
  };

  const handleDelete = (node: TreeNode) => {
    if (node.isDir) {
      setFiles((prev) => {
        const next: FileMap = {};
        for (const [p, c] of Object.entries(prev)) {
          if (p !== node.fullPath && !p.startsWith(`${node.fullPath}/`)) next[p] = c;
        }
        return next;
      });
      setExplicitDirs((prev) => {
        const next = new Set<string>();
        for (const d of prev) {
          if (d !== node.fullPath && !d.startsWith(`${node.fullPath}/`)) next.add(d);
        }
        return next;
      });
      if (selected.startsWith(`${node.fullPath}/`)) setSelected("SKILL.md");
    } else {
      if ((REQUIRED_FILES as readonly string[]).includes(node.fullPath)) return;
      setFiles((prev) => {
        const next = { ...prev };
        delete next[node.fullPath];
        return next;
      });
      if (selected === node.fullPath) setSelected("SKILL.md");
    }
  };

  const trimmedName = name.trim();
  const allReqFilled = REQUIRED_FILES.every((p) => (files[p] || "").trim().length > 0);
  const canSave = !creating && !submitting && trimmedName.length > 0 && allReqFilled;

  const handleSave = async () => {
    if (!canSave) return;
    setError("");
    setOkMsg("");
    setSubmitting(true);
    try {
      const payload = Object.entries(files).map(([path, content]) => ({ path, content }));
      if (mode === "create") {
        const skill = await create({
          name: trimmedName,
          summary: summary.trim(),
          skillType: "guide",
          files: payload,
        });
        setOkMsg(`Created "${skill.name}". Saved as draft — Publish from the card list when you're ready.`);
      } else if (skillId) {
        // edit 模式下不允许改名：用进入编辑时记录的原始 name 覆盖 state，
        // 兜底任何绕过 UI disabled 的篡改。
        const skill = await update({
          skillId,
          name: initialNameRef.current || trimmedName,
          summary: summary.trim(),
          files: payload,
        });
        setOkMsg(`Updated "${skill.name}". Saved as draft — Publish from the card list to re-list.`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^\[\w+\]\s*/, ""));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingDetail) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-tertiary">
        Loading skill...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-4 pb-3 border-b border-border-light flex items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Skill name (e.g. awesome-pr-reviewer)"
          // 编辑模式下锁定名称：名称改动会影响 UNIQUE 约束、市场卡片稳定性
          // 以及历史版本语义，此处强制 readOnly + 视觉上暗示不可编辑。
          // summary 仍然可编辑。
          disabled={submitting || !!okMsg || mode === "edit"}
          readOnly={mode === "edit"}
          title={mode === "edit" ? "Skill name can't be changed after creation" : undefined}
          maxLength={128}
          className={`flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-surface
                     focus:outline-none focus:border-accent transition-colors disabled:opacity-60
                     ${mode === "edit" ? "cursor-not-allowed text-text-secondary" : ""}`}
        />
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One-line summary (optional)"
          disabled={submitting || !!okMsg}
          maxLength={255}
          className="flex-[2] px-3 py-2 text-sm border border-border rounded-lg bg-surface
                     focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
        />
      </div>

      {/* 用 flex 而不是 grid: grid 单行没显式 grid-rows-[1fr] 时, row 高度按
          子元素内容算 (grid-auto-rows: auto), 导致 <main> 不会被撑到 flex-1
          的总高度, 右侧 textarea 的 flex-1 只在压缩后的小区间里展开, 视觉上
          编辑框只占上半截。flex + flex-1 直接拉伸到容器全高更稳。 */}
      <div className="flex-1 min-h-0 flex">
        <aside className="w-[240px] shrink-0 border-r border-border-light overflow-y-auto py-2 bg-surface-hover/40">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-[10px] uppercase tracking-wider text-text-tertiary">Files</span>
            {!okMsg && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => handleAddRow("", "file")}
                  title="New markdown file at root"
                  className="w-5 h-5 rounded text-text-tertiary hover:text-accent hover:bg-accent/10
                             flex items-center justify-center transition-all"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleAddRow("", "folder")}
                  title="New folder at root"
                  className="w-5 h-5 rounded text-text-tertiary hover:text-accent hover:bg-accent/10
                             flex items-center justify-center transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <FileTree
            nodes={tree}
            selected={selected}
            expanded={expanded}
            disabled={submitting || !!okMsg}
            newRow={newRow}
            onToggle={(d) =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(d)) next.delete(d); else next.add(d);
                return next;
              })
            }
            onSelect={setSelected}
            onAdd={handleAddRow}
            onDelete={handleDelete}
            onNewRowChange={(v) => setNewRow((r) => (r ? { ...r, name: v } : r))}
            onNewRowCommit={handleCommitNewRow}
            onNewRowCancel={() => setNewRow(null)}
          />
          {newRow && newRow.parent === "" && (
            <NewRow
              depth={0}
              kind={newRow.kind}
              name={newRow.name}
              onChange={(v) => setNewRow((r) => (r ? { ...r, name: v } : r))}
              onCommit={handleCommitNewRow}
              onCancel={() => setNewRow(null)}
            />
          )}
        </aside>

        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-border-light flex items-center justify-between text-xs shrink-0">
            <span className="font-mono text-text-secondary">{selected}</span>
            <span className="text-text-tertiary">{(files[selected] || "").length} chars</span>
          </div>
          {/* ⚠️ 必须加 .fixed-size, 否则会命中 index.css 的全局规则
               `textarea:not(.fixed-size) { field-sizing: content; max-height: 200px }`,
               导致 textarea 强制按内容自适应且最高 200px, flex-1 完全失效,
               视觉上"右侧编辑框只有一小半高度"。同 AgnesHelpModal 的踩坑。 */}
          <textarea
            value={files[selected] || ""}
            onChange={(e) => setFiles((prev) => ({ ...prev, [selected]: e.target.value }))}
            disabled={submitting || !!okMsg}
            spellCheck={false}
            placeholder={placeholderFor(selected)}
            className="fixed-size flex-1 min-h-0 w-full p-4 text-sm font-mono leading-relaxed resize-none
                       bg-surface text-text-primary placeholder:text-text-tertiary/60
                       focus:outline-none disabled:opacity-60"
          />
        </main>
      </div>

      {(error || okMsg) && (
        <div className="px-6 py-2 border-t border-border-light">
          {error && (
            <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {okMsg && (
            <div className="text-xs text-green-700 bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2">
              {okMsg}
            </div>
          )}
        </div>
      )}

      <div className="px-6 py-3 flex items-center justify-between border-t border-border-light gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {!okMsg && mode === "create" && (
            <AgnesHelpButton
              disabled={submitting}
              onClick={() => setAgnesHelpOpen(true)}
            />
          )}
          <span className="text-[11px] text-text-tertiary truncate">
            README.md, SKILL.md and LICENSE are required. Saved as a draft — Publish from the card list.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-1.5 text-sm text-text-secondary border border-border rounded-lg
                       hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {okMsg ? "Done" : "Cancel"}
          </button>
          {!okMsg && (
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                         hover:bg-accent-hover transition-colors disabled:opacity-50
                         flex items-center gap-1.5"
            >
              {submitting && (
                <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
              )}
              {submitting ? (mode === "create" ? "Creating..." : "Saving...") : (mode === "create" ? "Create" : "Save")}
            </button>
          )}
        </div>
      </div>

      {agnesHelpOpen && (
        <AgnesHelpModal
          skillType="guide"
          onClose={() => setAgnesHelpOpen(false)}
          onAccepted={handleAgnesAccepted}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal 壳
// ---------------------------------------------------------------------------

interface SkillEditorModalProps {
  mode: "create" | "edit";
  skillId?: string;
  initialSkillName?: string;
  /** create：从市场克隆预填（跳过类型选择步）。 */
  createPrefill?: SkillCreatePrefill;
  api?: SkillEditorApi;
  flavor?: "user" | "admin-official";
  /** admin-official create 时显示在 header 上的 app id 提示。 */
  headerHint?: string;
  onClose: () => void;
}

export function SkillEditorModal({
  mode,
  skillId,
  initialSkillName,
  createPrefill,
  api,
  flavor = "user",
  headerHint,
  onClose,
}: SkillEditorModalProps) {
  const [step, setStep] = useState<1 | 2>(mode === "edit" ? 2 : createPrefill ? 2 : 1);
  const defaultApi = useDefaultMineApi();
  const effectiveApi = api ?? defaultApi;
  const isAdmin = flavor === "admin-official";
  const titlePrefix = isAdmin ? "official skill" : "skill";

  // Step1（仅类型选择）只是两张卡片，按内容自适应高度即可，
  // 不要再被 editor 的 720px 撑出一大片空白。
  const isPicker = step === 1 && mode === "create";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-4xl mx-4 flex flex-col"
        style={isPicker ? { maxHeight: "90vh" } : { height: "min(720px, 90vh)" }}
      >
        <div className="px-6 pt-5 pb-3 flex items-start justify-between border-b border-border-light">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              {mode === "edit"
                ? `Edit ${titlePrefix}${initialSkillName ? ` · ${initialSkillName}` : ""}`
                : step === 1
                  ? `Create ${titlePrefix}`
                  : `New ${isAdmin ? "official " : ""}guide skill`}
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {mode === "edit"
                ? isAdmin
                  ? "Edit the package and save. Publish to self-approve and re-list."
                  : "Edit the package and save. Publish when ready."
                : step === 1
                  ? "Pick a skill type to start with."
                  : createPrefill && !isAdmin
                    ? "Prefilled from a market skill — edit and save as your new draft."
                    : isAdmin
                      ? "Edit the required files; admin Publish auto-approves and shows on the market."
                      : "Edit the required files, then submit the whole package."}
              {headerHint && (
                <span className="ml-2 text-text-tertiary">· {headerHint}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary" title="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {step === 1
            ? <Step1 onPickGuide={() => setStep(2)} />
            : (
              <Editor
                mode={mode}
                skillId={skillId}
                api={effectiveApi}
                flavor={flavor}
                createPrefill={createPrefill}
                onClose={onClose}
              />
            )
          }
        </div>
      </div>
    </div>
  );
}

// 向后兼容旧名字（MySkillsPage 引入处也会替换）
export const CreateSkillModal = ({ onClose }: { onClose: () => void }) => (
  <SkillEditorModal mode="create" onClose={onClose} />
);
