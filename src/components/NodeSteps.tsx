import type { NodeData } from "@/stores/conversationStore";

export function NodeSteps({ nodes }: { nodes: NodeData[] }) {
  if (nodes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {nodes.map((n, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${
            n.status === "running"
              ? "bg-accent/10 text-accent animate-gentle-pulse"
              : "bg-success-light text-success"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${
            n.status === "running" ? "bg-accent" : "bg-success"
          }`} />
          {n.node}
        </span>
      ))}
    </div>
  );
}
