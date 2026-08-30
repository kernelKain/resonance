import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import net from "node:net";

import { isPrivateAddress } from "@/lib/address";

export async function assertPublicHostname(hostname: string): Promise<{
  address: string;
  family: 4 | 6;
}> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Private or local network addresses are not supported.");
  }
  const pinned = addresses[0];
  const family: 4 | 6 = pinned.family === 6 || net.isIPv6(pinned.address) ? 6 : 4;
  return { address: pinned.address, family };
}

function assertAllowedPublicUrl(url: URL): void {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only public HTTP or HTTPS URLs are supported.");
  }
}

type PublicFetchInit = RequestInit & {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

export type PublicFetchResult = {
  response: Response;
  url: URL;
};

/**
 * Follows HTTP redirects while re-validating each hop against private DNS
 * resolution before connecting.
 */
export async function followPublicUrlRedirects(
  initialUrl: URL,
  maxRedirects: number,
  fetchOnce: (url: URL, pinnedAddress: string) => Promise<Response>,
): Promise<PublicFetchResult> {
  let current = initialUrl;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    assertAllowedPublicUrl(current);
    const { address } = await assertPublicHostname(current.hostname);
    const response = await fetchOnce(current, address);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === maxRedirects) {
        throw new Error("Too many redirects.");
      }
      current = new URL(location, current);
      continue;
    }
    return { response, url: current };
  }
  throw new Error("Too many redirects.");
}

/**
 * Fetches a public HTTP(S) URL after verifying DNS does not resolve to a
 * private address. Connects to the checked IP while sending the original
 * hostname as TLS SNI and the Host header, so certificates still validate.
 *
 * When `maxRedirects` is set, each redirect target is validated the same way
 * before the next hop is fetched.
 */
export async function fetchPublicUrl(url: URL, init: PublicFetchInit = {}): Promise<PublicFetchResult> {
  const maxRedirects = init.maxRedirects ?? 0;
  return followPublicUrlRedirects(url, maxRedirects, (target, address) =>
    fetchPublicUrlOnce(target, address, init),
  );
}

/** Converts standard `RequestInit.body` values for Node's HTTP client. */
export async function serializeRequestBody(
  body: BodyInit | null | undefined,
  headers: Headers,
): Promise<Buffer | undefined> {
  if (body == null) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }

  const response = new Response(body);
  if (!headers.has("content-type")) {
    const contentType = response.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Fetches one URL hop against a pre-validated address (used by redirect follower and tests). */
export async function fetchPublicUrlOnce(url: URL, address: string, init: PublicFetchInit): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 6_000;
  const maxBytes = init.maxBytes ?? 512 * 1024;
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!headers.has("host")) headers.set("host", url.host);
  const body = await serializeRequestBody(init.body, headers);

  const headerRecord: Record<string, string> = {};
  headers.forEach((value, key) => {
    headerRecord[key] = value;
  });

  return await new Promise<Response>((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    let settled = false;
    let abort: () => void;

    const detachAbortListener = () => {
      if (abort) init.signal?.removeEventListener("abort", abort);
    };

    const settle = <T>(fn: (value: T) => void, value: T) => {
      if (settled) return;
      settled = true;
      detachAbortListener();
      fn(value);
    };

    const resolveOnce = (value: Response) => settle(resolve, value);
    const rejectOnce = (reason: unknown) => settle(reject, reason);

    const request = lib.request(
      {
        protocol: url.protocol,
        hostname: address,
        servername: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: headerRecord,
        timeout: timeoutMs,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        incoming.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes > maxBytes) {
            incoming.destroy();
            request.destroy();
            rejectOnce(new Error("Response body is too large."));
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("end", () => {
          resolveOnce(responseFrom(incoming, Buffer.concat(chunks)));
        });
        incoming.on("error", rejectOnce);
      },
    );

    abort = () => {
      request.destroy();
      rejectOnce(new DOMException("The request was aborted.", "AbortError"));
    };

    request.on("timeout", () => {
      request.destroy(new Error("The product URL timed out."));
    });
    request.on("error", rejectOnce);

    if (init.signal) {
      if (init.signal.aborted) {
        abort();
        return;
      }
      init.signal.addEventListener("abort", abort, { once: true });
    }

    if (body) request.write(body);
    request.end();
  });
}

function responseFrom(incoming: http.IncomingMessage, body: Buffer): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  return new Response(new Uint8Array(body), {
    status: incoming.statusCode ?? 502,
    statusText: incoming.statusMessage,
    headers,
  });
}
