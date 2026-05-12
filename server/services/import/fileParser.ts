import Papa from "papaparse";
import * as XLSX from "xlsx";

export function parseBuffer(
  buffer: Buffer,
  mimetype: string
): Record<string, string>[] {
  if (mimetype === "text/csv") {
    const result = Papa.parse<Record<string, string>>(
      buffer.toString("utf-8"),
      {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
      }
    );
    return result.data;
  }

  if (
    mimetype ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json<Record<string, string>>(
      workbook.Sheets[sheetName],
      { defval: "", raw: false }
    );
  }

  throw new Error(`Unsupported file type: ${mimetype}`);
}
