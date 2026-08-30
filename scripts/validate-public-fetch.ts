import { getEventListeners } from "node:events";
import http from "node:http";
import net from "node:net";

import { isPrivateAddress } from "../lib/address";
import {
  assertPublicHostname,
  fetchPublicUrlOnce,
  followPublicUrlRedirects,
  serializeRequestBody,
} from "../lib/public-fetch";

async function expectBuffer(
  body: BodyInit,
  expected: string | Uint8Array,
  label: string,
): Promise<void> {
  const actual = await serializeRequestBody(body, new Headers());
  const expectedBuffer = Buffer.from(expected);
  if (!actual || !actual.equals(expectedBuffer)) {
    throw new Error(`${label}: expected ${expectedBuffer.toString("hex")}, got ${actual?.toString("hex") ?? "undefined"}`);
  }
}

async function expectContentType(body: BodyInit, expectedPrefix: string, label: string): Promise<void> {
  const headers = new Headers();
  await serializeRequestBody(body, headers);
  const contentType = headers.get("content-type") ?? "";
  if (!contentType.startsWith(expectedPrefix)) {
    throw new Error(`${label}: expected content-type starting with ${expectedPrefix}, got ${contentType || "(none)"}`);
  }
}

await expectBuffer("hello", "hello", "string body");
await expectBuffer(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]), "Uint8Array body");
await expectBuffer(new Uint8Array([9, 8]).buffer, new Uint8Array([9, 8]), "ArrayBuffer body");

const form = new FormData();
form.set("name", "resonance");
await expectContentType(form, "multipart/form-data", "FormData body");

const params = new URLSearchParams({ q: "test" });
await expectBuffer(params, "q=test", "URLSearchParams body");
await expectContentType(params, "application/x-www-form-urlencoded", "URLSearchParams content-type");

const blob = new Blob(["blob-body"], { type: "text/plain" });
await expectBuffer(blob, "blob-body", "Blob body");
await expectContentType(blob, "text/plain", "Blob content-type");

function expectRejects(fn: () => Promise<unknown>, label: string): Promise<void> {
  return fn().then(
    () => {
      throw new Error(`${label} was expected to reject.`);
    },
    () => undefined,
  );
}

const privateIpv4 = ["127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.0.1", "0.0.0.0"];
for (const ip of privateIpv4) {
  if (!isPrivateAddress(ip)) throw new Error(`${ip} should be treated as private.`);
}

const publicIpv4 = ["8.8.8.8", "1.1.1.1"];
for (const ip of publicIpv4) {
  if (isPrivateAddress(ip)) throw new Error(`${ip} should be treated as public.`);
}

await expectRejects(() => assertPublicHostname("127.0.0.1"), "127.0.0.1 lookup");
await expectRejects(() => assertPublicHostname("localhost"), "localhost lookup");

await expectRejects(
  () => followPublicUrlRedirects(new URL("file:///etc/passwd"), 0, async () => new Response("x")),
  "file protocol",
);

await expectRejects(
  () =>
    followPublicUrlRedirects(new URL("http://127.0.0.1/"), 0, async () => new Response("x")),
  "direct private URL",
);

const fetchedHostnames: string[] = [];
const mockFetch = async (url: URL): Promise<Response> => {
  fetchedHostnames.push(url.hostname);
  if (url.hostname === "example.com") {
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" },
    });
  }
  return new Response("ok", { status: 200 });
};

await expectRejects(
  () =>
    followPublicUrlRedirects(new URL("http://example.com/"), 3, async (target) => mockFetch(target)),
  "redirect to private IP",
);

if (fetchedHostnames.length !== 1 || fetchedHostnames[0] !== "example.com") {
  throw new Error(
    `Private redirect target should be blocked before the second fetch; got: ${fetchedHostnames.join(", ")}`,
  );
}

const localhostRedirectFetches: string[] = [];
await expectRejects(
  () =>
    followPublicUrlRedirects(new URL("http://example.com/"), 3, async (target) => {
      localhostRedirectFetches.push(target.hostname);
      if (target.hostname === "example.com") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://localhost/private" },
        });
      }
      return new Response("ok", { status: 200 });
    }),
  "redirect to localhost hostname",
);

if (localhostRedirectFetches.length !== 1 || localhostRedirectFetches[0] !== "example.com") {
  throw new Error(
    `Localhost redirect target should be blocked before the second fetch; got: ${localhostRedirectFetches.join(", ")}`,
  );
}

const fileRedirectFetches: string[] = [];
await expectRejects(
  () =>
    followPublicUrlRedirects(new URL("http://example.com/"), 3, async (target) => {
      fileRedirectFetches.push(target.hostname);
      return new Response(null, {
        status: 302,
        headers: { location: "file:///etc/passwd" },
      });
    }),
  "redirect to file protocol",
);

