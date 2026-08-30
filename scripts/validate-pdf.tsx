import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderToBuffer } from "@react-pdf/renderer";

import { ResonanceDocument } from "../components/pdf/resonance-document";
import { extractResonanceStream } from "../lib/resonance-parse";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const fixture = fs.readFileSync(path.join(root, "public/demo/hitl_stream_fixture.txt"), "utf8");
  const stream = extractResonanceStream(fixture.replace("<!-- HITL_PAUSE -->", ""));
  const output = await renderToBuffer(
    <ResonanceDocument
      stream={stream}
      product={{ name: "Resonance Test Product" }}
      modelProvider="deepseek"
    />,
  );

  if (!output.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw new Error("PDF output is missing the PDF signature.");
  }
  if (output.byteLength < 10_000) {
    throw new Error(`PDF output is unexpectedly small (${output.byteLength} bytes).`);
  }

  console.log(`PDF_EXPORT_PASS bytes=${output.byteLength}`);
}

void main();
