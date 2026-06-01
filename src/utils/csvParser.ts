import { parseCSVLine } from "./csvLineParser";

/**
 * Parses a CSV string into rows of string arrays
 */
export function parseCSVText(text: string): string[][] {
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if (char === '\r') {
      // Ignore carriage returns or handle with newlines
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = "";
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.map(line => parseCSVLine(line));
}

/**
 * Analyzes CSV metadata and extracts diverse sample rows from start, middle, and end.
 * Supports files of any size (even millions of rows / gigabytes) using File.slice.
 */
export async function analyzeAndSampleCSV(file: File): Promise<{
  headers: string[];
  rowCount: number;
  sampleRows: string[][];
  samplingUsed: boolean;
  estimated: boolean;
}> {
  const size = file.size;
  const isLarge = size > 15 * 1024 * 1024; // > 15 MB

  // 1. Read first chunk (up to 512KB) to extract headers and initial samples
  const firstChunkSize = Math.min(size, 512 * 1024);
  const firstBlob = file.slice(0, firstChunkSize);
  const firstText = await readBlobAsText(firstBlob);
  const startRowsObj = parseChunkWithHeaders(firstText);
  const headers = startRowsObj.headers;
  let sampleRows = startRowsObj.rows;

  if (headers.length === 0) {
    throw new Error("Unable to identify headers or column structures in this file.");
  }

  let totalRowCount = 0;
  let estimated = false;

  if (!isLarge) {
    // For small/medium files, read the whole file to count exact newlines
    const fullText = await readBlobAsText(file);
    const parsedAll = parseCSVText(fullText);
    // Row count excludes the header row if valid
    totalRowCount = Math.max(0, parsedAll.length - 1);
    // Keep a subset of rows as sample
    sampleRows = parsedAll.slice(1, 31); // grab up to 30 rows
  } else {
    // For massive files, we parse samples from start, middle, and end, and estimate/calculate rows.
    estimated = true;
    
    // Grab some samples from the middle
    try {
      const midOffset = Math.floor(size / 2);
      const midBlob = file.slice(midOffset, midOffset + 64 * 1024);
      const midText = await readBlobAsText(midBlob);
      const midRows = parseMidEndChunk(midText);
      if (midRows.length > 0) {
        sampleRows = [...sampleRows.slice(0, 15), ...midRows.slice(0, 10)];
      }
    } catch (e) {
      console.warn("Failed to read middle chunk", e);
    }

    // Grab some samples from the end
    try {
      const endOffset = Math.max(0, size - 128 * 1024);
      const endBlob = file.slice(endOffset, size);
      const endText = await readBlobAsText(endBlob);
      const endRows = parseMidEndChunk(endText);
      if (endRows.length > 0) {
        sampleRows = [...sampleRows, ...endRows.slice(-10)];
      }
    } catch (e) {
      console.warn("Failed to read end chunk", e);
    }

    // Limit statistical samples sent to Gemini to 40 max to keep payloads light
    if (sampleRows.length > 40) {
      sampleRows = [
        ...sampleRows.slice(0, 15),
        ...sampleRows.slice(Math.floor(sampleRows.length / 2) - 5, Math.floor(sampleRows.length / 2) + 5),
        ...sampleRows.slice(-10)
      ];
    }

    // Estimate row count using average row size from first chunk
    const firstLines = firstText.split('\n');
    let totalLineBytes = 0;
    let countedSampleLines = 0;
    
    // Skip header and trailing parsed line (maybe split) to calculate row length average
    for (let i = 1; i < firstLines.length - 1; i++) {
      totalLineBytes += new Blob([firstLines[i]]).size + 1; // +1 for the newline
      countedSampleLines++;
    }

    if (countedSampleLines > 0) {
      const avgRowSizeBytes = totalLineBytes / countedSampleLines;
      totalRowCount = Math.round((size - firstLines[0].length - 1) / avgRowSizeBytes);
    } else {
      // Fallback fallback estimation
      totalRowCount = Math.round(size / 150); 
    }
  }

  // Ensure overall list of sample rows don't exceed column list length
  sampleRows = sampleRows.map(row => {
    if (row.length < headers.length) {
      return [...row, ...Array(headers.length - row.length).fill("")];
    }
    return row.slice(0, headers.length);
  });

  return {
    headers,
    rowCount: totalRowCount,
    sampleRows,
    samplingUsed: isLarge,
    estimated
  };
}

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function parseChunkWithHeaders(text: string): { headers: string[]; rows: string[][] } {
  const allRows = parseCSVText(text);
  if (allRows.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = allRows[0].map(h => h.trim()).filter(h => h !== "");
  // Discard final row because it might be partial/incomplete due to slice cutoff
  const rows = allRows.slice(1, -1);
  return { headers, rows };
}

function parseMidEndChunk(text: string): string[][] {
  const allRows = parseCSVText(text);
  if (allRows.length <= 2) {
    return [];
  }
  // Discard first and last rows as they are highly likely to be sliced in half
  return allRows.slice(1, -1);
}
