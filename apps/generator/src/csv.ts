import { readFile } from "node:fs/promises";

/** Parse RFC 4180-style CSV, including quoted commas, quotes and newlines. */
export async function readCsv(path: string): Promise<string[][]> {
  const input = await readFile(path, "utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = input.charCodeAt(0) === 0xfeff ? 1 : 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (field.length || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows;
}
