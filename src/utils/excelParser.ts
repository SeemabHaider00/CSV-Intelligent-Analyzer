import { read, utils } from "xlsx";

export interface ExcelParseResult {
  headers: string[];
  rowCount: number;
  sampleRows: string[][];
  exceededLimit: boolean;
  actualRowsInExcel: number;
}

/**
 * Parses an Excel (.xlsx/.xls) file and handles limits of up to 50,000 rows.
 * If data exceeds 50,000 rows, it flags `exceededLimit` and returns sample rows from the first 50,000 rows,
 * instructing the user to save as CSV for processing larger datasets.
 */
export async function parseExcelFile(file: File): Promise<ExcelParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error("Could not read file data.");
        }

        const workbook = read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error("The Excel file doesn't appear to have any worksheets.");
        }

        const worksheet = workbook.Sheets[firstSheetName];
        // Convert to a 2D array of strings/numbers
        const rawJson = utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
        
        if (rawJson.length === 0) {
          throw new Error("The worksheet appears to be empty.");
        }

        // Headers are first row
        const headers: string[] = rawJson[0]
          .map((h: any) => String(h).trim())
          .filter((h: string) => h !== "");

        if (headers.length === 0) {
          throw new Error("Unable to identify headers or column structures in this Excel worksheet.");
        }

        // Rows exclude the header
        const allDataRows = rawJson.slice(1);
        const actualRowsInExcel = allDataRows.length;
        const exceededLimit = actualRowsInExcel > 50000;

        // Take data rows, capped at 50,000 (or actual rows if fewer)
        const processedRows = exceededLimit ? allDataRows.slice(0, 50000) : allDataRows;

        // Convert cells to string arrays
        const formattedRows: string[][] = processedRows.map((row: any[]) => {
          // Keep lengths equal to header list length
          const formatted = Array.from({ length: headers.length }, (_, colIndex) => {
            const val = row[colIndex];
            return val !== undefined && val !== null ? String(val).trim() : "";
          });
          return formatted;
        });

        // Pull statistical samples to send to Gemini (limit to 30 keys to be highly responsive)
        let sampleRows = formattedRows.slice(0, 30);
        if (formattedRows.length > 30) {
          const midOffset = Math.floor(formattedRows.length / 2);
          sampleRows = [
            ...formattedRows.slice(0, 10),
            ...formattedRows.slice(midOffset - 5, midOffset + 5),
            ...formattedRows.slice(-10)
          ];
        }

        resolve({
          headers,
          rowCount: formattedRows.length,
          sampleRows,
          exceededLimit,
          actualRowsInExcel
        });

      } catch (err: any) {
        reject(new Error(err.message || "An error occurred while parsing the Excel workbook. Please verify the file is not corrupted."));
      }
    };

    reader.onerror = () => {
      reject(new Error("Unable to read the Excel file."));
    };

    reader.readAsArrayBuffer(file);
  });
}
