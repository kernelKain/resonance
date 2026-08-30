/**
 * A parsed CSV table with typed headers and row objects.
 */
export type CsvTable = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Parses a CSV string into a {@link CsvTable}.
 *
 * Handles RFC-4180 quoted fields, escaped double-quotes (`""`), and both
 * `\n` / `\r\n` line endings. Empty rows are silently skipped.
 *
 * @param text - Raw CSV text content.
 * @returns Parsed table with `headers` (first row) and `rows` (remaining rows
 *   as key→value objects keyed by header name).
 * @throws {Error} If the CSV has no rows at all.
 */
export function parseCsv(text: string): CsvTable {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
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
  const rows = records.slice(1).map((cells) => {
    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header] = (cells[index] ?? "").trim();
    });
    return entry;
  });

  return { headers, rows };
}

/**
 * Validates that the CSV headers include a `review_text` column
 * (matched case-insensitively, with spaces and hyphens normalised to `_`).
 *
 * @param headers - Array of column header strings from {@link parseCsv}.
 * @returns The matched header string as it appears in the CSV.
 * @throws {Error} If no matching column is found.
 */
export function requireReviewTextColumn(headers: string[]): string {
  const match = headers.find(
    (header) => header.toLowerCase().replace(/[\s-]/g, "_") === "review_text",
  );
  if (!match) {
    throw new Error(
      "CSV must include a review_text column. Optional columns: rating, date, author.",
    );
  }
  return match;
}

const CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "text/comma-separated-values",
  "application/csv",
]);

const NON_CSV_MIME_PREFIXES = ["image/", "video/", "audio/", "font/"];

const NON_CSV_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/json",
  "application/javascript",
]);

/**
 * Permissive client-side check: require a `.csv` extension and reject obvious
 * non-CSV MIME types when the browser reports one.
 */
export function isCsvUploadCandidate(file: Pick<File, "name" | "type">): boolean {
  if (!file.name.toLowerCase().endsWith(".csv")) return false;

  const type = file.type.trim().toLowerCase();
  if (!type) return true;
  if (CSV_MIME_TYPES.has(type) || type.startsWith("text/")) return true;
  if (NON_CSV_MIME_PREFIXES.some((prefix) => type.startsWith(prefix))) return false;
  if (NON_CSV_MIME_TYPES.has(type)) return false;

  return true;
}

/**
 * Lightweight parse used before upload to surface CSV issues in the UI.
 *
 * @returns `null` when valid, otherwise a user-facing error message.
 */
export function validateCsvUploadText(text: string): string | null {
  try {
    const parsed = parseCsv(text);
    const reviewTextCol = requireReviewTextColumn(parsed.headers);
    const hasReviewRow = parsed.rows.some(
      (row) => (row[reviewTextCol] ?? "").trim().length > 0,
    );
    if (!hasReviewRow) {
      return "CSV has a header but no review rows.";
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid CSV file.";
  }
}