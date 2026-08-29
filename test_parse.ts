import * as fs from "fs";
import { extractResonanceStream } from "./lib/resonance-parse";

const text = fs.readFileSync("public/demo/stream_fixture.txt", "utf8");
const parsed = extractResonanceStream(text);
console.log(JSON.stringify(parsed, null, 2));
