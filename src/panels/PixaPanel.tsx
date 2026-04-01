import { useState } from "react";
import { usePixa, type PixaParams } from "@/hooks/usePixa";
import { EventStream } from "@/components/EventStream";

const inputClass = "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 transition-all";
const labelClass = "block text-xs font-medium text-text-secondary mb-1.5";

export function PixaPanel() {
  const { generate, events, isStreaming, assistantContent } = usePixa();
  const [form, setForm] = useState<PixaParams>({
    query: "", mediaType: "", model: "", ratio: "",
    duration: 0, images: [], count: 1, resolution: "", sound: false,
  });
  const [imageUrlInput, setImageUrlInput] = useState("");

  const update = <K extends keyof PixaParams>(key: K, val: PixaParams[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const addImage = () => {
    const url = imageUrlInput.trim();
    if (url) { update("images", [...(form.images ?? []), url]); setImageUrlInput(""); }
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-xl mx-auto space-y-6">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Image & Video Generation</h2>
            <p className="text-xs text-text-tertiary mt-0.5">Configure and send a PixaStream request</p>
          </div>

          <div className="space-y-5 rounded-2xl bg-surface border border-border-light p-5 shadow-sm">
            <div>
              <label className={labelClass}>Prompt *</label>
              <textarea value={form.query} onChange={(e) => update("query", e.target.value)} rows={3}
                className={inputClass} placeholder="Describe what to generate..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Media Type</label>
                <select value={form.mediaType} onChange={(e) => update("mediaType", e.target.value)} className={inputClass}>
                  <option value="">Auto</option><option value="image">Image</option><option value="video">Video</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Model</label>
                <input value={form.model} onChange={(e) => update("model", e.target.value)} className={inputClass} placeholder="Auto" />
              </div>
              <div>
                <label className={labelClass}>Ratio</label>
                <input value={form.ratio} onChange={(e) => update("ratio", e.target.value)} className={inputClass} placeholder="16:9" />
              </div>
              <div>
                <label className={labelClass}>Resolution</label>
                <select value={form.resolution} onChange={(e) => update("resolution", e.target.value)} className={inputClass}>
                  <option value="">Auto</option><option value="SD">SD</option><option value="HD">HD</option><option value="UHD">UHD</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Duration (s)</label>
                <input type="number" value={form.duration} onChange={(e) => update("duration", Number(e.target.value))} className={inputClass} min={0} />
              </div>
              <div>
                <label className={labelClass}>Count</label>
                <input type="number" value={form.count} onChange={(e) => update("count", Number(e.target.value))} className={inputClass} min={1} max={10} />
              </div>
              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input type="checkbox" checked={form.sound} onChange={(e) => update("sound", e.target.checked)}
                    className="rounded border-border accent-accent" />
                  <span className="text-xs font-medium">Sound</span>
                </label>
              </div>
            </div>

            <div>
              <label className={labelClass}>Reference Images</label>
              <div className="flex gap-2">
                <input value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)}
                  className={`flex-1 ${inputClass}`} placeholder="https://..." />
                <button onClick={addImage}
                  className="rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-text-secondary
                             hover:bg-surface-hover active:scale-[0.97] transition-all">
                  Add
                </button>
              </div>
              {form.images && form.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {form.images.map((url, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 text-[11px] bg-surface-hover px-2.5 py-1 rounded-full">
                      <span className="text-text-secondary max-w-[120px] truncate">{url}</span>
                      <button onClick={() => update("images", form.images!.filter((_, j) => j !== i))}
                        className="text-text-tertiary hover:text-error transition-colors text-xs">&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button onClick={() => { if (form.query.trim() && !isStreaming) generate(form); }}
            disabled={isStreaming || !form.query.trim()}
            className="rounded-xl bg-text-primary text-white px-6 py-2.5 text-sm font-medium
                       hover:bg-text-secondary active:scale-[0.98] disabled:opacity-40 transition-all shadow-sm">
            {isStreaming ? "Generating..." : "Generate"}
          </button>

          {assistantContent && (
            <div className="rounded-2xl bg-surface border border-border-light p-5 text-sm whitespace-pre-wrap
                            text-text-primary leading-relaxed shadow-sm">
              {assistantContent}
            </div>
          )}
        </div>
      </div>

      {events.length > 0 && (
        <div className="w-[400px] shrink-0"><EventStream events={events} /></div>
      )}
    </div>
  );
}
