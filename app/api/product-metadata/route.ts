import { lookup } from "node:dns/promises";
import net from "node:net";

import { NextResponse } from "next/server";

import { asProductUrl, hostnameLabel } from "@/lib/product-identity";

export const runtime = "nodejs";

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 6_000;

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

async function assertPublicUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only public HTTP or HTTPS URLs are supported.");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Private or local network addresses are not supported.");
  }
}

async function fetchPublicPage(initialUrl: URL): Promise<{ response: Response; url: URL }> {
  let current = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "ResonanceMetadata/1.0",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw new Error("The product URL redirected too many times.");
      }
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`The product page returned ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("The product URL did not return an HTML page.");
    }
    return { response, url: current };
  }
  throw new Error("Could not resolve the product URL.");
}

async function readLimitedHtml(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_HTML_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    if (match) return decodeHtml(match);
  }
  return null;
}

function pageIdentity(html: string, url: URL) {
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const name =
    metaContent(html, "og:site_name") ||
    metaContent(html, "application-name") ||
    title.split(/\s+[|—–-]\s+/)[0]?.trim() ||
    hostnameLabel(url);
  const iconHref =
    html.match(/<link[^>]+rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]*>/i)?.[1] ??
    "/favicon.ico";
  let logoUrl: string | undefined;
  try {
    logoUrl = new URL(decodeHtml(iconHref), url).toString();
  } catch {
    logoUrl = undefined;
  }
  return { name: name.slice(0, 120), logoUrl };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = asProductUrl(body.url ?? "");
    if (!url) {
      return NextResponse.json({ error: "Enter a valid public product URL." }, { status: 400 });
    }
    const { response, url: finalUrl } = await fetchPublicPage(url);
    const html = await readLimitedHtml(response);
    const identity = pageIdentity(html, finalUrl);
    return NextResponse.json({
      ...identity,
      logoUrl: identity.logoUrl
        ? `/api/product-logo?url=${encodeURIComponent(identity.logoUrl)}`
        : undefined,
      sourceUrl: finalUrl.toString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not inspect the product URL.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
