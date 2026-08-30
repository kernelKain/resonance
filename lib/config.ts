export const TRUEFORGE_BASE_URL =
  process.env.TRUEFORGE_BASE_URL ?? "http://127.0.0.1:8790";

export const TRUEFORGE_AGENT_NAME =
  process.env.TRUEFORGE_AGENT_NAME ?? "resonance";

export const TRUEFORGE_FALLBACK_AGENT_NAME =
  process.env.TRUEFORGE_FALLBACK_AGENT_NAME ?? "resonance-deepseek";

export const PRIMARY_MODEL_NAME =
  process.env.TRUEFORGE_MODEL ?? "openrouter/minimax-minimax-m-3-free";

export const FALLBACK_MODEL_NAME =
  process.env.TRUEFORGE_FALLBACK_MODEL ?? "openrouter/deepseek-deepseek-v4-flash-0731";

export const MODEL_COOLDOWN_MS = Number(
  process.env.MODEL_COOLDOWN_MS ?? 5 * 60 * 1000,
);

export const MCP_BASE_URL =
  process.env.MCP_BASE_URL ?? "http://127.0.0.1:8792";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "uploads";