import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface PreviewResult {
  headers: string[];
  rows: Record<string, string>[];
}

export async function parsePreview(file: File): Promise<PreviewResult> {
  if (file.name.endsWith(".csv")) {
    return parseCsv(file);
  }
  return parseExcel(file);
}

function parseCsv(file: File): Promise<PreviewResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      preview: 10,
      complete: (results) =>
        resolve({
          headers: (results.meta.fields as string[]) ?? [],
          rows: results.data as Record<string, string>[],
        }),
      error: (err) => reject(err),
    });
  });
}

async function parseExcel(file: File): Promise<PreviewResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
    workbook.Sheets[sheetName],
    { defval: "", raw: false }
  );
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows: rows.slice(0, 10) };
}
