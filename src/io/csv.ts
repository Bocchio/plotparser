export interface Table {
  columns: string[];
  rows: (number | string)[][];
}

function fmtCell(v: number | string): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    return parseFloat(v.toPrecision(6)).toString();
  }
  return v;
}

function esc(s: string, delim: string): string {
  if (s.includes('"') || s.includes('\n') || s.includes(delim)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function tableToDelimited(table: Table, delim = ','): string {
  const lines: string[] = [];
  lines.push(table.columns.map((c) => esc(c, delim)).join(delim));
  for (const row of table.rows) {
    lines.push(row.map((v) => esc(fmtCell(v), delim)).join(delim));
  }
  return lines.join('\n');
}

export const tableToCSV = (t: Table) => tableToDelimited(t, ',');
export const tableToTSV = (t: Table) => tableToDelimited(t, '\t');
