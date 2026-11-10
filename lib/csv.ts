export type CsvColumn = {
  key: string;
  header: string;
  type?: "text" | "number" | "boolean";
};

export type CsvRow = Record<string, unknown>;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const CREATIVE_TRUNCATION = " [truncated]";

export function formatUtc(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date for CSV export: ${String(value)}`);
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function truncateCreativeText(value: string): string {
  const maxLength = 32_000;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}${CREATIVE_TRUNCATION}`;
}

function cellValue(value: unknown, type: CsvColumn["type"]): string {
  if (value == null) return "";
  if (value instanceof Date) return formatUtc(value);

  let text = String(value);
  if ((type ?? "text") === "text" && FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv(
  columns: readonly CsvColumn[],
  rows: readonly CsvRow[],
): string {
  const records = [
    columns.map((column) => cellValue(column.header, "text")).join(","),
    ...rows.map((row) =>
      columns
        .map((column) => cellValue(row[column.key], column.type))
        .join(","),
    ),
  ];
  return `\uFEFF${records.join("\r\n")}\r\n`;
}
