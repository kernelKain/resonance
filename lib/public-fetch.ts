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

type PublicFetchInit = RequestInit & {
  timeoutMs?: number;
  maxBytes?: number;
};

/**
 * Fetches a public HTTP(S) URL after verifying DNS does not resolve to a
 * private address. Connects to the checked IP while sending the original
 * hostname as TLS SNI and the Host header, so certificates still validate.
 */
export async function fetchPublicUrl(url: URL, init: PublicFetchInit = {}): Promise<Response> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only public HTTP or HTTPS URLs are supported.");
  }

  const { address } = await assertPublicHostname(url.hostname);
  const timeoutMs = init.timeoutMs ?? 6_000;
  const maxBytes = init.maxBytes ?? 512 * 1024;
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!headers.has("host")) headers.set("host", url.host);

  const headerRecord: Record<string, string> = {};
  headers.forEach((value, key) => {
    headerRecord[key] = value;
  });

  return await new Promise<Response>((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
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
            resolve(responseFrom(incoming, Buffer.concat(chunks)));
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("end", () => {
          resolve(responseFrom(incoming, Buffer.concat(chunks)));
        });
        incoming.on("error", reject);
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("The product URL timed out."));
    });
    request.on("error", reject);

    if (init.signal) {
      const abort = () => {
        request.destroy();
        reject(new DOMException("The request was aborted.", "AbortError"));
      };
      if (init.signal.aborted) {
        abort();
        return;
      }
      init.signal.addEventListener("abort", abort, { once: true });
      request.on("close", () => init.signal?.removeEventListener("abort", abort));
    }

    if (typeof init.body === "string" || init.body instanceof Uint8Array) {
      request.write(init.body);
    }
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
