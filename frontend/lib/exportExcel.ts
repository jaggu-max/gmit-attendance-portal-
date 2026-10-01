"use client";

export interface ExcelColumn {
  header: string;
  width?: number;
  alignment?: "left" | "center" | "right";
}

function excelColumnName(column: number): string {
  let result = "";
  let value = column;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export async function downloadExcel(
  filename: string,
  worksheetName: string,
  columns: ExcelColumn[],
  rows: Array<Array<string | number | null | undefined>>
): Promise<void> {
  if (!rows.length) return;

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GMIT Smart Attendance";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(worksheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  worksheet.columns = columns.map((column, index) => {
    const maxCellWidth = rows.reduce((max, row) => {
      const cell = row[index];
      const longestLine = String(cell ?? "").split(/\r?\n/).reduce(
        (longest, line) => Math.max(longest, line.length),
        0
      );
      return Math.max(max, longestLine);
    }, column.header.length);
    return {
      key: `column${index}`,
      width: column.width ?? Math.min(48, Math.max(12, maxCellWidth + 3)),
    };
  });

  worksheet.addRow(columns.map((column) => column.header));
  const header = worksheet.getRow(1);
  header.height = 30;
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.eachCell((cell) => {
    cell.border = { bottom: { style: "medium", color: { argb: "FF10B981" } } };
  });

  rows.forEach((values, rowIndex) => {
    const row = worksheet.addRow(values);
    const wrappedLines = values.reduce<number>((max, value, index) => {
      const width = worksheet.getColumn(index + 1).width ?? 12;
      const lines = String(value ?? "").split(/\r?\n/).reduce(
        (count, line) => count + Math.max(1, Math.ceil(line.length / Math.max(width - 2, 1))),
        0
      );
      return Math.max(max, lines);
    }, 1);
    row.height = Math.min(90, Math.max(22, wrappedLines * 17));
    row.eachCell((cell, columnNumber) => {
      const value = values[columnNumber - 1];
      const alignment = columns[columnNumber - 1]?.alignment ??
        (typeof value === "number" ? "right" : "left");
      cell.alignment = { vertical: "middle", horizontal: alignment, wrapText: true, shrinkToFit: false };
      if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      }
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
    });
  });

  worksheet.autoFilter = `A1:${excelColumnName(columns.length)}${rows.length + 1}`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