if (fileRedirectFetches.length !== 1 || fileRedirectFetches[0] !== "example.com") {
  throw new Error(
    `File redirect target should be blocked before the second fetch; got: ${fileRedirectFetches.join(", ")}`,
  );
}

const multiHostFetches: string[] = [];
const multiHostFinal = await followPublicUrlRedirects(
  new URL("http://example.com/start"),
  2,
  async (target) => {
    multiHostFetches.push(target.hostname);
    if (target.hostname === "example.com") {
      return new Response(null, {
        status: 302,
        headers: { location: "http://www.example.com/asset" },
      });
    }
    return new Response("ok", { status: 200 });
  },
);

if (
  multiHostFetches.length !== 2 ||
  multiHostFetches[0] !== "example.com" ||
  multiHostFetches[1] !== "www.example.com"
) {
  throw new Error(
    `Each redirect hop should be fetched after validation; got: ${multiHostFetches.join(", ")}`,
  );
}

if (multiHostFinal.url.hostname !== "www.example.com" || multiHostFinal.response.status !== 200) {
  throw new Error("Cross-host redirect resolution failed.");
}

const redirectLimitPaths: string[] = [];
await expectRejects(
  () =>
    followPublicUrlRedirects(new URL("http://example.com/a"), 1, async (target) => {
      redirectLimitPaths.push(target.pathname);
      return new Response(null, {
        status: 302,
        headers: { location: "/b" },
      });
    }),
  "redirect limit",
);

if (redirectLimitPaths.length !== 2 || redirectLimitPaths.join("->") !== "/a->/b") {
  throw new Error(`Expected two validated redirect hops (/a then /b), got: ${redirectLimitPaths.join(" -> ")}`);
}

const final = await followPublicUrlRedirects(
  new URL("http://example.com/start"),
  2,
  async (target) => {
    if (target.pathname === "/start") {
      return new Response(null, {
        status: 301,
        headers: { location: "/done" },
      });
    }
    return new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  },
);

if (final.url.pathname !== "/done" || final.response.status !== 200) {
  throw new Error("Relative redirect resolution failed.");
}

const oversizeServer = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.write("x".repeat(100));
  res.end("y".repeat(100));
});
await new Promise<void>((resolve) => oversizeServer.listen(0, "127.0.0.1", resolve));
const oversizePort = (oversizeServer.address() as net.AddressInfo).port;
const oversizeUrl = new URL(`http://127.0.0.1:${oversizePort}/`);

await expectRejects(
  () => fetchPublicUrlOnce(oversizeUrl, "127.0.0.1", { maxBytes: 50 }),
  "maxBytes exceeded",
);

try {
  await fetchPublicUrlOnce(oversizeUrl, "127.0.0.1", { maxBytes: 50 });
} catch (error) {
  if (!(error instanceof Error) || error.message !== "Response body is too large.") {
    throw new Error("maxBytes rejection should use Response body is too large.");
  }
}

const withinLimit = await fetchPublicUrlOnce(oversizeUrl, "127.0.0.1", { maxBytes: 500 });
if (!withinLimit.ok || (await withinLimit.text()).length !== 200) {
  throw new Error("Responses within maxBytes should resolve with the full body.");
}

function assertNoAbortListeners(signal: AbortSignal, label: string): void {
  const listeners = getEventListeners(signal, "abort");
  if (listeners.length !== 0) {
    throw new Error(`${label}: expected no abort listeners, found ${listeners.length}`);
  }
}

const successSignal = new AbortController();
const successWithSignal = await fetchPublicUrlOnce(oversizeUrl, "127.0.0.1", {
  maxBytes: 500,
  signal: successSignal.signal,
});
await successWithSignal.text();
assertNoAbortListeners(successSignal.signal, "success path");

const maxBytesSignal = new AbortController();
try {
  await fetchPublicUrlOnce(oversizeUrl, "127.0.0.1", {
    maxBytes: 50,
    signal: maxBytesSignal.signal,
  });
  throw new Error("maxBytes fetch with signal was expected to reject.");
} catch (error) {
  if (!(error instanceof Error) || error.message !== "Response body is too large.") {
    throw error;
  }
}
assertNoAbortListeners(maxBytesSignal.signal, "maxBytes error path");

const abortSignal = new AbortController();
const abortedFetch = fetchPublicUrlOnce(oversizeUrl, "127.0.0.1", {
  signal: abortSignal.signal,
});
abortSignal.abort();
try {
  await abortedFetch;
  throw new Error("Aborted fetch was expected to reject.");
} catch (error) {
  if (!(error instanceof DOMException) || error.name !== "AbortError") {
    throw error;
  }
}
assertNoAbortListeners(abortSignal.signal, "abort path");

oversizeServer.close();

console.log("PUBLIC_FETCH_PASS");
