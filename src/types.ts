export interface ColumnAnalysis {
  name: string;
  inferredType: string;
  meaning: string;
  confidence: "High" | "Medium" | "Low" | "Unknown";
}

export interface AnalysisResult {
  fileName: string;
  fileSize: number; // in bytes
  rowCount: number;
  columnCount: number;
  columns: ColumnAnalysis[];
  overallSummary: string;
  dataGenre: string;
  samplingUsed: boolean;
}

export interface AnalyzePayload {
  fileName: string;
  fileSize: number;
  headers: string[];
  rowCount: number;
  sampleRows: string[][]; // Array of row values
  samplingUsed: boolean;
}
