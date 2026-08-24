import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { UPLOAD_DIR } from "@/lib/config";
import { parseCsv, requireReviewTextColumn } from "@/lib/csv";

export const runtime = "nodejs";

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
    requireReviewTextColumn(parsed.headers);

    const nonEmpty = parsed.rows.filter((row) =>
      Object.values(row).some((value) => value.length > 0),
    );
    if (nonEmpty.length === 0) {
      return NextResponse.json(
        { success: false, error: "CSV has a header but no review rows." },
        { status: 400 },
      );
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const stamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `reviews_${stamp}_${safeName}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await writeFile(filePath, text, "utf8");

    return NextResponse.json({
      success: true,
      filePath: `${UPLOAD_DIR}/${filename}`,
      filename,
      rowCount: nonEmpty.length,
      columns: parsed.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}