import { useCallback, useState } from "react";
import { agentClient } from "@/grpc/client";
import type { RawEvent } from "@/stores/conversationStore";

export interface PixaParams {
  query: string;
  conversationId?: bigint;
  mediaType?: string;
  model?: string;
  ratio?: string;
  duration?: number;
  images?: string[];
  count?: number;
  resolution?: string;
  sound?: boolean;
}

export function usePixa() {
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [assistantContent, setContent] = useState("");

  const generate = useCallback(async (params: PixaParams) => {
    setEvents([]);
    setContent("");
    setStreaming(true);

    try {
      const stream = agentClient.pixaStream({
        agent: {
          conversationId: params.conversationId ?? BigInt(0),
          query: params.query,
          agentType: "pixa",
        },
        mediaType: params.mediaType ?? "",
        model: params.model ?? "",
        ratio: params.ratio ?? "",
        duration: params.duration ?? 0,
        images: params.images ?? [],
        count: params.count ?? 1,
        resolution: params.resolution ?? "",
        sound: params.sound ?? false,
      });

      for await (const event of stream) {
        const ev = event.event;
        setEvents((prev) => [
          ...prev,
          { timestamp: Date.now(), type: ev.case ?? "unknown", data: ev.value },
        ]);
        if (ev.case === "messageDelta") {
          setContent((prev) => prev + ev.value.content);
        }
      }
    } catch (err) {
      console.error("PixaStream error:", err);
    } finally {
      setStreaming(false);
    }
  }, []);

  return { generate, events, isStreaming, assistantContent };
}
