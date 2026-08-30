import sharp from "sharp";

import { asProductUrl } from "@/lib/product-identity";
import { fetchPublicUrl } from "@/lib/public-fetch";
import { clientAddress, rateLimitResponse, takeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_LOGO_BYTES = 1024 * 1024;

declare global {
  var resonanceLogoCache: Map<string, { buffer: Uint8Array; expiresAt: number }> | undefined;
  var resonanceLogoInFlight: Map<string, Promise<Uint8Array>> | undefined;
}

const logoCache = globalThis.resonanceLogoCache ??= new Map();
const inFlight = globalThis.resonanceLogoInFlight ??= new Map();

async function fetchAndProcessLogo(requested: URL): Promise<Uint8Array> {
  let current = requested;
  let response: Response | null = null;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    response = await fetchPublicUrl(current, {
      timeoutMs: 5_000,
      maxBytes: MAX_LOGO_BYTES,
      headers: { accept: "image/*", "user-agent": "ResonanceLogo/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Too many redirects.");
      current = new URL(location, current);
      continue;
    }
    break;
  }
  if (!response?.ok || !response.body) throw new Error("Logo could not be fetched.");
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"].includes(contentType)) {
    throw new Error("Unsupported logo format.");
  }
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > MAX_LOGO_BYTES) throw new Error("Logo is too large.");
  return await sharp(body, {
    failOn: "error",
    limitInputPixels: 16_000_000,
  })
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
    .then((buf) => new Uint8Array(buf));
}

export async function GET(request: Request) {
  const rateLimit = takeRateLimit(`logo:${clientAddress(request)}`, 50, 60_000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  try {
    const requested = asProductUrl(new URL(request.url).searchParams.get("url") ?? "");
    if (!requested) return new Response("Invalid logo URL.", { status: 400 });
    
    const cacheKey = requested.toString();
    const now = Date.now();
    
    const cached = logoCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return new Response(cached.buffer, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=3600",
          "x-content-type-options": "nosniff",
        },
      });
    }

    let promise = inFlight.get(cacheKey);
    if (!promise) {
      promise = fetchAndProcessLogo(requested);
      inFlight.set(cacheKey, promise);
      promise.then(
        (buffer: Uint8Array) => {
          if (logoCache.size > 1000) {
            // Lazy simple eviction
            const firstKey = logoCache.keys().next().value;
            if (firstKey) logoCache.delete(firstKey);
          }
          logoCache.set(cacheKey, { buffer, expiresAt: Date.now() + 60_000 * 5 }); // 5 min cache
          inFlight.delete(cacheKey);
        },
        () => {
          inFlight.delete(cacheKey);
        }
      );
    }
    
    const normalized = await promise;
    return new Response(normalized, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Product logo unavailable.", { status: 404 });
  }
}
