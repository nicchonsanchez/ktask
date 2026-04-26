/**
 * Gera CSV no client e dispara download.
 * Escapa aspas duplas e encapsula valores com vírgula/quebra-de-linha.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const escape = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (/[",\n;]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csv = [headers, ...rows].map((row) => row.map(escape).join(';')).join('\n');

  // BOM pra Excel reconhecer UTF-8 corretamente
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
