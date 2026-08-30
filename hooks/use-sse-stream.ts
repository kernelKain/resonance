export async function readSse(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
) {
  if (!response.body) throw new Error("TrueForge returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastEventId = "";

  function ingestChunk(chunk: string) {
    const eventId = chunk
      .split("\n")
      .find((line) => line.startsWith("id:"))
      ?.slice(3)
      .trim();
    if (eventId && eventId === lastEventId) return;
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    try {
      onEvent(JSON.parse(data) as Record<string, unknown>);
      if (eventId) lastEventId = eventId;
    } catch {
      // Ignore malformed keep-alives.
    }
  }

  const abort = () => {
    void reader.cancel();
  };
  if (signal?.aborted) {
    abort();
    throw new DOMException("The analysis was cancelled.", "AbortError");
  }
  signal?.addEventListener("abort", abort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("The analysis was cancelled.", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) ingestChunk(chunk);
    }
    buffer += decoder.decode();
    if (buffer.trim()) ingestChunk(buffer);
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
