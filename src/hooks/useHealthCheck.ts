import { useState, useEffect, useRef } from "react";
import { agentClient } from "@/grpc/client";

export interface HealthInfo {
  status: "ok" | "error" | "checking";
  latencyMs: number | null;
}

const PING_INTERVAL = 30_000;

export function useHealthCheck(): HealthInfo {
  const [info, setInfo] = useState<HealthInfo>({ status: "checking", latencyMs: null });
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    const ping = async () => {
      const start = performance.now();
      try {
        await agentClient.ping({ message: "health" });
        setInfo({ status: "ok", latencyMs: Math.round(performance.now() - start) });
      } catch {
        setInfo({ status: "error", latencyMs: null });
      }
    };

    ping();
    timerRef.current = setInterval(ping, PING_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, []);

  return info;
}
