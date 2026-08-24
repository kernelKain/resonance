export type CsvTable = {
  headers: string[];
  rows: Record<string, string>[];
};

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