import { lookup } from "node:dns/promises";
import net from "node:net";

import { asProductUrl } from "@/lib/product-identity";

export const runtime = "nodejs";

const MAX_LOGO_BYTES = 1024 * 1024;

function isPrivate(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const value = address.toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") ||
    value.startsWith("fd") || /^fe[89ab]/.test(value);
}

async function assertPublic(url: URL) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Unsupported logo URL.");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivate(address))) {
    throw new Error("Private logo URL.");
  }
}

export async function GET(request: Request) {
  try {
    const requested = asProductUrl(new URL(request.url).searchParams.get("url") ?? "");
    if (!requested) return new Response("Invalid logo URL.", { status: 400 });
    let current = requested;
    let response: Response | null = null;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      await assertPublic(current);
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
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
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_LOGO_BYTES) {
        await reader.cancel();
        throw new Error("Logo is too large.");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(body, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Product logo unavailable.", { status: 404 });
  }
}
