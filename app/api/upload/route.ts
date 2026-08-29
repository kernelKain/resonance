import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { UPLOAD_DIR } from "@/lib/config";
import { parseCsv, requireReviewTextColumn } from "@/lib/csv";

export const runtime = "nodejs";

/** Serialises a parsed CSV table back to a CSV string (RFC-4180). */
function serialiseCsv(headers: string[], rows: Record<string, string>[]): string {
  function escapeCell(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  const lines: string[] = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Attach a CSV file under the 'file' field." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { success: false, error: "Only .csv files are accepted." },
        { status: 400 },
      );
    }

    const text = await file.text();
    const parsed = parseCsv(text);
    const reviewTextCol = requireReviewTextColumn(parsed.headers);

    const nonEmpty = parsed.rows.filter((row) =>
      Object.values(row).some((value) => value.length > 0),
    );
    if (nonEmpty.length === 0) {
      return NextResponse.json(
        { success: false, error: "CSV has a header but no review rows." },
        { status: 400 },
      );
    }

    // ── Pre-filter: keep short reviews (1-2 sentences, ≤ 400 chars), cap at 100
    const filtered = nonEmpty
      .filter((row) => {
        const reviewText = row[reviewTextCol] ?? "";
        if (reviewText.length > 400) return false;
        // Count sentence boundaries — allow up to 4 (≈ 2 sentences with trailing punctuation)
        const sentenceCount = (reviewText.match(/[.!?]/g) ?? []).length;
        return sentenceCount <= 4;
      })
      .slice(0, 100);

    // Fall back to the first 100 non-empty rows if the filter removes everything
    const rowsToWrite = filtered.length > 0 ? filtered : nonEmpty.slice(0, 100);
    const csvToWrite = serialiseCsv(parsed.headers, rowsToWrite);

    await mkdir(UPLOAD_DIR, { recursive: true });
    const stamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `reviews_${stamp}_${safeName}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await writeFile(filePath, csvToWrite, "utf8");

    return NextResponse.json({
      success: true,
      filePath: `${UPLOAD_DIR}/${filename}`,
      filename,
      rowCount: nonEmpty.length,
      filteredRowCount: rowsToWrite.length,
      columns: parsed.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}