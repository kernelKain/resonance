import { useEffect, useState } from "react";

export type Health = {
  trueforge: boolean;
  filesystemMcp: boolean;
  agent: boolean;
  agentName: string;
};

export function useHealthPolling(intervalMs = 5000) {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const json = (await response.json()) as Health;
        if (!cancelled) setHealth(json);
      } catch {
        if (!cancelled) {
          setHealth({
            trueforge: false,
            filesystemMcp: false,
            agent: false,
            agentName: "resonance",
          });
        }
      }
    }

    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);
    const immediate = window.setTimeout(() => {
      void tick();
    }, 0);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(immediate);
    };
  }, [intervalMs]);

  return health;
}
