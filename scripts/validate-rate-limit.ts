import { takeRateLimit } from "../lib/rate-limit";

globalThis.resonanceRateLimits = new Map();

const first = takeRateLimit("test", 2, 1_000, 10_000);
const second = takeRateLimit("test", 2, 1_000, 10_100);
const blocked = takeRateLimit("test", 2, 1_000, 10_200);
const reset = takeRateLimit("test", 2, 1_000, 11_001);

if (!first.allowed || !second.allowed) throw new Error("Valid requests were rate limited.");
if (blocked.allowed || blocked.retryAfterSeconds < 1) {
  throw new Error("Excess request was not rate limited.");
}
if (!reset.allowed) throw new Error("Rate limit did not reset.");

console.log("RATE_LIMIT_PASS");
