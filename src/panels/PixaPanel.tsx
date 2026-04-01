import { useState } from "react";
import { usePixa, type PixaParams } from "@/hooks/usePixa";
import { EventStream } from "@/components/EventStream";

export function PixaPanel() {
  const { generate, events, isStreaming, assistantContent } = usePixa();
  const [form, setForm] = useState<PixaParams>({
    query: "",
    mediaType: "",
    model: "",
    ratio: "",
    duration: 0,
    images: [],
    count: 1,
    resolution: "",
    sound: false,
  });
  const [imageUrlInput, setImageUrlInput] = useState("");

  const update = <K extends keyof PixaParams>(key: K, val: PixaParams[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const addImage = () => {
    const url = imageUrlInput.trim();
    if (url) {
      update("images", [...(form.images ?? []), url]);
      setImageUrlInput("");
    }
  };

  const handleSubmit = () => {
    if (!form.query.trim() || isStreaming) return;
    generate(form);
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-lg font-semibold">Pixa — Image / Video Generation</h2>

          <div>
            <label className="block text-sm font-medium mb-1">Query *</label>
            <textarea
              value={form.query}
              onChange={(e) => update("query", e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Describe what to generate..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Media Type</label>
              <select value={form.mediaType} onChange={(e) => update("mediaType", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">Auto</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Model</label>
              <input value={form.model} onChange={(e) => update("model", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Auto" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ratio</label>
              <input value={form.ratio} onChange={(e) => update("ratio", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. 16:9" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Resolution</label>
              <select value={form.resolution} onChange={(e) => update("resolution", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">Auto</option>
                <option value="SD">SD</option>
                <option value="HD">HD</option>
                <option value="UHD">UHD</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Duration (s)</label>
              <input type="number" value={form.duration} onChange={(e) => update("duration", Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Count</label>
              <input type="number" value={form.count} onChange={(e) => update("count", Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" min={1} max={10} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.sound} onChange={(e) => update("sound", e.target.checked)} className="rounded" />
                Sound
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Reference Images</label>
            <div className="flex gap-2">
              <input value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Image URL" />
              <button onClick={addImage} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-hover">Add</button>
            </div>
            {form.images && form.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.images.map((url, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-background px-2 py-1 rounded">
                    {url.slice(0, 30)}...
                    <button onClick={() => update("images", form.images!.filter((_, j) => j !== i))} className="text-text-tertiary hover:text-error">x</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button onClick={handleSubmit} disabled={isStreaming || !form.query.trim()}
            className="rounded-xl bg-accent text-white px-6 py-2.5 text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors">
            {isStreaming ? "Generating..." : "Generate"}
          </button>

          {assistantContent && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm whitespace-pre-wrap">{assistantContent}</div>
          )}
        </div>
      </div>

      {events.length > 0 && (
        <div className="w-96 shrink-0"><EventStream events={events} /></div>
      )}
    </div>
  );
}
