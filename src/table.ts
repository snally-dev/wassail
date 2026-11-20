import type { Table } from "./models.js";

export function renderTable(table: Table): string {
  const widths = table.headers.map((header, column) =>
    Math.max(
      header.length,
      ...table.rows.map((row) => visibleLength(row[column] ?? "")),
    ),
  );
  const row = (values: string[]) =>
    values
      .map((value, column) => value.padEnd(widths[column] ?? value.length))
      .join("  ")
      .trimEnd();
  const separator = widths.map((width) => "─".repeat(width)).join("  ");
  return [
    table.title,
    row(table.headers),
    separator,
    ...table.rows.map(row),
  ].join("\n");
}

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const visibleLength = (value: string) => value.replace(ANSI_ESCAPE, "").length;
