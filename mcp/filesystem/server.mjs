import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod/v4";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOWED_DIRS = ["uploads", "analysis", "demo_data"].map((dir) =>
  path.join(ROOT, dir),
);
const HOST = process.env.MCP_HOST ?? "127.0.0.1";
const PORT = Number(process.env.MCP_PORT ?? 8792);

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
      if (row.some((cell) => cell.trim().length > 0)) records.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char !== "\r") field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim().length > 0)) records.push(row);
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

function resolveSafePath(filename) {
  const requested = filename.replace(/^\/+/, "");
  const candidates = ALLOWED_DIRS.map((dir) => path.resolve(dir, requested));
  const match = candidates.find((candidate) =>
    ALLOWED_DIRS.some(
      (dir) => candidate === dir || candidate.startsWith(`${dir}${path.sep}`),
    ),
  );
  if (!match) {
    throw new Error(
      "Path is outside the allowed Resonance directories (uploads, analysis, demo_data).",
    );
  }
  return match;
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
    version: "1.0.0",
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
        "List CSV files the Resonance app has saved into uploads/, analysis/, or demo_data/.",
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
        "Parse a reviews CSV and return rows. Looks for a review_text column. Pass filename as saved by the upload API, e.g. reviews_1724500000.csv or demo_data/sample_reviews.csv.",
      inputSchema: {
        filename: z
          .string()
          .describe("CSV filename or relative path under uploads/, analysis/, or demo_data/."),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Optional max number of review rows to return."),
      },
      annotations: readOnly,
    },
    async ({ filename, limit }) => {
      const fullPath = resolveSafePath(filename);
      const text = await fs.readFile(fullPath, "utf8");
      const parsed = parseCsv(text);
      const reviewHeader = parsed.headers.find(
        (header) => header.toLowerCase().replace(/[\s-]/g, "_") === "review_text",
      );
      if (!reviewHeader) {
        throw new Error("CSV is missing a review_text column.");
      }
      const rows = limit ? parsed.rows.slice(0, limit) : parsed.rows;
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
        "Read a UTF-8 file from uploads/, analysis/, or demo_data/. Use this for JSON artifacts later in the pipeline.",
      inputSchema: {
        filename: z.string().describe("Relative path under an allowed directory."),
      },
      annotations: readOnly,
    },
    async ({ filename }) => {
      const fullPath = resolveSafePath(filename);
      const text = await fs.readFile(fullPath, "utf8");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: path.relative(ROOT, fullPath),
                bytes: Buffer.byteLength(text),
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
    port: PORT,
    allowedDirs: ALLOWED_DIRS.map((dir) => path.relative(ROOT, dir)),
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
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. POST JSON-RPC to /mcp." },
    id: null,
  });
});

app.listen(PORT, HOST, () => {
  console.log(
    `Resonance filesystem MCP listening on http://${HOST}:${PORT}/mcp`,
  );
});