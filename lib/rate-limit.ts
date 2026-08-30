type Bucket = { count: number; resetAt: number };

declare global {
  var resonanceRateLimits: Map<string, Bucket> | undefined;
}

const buckets = globalThis.resonanceRateLimits ??= new Map<string, Bucket>();

export function clientAddress(request: Request): string {
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

export function takeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
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
