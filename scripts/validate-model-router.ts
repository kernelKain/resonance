import {
  isRetryableModelFailure,
  recordPrimaryFailure,
  recordPrimarySuccess,
  selectAgentForNewSession,
} from "../lib/model-router";

globalThis.resonanceModelCircuit = undefined;

const initial = selectAgentForNewSession(1_000);
if (initial.provider !== "minimax") throw new Error("MiniMax must be primary.");

recordPrimaryFailure("quota exceeded", 1_000);
const fallback = selectAgentForNewSession(1_001);
if (fallback.provider !== "deepseek") throw new Error("Open circuit must select DeepSeek.");

const probe = selectAgentForNewSession(1_000 + 5 * 60 * 1000);
if (probe.provider !== "minimax" || !probe.probingPrimary) {
  throw new Error("Expired cooldown must probe MiniMax.");
}

const concurrent = selectAgentForNewSession(1_000 + 5 * 60 * 1000);
if (concurrent.provider !== "deepseek") {
  throw new Error("Only one MiniMax recovery probe may run at a time.");
}

recordPrimarySuccess();
if (selectAgentForNewSession().provider !== "minimax") {
  throw new Error("A successful probe must restore MiniMax.");
}

if (!isRetryableModelFailure(429, "") || !isRetryableModelFailure(400, "quota exhausted")) {
  throw new Error("Quota failures must be retryable.");
}
if (isRetryableModelFailure(400, "invalid request")) {
  throw new Error("Invalid requests must not trip model failover.");
}

console.log("MODEL_ROUTER_PASS");
