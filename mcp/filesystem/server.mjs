import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod/v4";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOWED_DIR_NAMES = ["uploads", "analysis", "demo_data", "scripts"];
const ALLOWED_DIRS = ALLOWED_DIR_NAMES.map((dir) => path.join(ROOT, dir));
const ANALYSIS_DIR = path.join(ROOT, "analysis");
const HOST = process.env.MCP_HOST ?? "127.0.0.1";
const PORT = Number(process.env.MCP_PORT ?? 8792);
/** Keep in sync with MAX_ANALYZED_REVIEWS in lib/csv.ts */
const MAX_ANALYZED_REVIEWS = 50;

function parseCsv(text) {
  const records = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      if (row.some((cell) => cell.trim().length > 0)) {
        records.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim().length > 0)) {
      records.push(row);
    }
  }

  if (records.length === 0) {
    throw new Error("CSV is empty.");
  }

  const headers = records[0].map((header) => header.trim());
  const rows = records.slice(1).map((cells, index) => {
    const entry = { id: index + 1 };
    headers.forEach((header, headerIndex) => {
      entry[header] = (cells[headerIndex] ?? "").trim();
    });
    return entry;
  });

  return { headers, rows };
}

function isInsideAllowedDirectory(candidate) {
  return ALLOWED_DIRS.some(
    (dir) => candidate === dir || candidate.startsWith(`${dir}${path.sep}`),
  );
}

async function resolveSafePath(filename) {
  if (typeof filename !== "string" || !filename.trim()) {
    throw new Error("filename must be a non-empty string.");
  }

  const supplied = filename.trim();

  if (path.isAbsolute(supplied)) {
    throw new Error("Absolute paths are not allowed.");
  }

  const requested = supplied.replaceAll("\\", "/").replace(/^\.\/+/, "");
  const segments = requested.split("/");

  if (segments.some((segment) => segment === ".." || segment === "")) {
    throw new Error("Path traversal and empty path segments are not allowed.");
  }

  const firstSegment = segments[0];
  const candidates = ALLOWED_DIR_NAMES.includes(firstSegment)
    ? [path.resolve(ROOT, requested)]
    : ALLOWED_DIRS.map((dir) => path.resolve(dir, requested));

  for (const candidate of [...new Set(candidates)]) {
    if (!isInsideAllowedDirectory(candidate)) {
      continue;
    }

    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) {
        continue;
      }

      const realCandidate = await fs.realpath(candidate);
      const realAllowedDirs = await Promise.all(
        ALLOWED_DIRS.map(async (dir) => {
          try {
            return await fs.realpath(dir);
          } catch {
            return dir;
          }
        }),
      );

      const realPathIsAllowed = realAllowedDirs.some(
        (dir) =>
          realCandidate === dir ||
          realCandidate.startsWith(`${dir}${path.sep}`),
      );

      if (!realPathIsAllowed) {
        throw new Error(`Resolved file escapes the allowed directories: ${filename}`);
      }

      return realCandidate;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Resolved file escapes")
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    `File not found: ${filename}. Looked under uploads/, analysis/, demo_data/, and scripts/.`,
  );
}

function resolveAnalysisPath(filename) {
  if (typeof filename !== "string" || !filename.trim()) {
    throw new Error("filename must be a non-empty string.");
  }

  const supplied = filename.trim();

  if (path.isAbsolute(supplied)) {
    throw new Error("Writes are only allowed under analysis/.");
  }

  const requested = supplied
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^analysis\//, "");

  const segments = requested.split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) {
    throw new Error("Writes are only allowed under analysis/.");
  }

  const fullPath = path.resolve(ANALYSIS_DIR, requested);
  if (
    fullPath !== ANALYSIS_DIR &&
    !fullPath.startsWith(`${ANALYSIS_DIR}${path.sep}`)
  ) {
    throw new Error("Writes are only allowed under analysis/.");
  }

  return fullPath;
}

async function listCsvFiles() {
  const files = [];

  for (const dir of ALLOWED_DIRS) {
    let entries = [];

    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".csv")) continue;

      const fullPath = path.join(dir, entry.name);
      const stat = await fs.stat(fullPath);

      files.push({
        filename: entry.name,
        relativePath: path.relative(ROOT, fullPath),
        bytes: stat.size,
        directory: path.basename(dir),
      });
    }
  }

  return files;
}

