type Bucket = { count: number; resetAt: number };

declare global {
  var resonanceRateLimits: Map<string, Bucket> | undefined;
  var resonanceRateLimitLastSweep: number | undefined;
}

const buckets = globalThis.resonanceRateLimits ??= new Map<string, Bucket>();

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export function takeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  globalThis.resonanceRateLimitLastSweep ??= now;
  if (now - globalThis.resonanceRateLimitLastSweep > 60_000 || buckets.size > 10_000) {
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= now) {
        buckets.delete(k);
      }
    }
    while (buckets.size > 10_000) {
      buckets.delete(buckets.keys().next().value!);
    }
    globalThis.resonanceRateLimitLastSweep = now;
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json(
    { error: "Too many requests. Please wait before trying again." },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}
