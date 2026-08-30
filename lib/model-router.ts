import {
  MODEL_COOLDOWN_MS,
  TRUEFORGE_AGENT_NAME,
  TRUEFORGE_FALLBACK_AGENT_NAME,
} from "@/lib/config";

type CircuitState = {
  status: "closed" | "open" | "half-open";
  retryAt: number;
  lastFailure?: string;
  probeInFlight: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var resonanceModelCircuit: CircuitState | undefined;
}

function circuit(): CircuitState {
  globalThis.resonanceModelCircuit ??= {
    status: "closed",
    retryAt: 0,
    probeInFlight: false,
  };
  return globalThis.resonanceModelCircuit;
}

export function selectAgentForNewSession(now = Date.now()): {
  agentName: string;
  provider: "minimax" | "deepseek";
  probingPrimary: boolean;
} {
  const state = circuit();
  if (state.status === "closed") {
    return { agentName: TRUEFORGE_AGENT_NAME, provider: "minimax", probingPrimary: false };
  }
  if (now >= state.retryAt && !state.probeInFlight) {
    state.status = "half-open";
    state.probeInFlight = true;
    return { agentName: TRUEFORGE_AGENT_NAME, provider: "minimax", probingPrimary: true };
  }
  return {
    agentName: TRUEFORGE_FALLBACK_AGENT_NAME,
    provider: "deepseek",
    probingPrimary: false,
  };
}

export function recordPrimaryFailure(reason: string, now = Date.now()) {
  const state = circuit();
  state.status = "open";
  state.retryAt = now + MODEL_COOLDOWN_MS;
  state.lastFailure = reason.slice(0, 300);
  state.probeInFlight = false;
}

export function recordPrimarySuccess() {
  const state = circuit();
  state.status = "closed";
  state.retryAt = 0;
  state.lastFailure = undefined;
  state.probeInFlight = false;
}

export function releasePrimaryProbe() {
  const state = circuit();
  if (state.status === "half-open") {
    state.status = "open";
    state.probeInFlight = false;
  }
}

export function isRetryableModelFailure(status: number, body: string): boolean {
  if ([408, 429, 502, 503, 504].includes(status)) return true;
  const message = body.toLowerCase();
  return [
    "quota",
    "rate limit",
    "rate_limit",
    "capacity",
    "temporarily unavailable",
    "model unavailable",
    "provider error",
  ].some((needle) => message.includes(needle));
}

export function modelRoutingStatus() {
  const state = circuit();
  return {
    status: state.status,
    retryAt: state.retryAt || null,
    lastFailure: state.lastFailure ?? null,
    primaryAgent: TRUEFORGE_AGENT_NAME,
    fallbackAgent: TRUEFORGE_FALLBACK_AGENT_NAME,
  };
}