function createServer() {
  const server = new McpServer({
    name: "resonance-filesystem",
    version: "1.2.0",
  });

  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };

  server.registerTool(
    "list_review_files",
    {
      title: "List review files",
      description:
        "List CSV files saved under uploads/, analysis/, demo_data/, or scripts/.",
      annotations: readOnly,
    },
    async () => {
      const files = await listCsvFiles();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: files.length, files }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "read_reviews",
    {
      title: "Read reviews CSV",
      description:
        `Parse a customer-reviews CSV and return its rows. Accepts either a basename such as sample_reviews.csv or an allowed relative path such as demo_data/sample_reviews.csv. Returns at most ${MAX_ANALYZED_REVIEWS} review rows.`,
      inputSchema: {
        filename: z
          .string()
          .min(1)
          .describe(
            "CSV basename or relative path under uploads/, analysis/, demo_data/, or scripts/.",
          ),
        limit: z
          .number()
          .int()
          .positive()
          .max(MAX_ANALYZED_REVIEWS)
          .optional()
          .describe(
            `Optional maximum number of review rows to return (capped at ${MAX_ANALYZED_REVIEWS}).`,
          ),
      },
      annotations: readOnly,
    },
    async ({ filename, limit }) => {
      const fullPath = await resolveSafePath(filename);
      const text = await fs.readFile(fullPath, "utf8");
      const parsed = parseCsv(text);

      const reviewHeader = parsed.headers.find(
        (header) =>
          header.toLowerCase().replace(/[\s-]/g, "_") === "review_text",
      );

      if (!reviewHeader) {
        throw new Error("CSV is missing a review_text column.");
      }

      const cap = Math.min(limit ?? MAX_ANALYZED_REVIEWS, MAX_ANALYZED_REVIEWS);
      const rows = parsed.rows.slice(0, cap);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: path.relative(ROOT, fullPath),
                headers: parsed.headers,
                review_text_column: reviewHeader,
                total_rows: parsed.rows.length,
                returned_rows: rows.length,
                reviews: rows,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "read_file",
    {
      title: "Read a workspace file",
      description:
        "Read a UTF-8 file from uploads/, analysis/, demo_data/, or scripts/. Accepts a basename such as cluster.py or an allowed relative path such as scripts/cluster.py.",
      inputSchema: {
        filename: z
          .string()
          .min(1)
          .describe(
            "File basename or relative path under uploads/, analysis/, demo_data/, or scripts/.",
          ),
      },
      annotations: readOnly,
    },
    async ({ filename }) => {
      const fullPath = await resolveSafePath(filename);
      const text = await fs.readFile(fullPath, "utf8");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: path.relative(ROOT, fullPath),
                bytes: Buffer.byteLength(text, "utf8"),
                content: text,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "write_analysis_file",
    {
      title: "Write an analysis file",
      description:
        "Write a UTF-8 artifact under analysis/ only, such as scored_reviews.json or cluster_results.json. Writes outside analysis/ are rejected.",
      inputSchema: {
        filename: z
          .string()
          .min(1)
          .describe(
            "Filename or relative path under analysis/, such as cluster_results.json.",
          ),
        content: z.string().describe("Complete UTF-8 file contents."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ filename, content }) => {
      if (Buffer.byteLength(content, "utf8") > 2_000_000) {
        throw new Error("Refusing to write more than 2MB.");
      }

      const fullPath = resolveAnalysisPath(filename);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf8");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: path.relative(ROOT, fullPath),
                bytes: Buffer.byteLength(content, "utf8"),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}

const app = createMcpExpressApp({
  host: HOST,
  allowedHosts: ["127.0.0.1", "localhost"],
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "resonance-filesystem",
    version: "1.2.0",
    port: PORT,
    allowedDirs: ALLOWED_DIR_NAMES,
  });
});

app.post("/mcp", async (req, res) => {
  const server = createServer();

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. POST JSON-RPC to /mcp.",
    },
    id: null,
  });
});

app.listen(PORT, HOST, () => {
  console.log(
    `Resonance filesystem MCP listening on http://${HOST}:${PORT}/mcp`,
  );
});