import type { NodeData } from "@/stores/conversationStore";

export function NodeSteps({ nodes }: { nodes: NodeData[] }) {
  if (nodes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {nodes.map((n, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
            n.status === "running"
              ? "bg-accent-light text-accent animate-pulse"
              : "bg-green-50 text-success"
          }`}
        >
          {n.status === "running" ? "⏳" : "✅"} {n.node}
        </span>
      ))}
    </div>
  );
}
