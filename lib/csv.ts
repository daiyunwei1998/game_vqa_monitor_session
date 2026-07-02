import Papa from "papaparse";

export function parseCsv<T>(text: string): T[] {
  const result = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim()
  });

  if (result.errors.length > 0) {
    const message = result.errors.map((error) => error.message).join("; ");
    throw new Error(message);
  }

  return result.data;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return Papa.unparse(rows, { columns, newline: "\r\n" });
}
