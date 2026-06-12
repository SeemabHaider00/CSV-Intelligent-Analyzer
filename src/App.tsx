import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  ArrowRight,
  Database,
  Cpu,
  Columns,
  Play,
  CheckCircle2,
  RefreshCw,
  Eye,
  Info,
  Layers,
  FileCode,
  Sparkles,
  BarChart3
} from "lucide-react";
import { analyzeAndSampleCSV } from "./utils/csvParser";
import { parseExcelFile } from "./utils/excelParser";
import { AnalysisResult } from "./types";
import { DataVisualizer } from "./components/DataVisualizer";

// Simulated Sample Datasets representing high volume records
const SAMPLE_DATASETS = [
  {
    id: "ecommerce",
    title: "E-Commerce orders",
    rowsLabel: "154,204 rows",
    desc: "Transaction logs with IDs, purchase times, prices, and referrers.",
    fileName: "ecommerce_sales_2026.csv",
    fileSize: 1845200, // 1.8 MB
    rowCount: 154204,
    headers: ["Order_ID", "Purchase_Date", "Customer_Segment", "Product_SKU", "Quantity", "Price_USD", "Payment_Status", "Is_Referred"],
    sampleRows: [
      ["ORD-89420-1", "2026-05-18", "Corporate", "TECH-MNT-901", "2", "299.99", "Completed", "True"],
      ["ORD-41002-3", "2026-05-18", "Consumer", "HOME-LMP-042", "1", "45.00", "Completed", "False"],
      ["ORD-10948-2", "2026-05-19", "Consumer", "APPL-KTC-511", "1", "189.50", "Pending", "True"],
      ["ORD-66710-5", "2026-05-19", "Home Office", "OFFC-DSK-150", "4", "520.00", "Completed", "False"],
      ["ORD-11204-1", "2026-05-20", "Consumer", "FIT-WCH-884", "2", "125.00", "Failed", "False"],
      ["ORD-48911-0", "2026-05-20", "Corporate", "TECH-MNT-901", "1", "149.99", "Completed", "True"],
      ["ORD-50512-3", "2026-05-21", "Consumer", "HOME-BED-102", "3", "89.00", "Completed", "False"],
      ["ORD-92011-8", "2026-05-21", "Consumer", "ELEC-EP-004", "1", "24.50", "Completed", "False"],
      ["ORD-31294-4", "2026-05-22", "Home Office", "TECH-CH-710", "1", "245.00", "Completed", "True"],
      ["ORD-77102-9", "2026-05-22", "Corporate", "OFFC-PRN-301", "5", "1200.00", "Completed", "False"]
    ]
  },
  {
    id: "weather",
    title: "Global sensor records",
    rowsLabel: "4,124,592 rows",
    desc: "Weather station logs with geographic coords and temperature diagnostics.",
    fileName: "sensor_telemetry_high_frequency.csv",
    fileSize: 341200500, // 341.2 MB
    rowCount: 4124592,
    headers: ["Timestamp_UTC", "Station_ID", "Latitude", "Longitude", "Air_Temp_C", "Humidity_Pct", "Wind_Speed_Kmh", "Precipitation_Mm", "Status_Flag"],
    sampleRows: [
      ["2026-05-22T00:00:00Z", "ST-AR-001", "34.0522", "-118.2437", "18.5", "62.4", "12.4", "0.0", "OK"],
      ["2026-05-22T00:01:00Z", "ST-AR-001", "34.0522", "-118.2437", "18.3", "62.8", "11.1", "0.0", "OK"],
      ["2026-05-22T00:02:00Z", "ST-AR-001", "34.0522", "-118.2437", "18.1", "63.1", "13.0", "0.0", "OK"],
      ["2026-05-22T00:03:00Z", "ST-AR-001", "34.0522", "-118.2437", "18.0", "63.5", "10.5", "0.1", "WARN"],
      ["2026-05-22T00:00:05Z", "ST-NY-094", "40.7128", "-74.0060", "22.1", "48.2", "8.5", "0.0", "OK"],
      ["2026-05-22T00:01:05Z", "ST-NY-094", "40.7128", "-74.0060", "22.3", "47.9", "7.2", "0.0", "OK"],
      ["2026-05-22T00:02:05Z", "ST-NY-094", "40.7128", "-74.0060", "21.9", "48.5", "9.0", "0.0", "OK"],
      ["2026-05-22T00:00:10Z", "ST-LN-319", "51.5074", "-0.1278", "12.4", "88.1", "24.1", "0.5", "OK"],
      ["2026-05-22T00:01:10Z", "ST-LN-319", "51.5074", "-0.1278", "12.2", "88.9", "22.5", "0.8", "OK"],
      ["2026-05-22T00:02:10Z", "ST-LN-319", "51.5074", "-0.1278", "12.0", "89.4", "21.0", "1.2", "OK"]
    ]
  }
];

export default function App() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isXlsxError, setIsXlsxError] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  
  // Pipeline status
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  
  // Scoped active parsed metadata
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [samplingUsed, setSamplingUsed] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState(false);
  const [sourceFileName, setSourceFileName] = useState("");
  const [sourceFileSize, setSourceFileSize] = useState<number>(0);

  // Excel support tracking
  const [fileTypeLoaded, setFileTypeLoaded] = useState<"CSV" | "EXCEL" | null>(null);
  const [xlsxRowsExceeded, setXlsxRowsExceeded] = useState(false);
  const [actualXlsxRowsCount, setActualXlsxRowsCount] = useState<number>(0);

  // Result state
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "columns" | "samples" | "visualizer">("summary");
  const [columnSearch, setColumnSearch] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Helper to format integers
  const formatRows = (rows: number): string => {
    return new Intl.NumberFormat().format(rows);
  };

  // Slices and parses files using browser streams / sampling
  const processCSVFile = async (selectedFile: File) => {
    setIsXlsxError(false);
    setGlobalError(null);
    setFile(selectedFile);
    setSourceFileName(selectedFile.name);
    setSourceFileSize(selectedFile.size);

    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    const isExcel = ext === "xlsx" || ext === "xls" || selectedFile.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    try {
      setParsing(true);
      if (isExcel) {
        setProgressMsg("Reading Excel workbook and extracting data up to 50,000 rows...");
        setFileTypeLoaded("EXCEL");
        
        const excelData = await parseExcelFile(selectedFile);
        
        setHeaders(excelData.headers);
        setRowCount(excelData.rowCount);
        setSampleRows(excelData.sampleRows);
        setSamplingUsed(false); // Excel dataset loaded into memory is mapped directly
        setEstimatedCount(false);
        setXlsxRowsExceeded(excelData.exceededLimit);
        setActualXlsxRowsCount(excelData.actualRowsInExcel);
        setParsing(false);

        // Instantly fire Gemini analysis
        await analyzeWithGemini(
          selectedFile.name,
          selectedFile.size,
          excelData.headers,
          excelData.rowCount,
          excelData.sampleRows,
          false
        );
      } else {
        // Standard CSV Loader
        setProgressMsg("Slicing CSV file and pulling statistical samples...");
        setFileTypeLoaded("CSV");
        setXlsxRowsExceeded(false);
        setActualXlsxRowsCount(0);
        
        const parsedData = await analyzeAndSampleCSV(selectedFile);
        
        setHeaders(parsedData.headers);
        setRowCount(parsedData.rowCount);
        setSampleRows(parsedData.sampleRows);
        setSamplingUsed(parsedData.samplingUsed);
        setEstimatedCount(parsedData.estimated);
        setParsing(false);

        // Instantly fire Gemini analysis
        await analyzeWithGemini(
          selectedFile.name,
          selectedFile.size,
          parsedData.headers,
          parsedData.rowCount,
          parsedData.sampleRows,
          parsedData.samplingUsed
        );
      }

    } catch (err: any) {
      console.error(err);
      setParsing(false);
      setGlobalError(err.message || "Could not parse files. Ensure the file is of the correct format (CSV or Excel).");
    }
  };

  // Hits the backend proxy calling the Gemini models
  const analyzeWithGemini = async (
    name: string,
    size: number,
    cols: string[],
    rowsTally: number,
    samples: string[][],
    isSampled: boolean
  ) => {
    try {
      setAnalyzing(true);
      setProgressMsg("Sending samples to Gemini for deep column schema analysis...");

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: name,
          fileSize: size,
          headers: cols,
          rowCount: rowsTally,
          sampleRows: samples,
          samplingUsed: isSampled
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed API response from the server.");
      }

      const outcome: AnalysisResult = await res.json();
      setAnalysis(outcome);
      setAnalyzing(false);
      setActiveTab("summary");
    } catch (err: any) {
      console.error(err);
      setAnalyzing(false);
      setGlobalError(err.message || "Analysis request failed. Please check your system configuration.");
    }
  };

  // Allows instant loading of high volume simulated scenarios
  const loadSimulatedDataset = async (datasetId: string) => {
    const dataset = SAMPLE_DATASETS.find(d => d.id === datasetId);
    if (!dataset) return;

    setIsXlsxError(false);
    setGlobalError(null);
    setFile(null); // Clear manual file block
    
    setSourceFileName(dataset.fileName);
    setSourceFileSize(dataset.fileSize);
    setHeaders(dataset.headers);
    setRowCount(dataset.rowCount);
    setSampleRows(dataset.sampleRows);
    setSamplingUsed(true); // Huge data simulation always sets sampling active
    setEstimatedCount(true);

    try {
      await analyzeWithGemini(
        dataset.fileName,
        dataset.fileSize,
        dataset.headers,
        dataset.rowCount,
        dataset.sampleRows,
        true
      );
    } catch (err: any) {
      setGlobalError(err.message);
    }
  };

  // Drag and Drop Handles
  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processCSVFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processCSVFile(e.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const resetState = () => {
    setFile(null);
    setAnalysis(null);
    setHeaders([]);
    setRowCount(0);
    setSampleRows([]);
    setIsXlsxError(false);
    setGlobalError(null);
    setColumnSearch("");
  };

  // Confidence color maps
  const getConfidenceStyle = (confidence: string) => {
    switch (confidence?.toLowerCase()) {
      case "high":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "medium":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "low":
        return "bg-orange-50 text-orange-700 border-orange-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // Categorical styling for data types
  const getTypeBadgeStyle = (datatype: string) => {
    const t = datatype?.toLowerCase() || "";
    if (t.includes("id") || t.includes("key")) return "bg-indigo-50 text-indigo-700 border border-indigo-100";
    if (t.includes("num") || t.includes("integer") || t.includes("float") || t.includes("double")) return "bg-teal-50 text-teal-700 border border-teal-100";
    if (t.includes("date") || t.includes("time") || t.includes("stamp")) return "bg-purple-50 text-purple-700 border border-purple-100";
    if (t.includes("bool") || t.includes("flag")) return "bg-blue-50 text-blue-700 border border-blue-100";
    if (t.includes("currency") || t.includes("price") || t.includes("usd")) return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    return "bg-slate-50 text-slate-700 border border-slate-150";
  };

  // Filter columns based on text search
  const filteredColumns = analysis?.columns.filter(col =>
    col.name.toLowerCase().includes(columnSearch.toLowerCase()) ||
    col.meaning.toLowerCase().includes(columnSearch.toLowerCase()) ||
    col.inferredType.toLowerCase().includes(columnSearch.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 flex flex-col items-center py-10 px-4 md:px-8">
      
      {/* Container wraps full responsive breadth */}
      <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-start">
        
        {/* Humble and minimalist UI Header */}
        <header className="mb-8 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center justify-center md:justify-start gap-2.5 mb-1.5">
              <span className="p-2 bg-indigo-600 rounded-lg text-white">
                <Database id="app-logo-icon" className="w-5 h-5 shrink-0" />
              </span>
              <h1 id="app-title-header" className="font-sans font-semibold tracking-tight text-2xl text-slate-900">
                CSV Analyzer & Summarizer
              </h1>
            </div>
            <p className="text-sm text-slate-500 max-w-xl">
              Upload files of any size. Leverages statistical sampling and Gemini AI to profiles columns, infer datatypes, and provide instant summaries.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex gap-2 justify-center">
            {analysis && (
              <button
                onClick={resetState}
                className="flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 text-xs font-semibold rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Analyze New File
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col">
          <AnimatePresence mode="wait">
            {!analysis && !parsing && !analyzing ? (
              <motion.div
                key="upload-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                
                {/* Visual Drag and Drop Interface */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={triggerFileSelect}
                  className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 min-h-[300px] bg-white ${
                    dragActive
                      ? "border-indigo-500 bg-indigo-50/40 relative scale-[0.99]"
                      : "border-slate-200 hover:border-slate-350 hover:bg-slate-50/55"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full mb-4">
                    <UploadCloud className="w-8 h-8" />
                  </div>

                  <h3 className="font-medium text-slate-800 text-lg mb-1">
                    {dragActive ? "Drop your dataset now" : "Upload your CSV or Excel Dataset"}
                  </h3>
                  <p className="text-xs text-slate-500 text-center max-w-md mb-4 leading-relaxed">
                    Drag and drop file here, or click to browse. Excel support is optimized for files up to <strong>50,000 rows</strong>. If Excel parsing fails or exceeds this limit, please use the <strong>CSV option</strong> as fallback.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex items-center gap-1.5 py-1.5 px-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-indigo-700 font-sans font-medium">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Excel (.xlsx, .xls) up to 50k rows</span>
                    </div>
                    <div className="flex items-center gap-1.5 py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 font-sans font-medium">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <span>CSV for higher volumes (Millions of rows)</span>
                    </div>
                  </div>
                </div>

                {/* XLSX Redirection Area if needed */}
                <AnimatePresence>
                  {isXlsxError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-800">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold mb-1">Excel formats (.xlsx) cannot be directly processed</p>
                          <p className="text-xs text-amber-700 leading-relaxed mb-2">
                            To process this dataset effortlessly on memory configurations, please convert it to CSV format. Open your worksheet, select <strong>File &gt; Save As &gt; Comma Separated Values (.csv)</strong>, and drop the resulting file back here.
                          </p>
                          <span className="inline-block text-xs font-semibold text-amber-900 border border-amber-300 bg-white/70 px-2.5 py-1 rounded">
                            Required constraint format: CSV
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* System General Error Alerts */}
                {globalError && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 text-sm text-rose-800">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold mb-1">Processing failure</p>
                      <p className="text-xs text-rose-700 leading-relaxed">{globalError}</p>
                    </div>
                  </div>
                )}

                {/* Simulated quick start modules */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <h4 className="text-sm font-semibold text-slate-800">
                      Or try instantly with simulated high-volume scenarios:
                    </h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SAMPLE_DATASETS.map((ds) => (
                      <div
                        key={ds.id}
                        onClick={() => loadSimulatedDataset(ds.id)}
                        className="p-4 border border-slate-150 rounded-xl hover:border-indigo-200 hover:bg-slate-50/40 cursor-pointer transition flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <h5 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                              {ds.title}
                            </h5>
                            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                              {ds.rowsLabel}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-normal mb-3">
                            {ds.desc}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-indigo-600 font-semibold pt-1">
                          Test statistical sampler
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </motion.div>
            ) : parsing || analyzing ? (
              
              /* Pipeline Progressive Loader */
              <motion.div
                key="loading-panel"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center min-h-[400px] text-center"
              >
                <div className="mb-6 relative">
                  <span className="relative flex h-14 w-14 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-100 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-11 w-11 bg-indigo-50 border border-indigo-200 items-center justify-center text-indigo-600">
                      <Cpu className="w-5 h-5 animate-pulse" />
                    </span>
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {parsing ? "Parsing File" : "Generating Statistical Insights"}
                </h3>
                <p className="text-sm text-slate-500 max-w-sm mb-4">
                  {progressMsg}
                </p>

                {/* Status checkpoints */}
                <div className="w-full max-w-xs space-y-2 mt-4 text-left bg-slate-50 border border-slate-150 p-4 rounded-xl">
                  <div className="flex items-center gap-2.5 text-xs">
                    <CheckCircle2 className={`w-4 h-4 ${parsing ? "text-indigo-500 animate-spin" : "text-emerald-500"}`} />
                    <span className={parsing ? "text-indigo-700 font-semibold" : "text-slate-500"}>
                      Read file stream and chunked bounds
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs">
                    <CheckCircle2 className={`w-4 h-4 ${analyzing ? "text-indigo-500 animate-spin" : "text-slate-300"}`} />
                    <span className={analyzing ? "text-indigo-700 font-semibold" : "text-slate-400"}>
                      Gemini profile & column metadata
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : (
              
              /* Complete Schema Results Dashboard */
              <motion.div
                key="results-panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                
                {/* File Header Block */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex gap-4 items-center">
                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 shrink-0">
                      <FileCode className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800 text-base leading-tight">
                        {sourceFileName}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span>{formatBytes(sourceFileSize)}</span>
                        <span className="text-slate-300">•</span>
                        <span>{formatRows(rowCount)} rows {estimatedCount && <span className="text-[10px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded border border-slate-200 inline">(Estimated)</span>}</span>
                        <span className="text-slate-300">•</span>
                        <span className="font-mono text-indigo-600 font-semibold">
                          Genre: {analysis?.dataGenre}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-lg text-xs leading-none shrink-0 text-slate-600">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-duration-1000"></span>
                      <span id="active-dot" className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-medium">
                      Processed via {fileTypeLoaded === "EXCEL" ? "Excel Loader (Direct)" : (samplingUsed ? "Statistical Sampler (Optimized)" : "Full File Scan")}
                    </span>
                  </div>
                </div>

                {/* Excel Row Cap Warning Alert */}
                {fileTypeLoaded === "EXCEL" && xlsxRowsExceeded && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4.5 flex gap-3 text-sm text-amber-800 shadow-sm" id="excel-limit-alert">
                    <AlertTriangle className="w-5.5 h-5.5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold mb-1">
                        Excel File Cap Applied (50,000 Rows Processed)
                      </p>
                      <p className="text-xs text-amber-700 leading-relaxed mb-2">
                        Aapki Excel file mein total <strong>{formatRows(actualXlsxRowsCount)} rows</strong> hain. Browser execution speed aur high UI rendering performance maintain karne ke liye maximum limit **50,000 rows** hai. Humne pehli 50,000 rows ka schema analysis successfully complete kiya hai.
                      </p>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        💡 <strong>Sifarish (CSV Fallback Option):</strong> Agar aap mukammal dataset bina limit analyze karna chahte hain, to is file ko Excel se <strong>Save As &gt; Comma Separated Values (.csv)</strong> kar ke upload karein. Hamara CSV sampler high-performance streaming capability se baghair kisi scale boundaries ke millions of rows handle kar leta hai!
                      </p>
                    </div>
                  </div>
                )}

                {/* Tab layout navigation */}
                <div className="border-b border-slate-150 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
                  <button
                    id="tab-summary"
                    onClick={() => setActiveTab("summary")}
                    className={`pb-3 px-1 relative cursor-pointer transition ${
                      activeTab === "summary" ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Dataset Summary
                    {activeTab === "summary" && (
                      <motion.div layoutId="active-tab" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-indigo-600" />
                    )}
                  </button>
                  <button
                    id="tab-columns"
                    onClick={() => setActiveTab("columns")}
                    className={`pb-3 px-1 relative cursor-pointer transition flex items-center gap-1.5 ${
                      activeTab === "columns" ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Columns & Meanings
                    <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] px-1.5 py-0.2 rounded-full font-sans font-medium">
                      {analysis?.columns.length}
                    </span>
                    {activeTab === "columns" && (
                      <motion.div layoutId="active-tab" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-indigo-600" />
                    )}
                  </button>
                  <button
                    id="tab-visualizer"
                    onClick={() => setActiveTab("visualizer")}
                    className={`pb-3 px-1 relative cursor-pointer transition flex items-center gap-1.5 ${
                      activeTab === "visualizer" ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <BarChart3 className="w-4 h-4 text-indigo-500 shrink-0" />
                    Distribution Charts
                    {activeTab === "visualizer" && (
                      <motion.div layoutId="active-tab" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-indigo-600" />
                    )}
                  </button>
                  <button
                    id="tab-samples"
                    onClick={() => setActiveTab("samples")}
                    className={`pb-3 px-1 relative cursor-pointer transition flex items-center gap-1.5 ${
                      activeTab === "samples" ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Statistical Samples Preview
                    {activeTab === "samples" && (
                      <motion.div layoutId="active-tab" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-indigo-600" />
                    )}
                  </button>
                </div>

                {/* Tab Content Display Area */}
                <div className="min-h-[200px]">
                  
                  {/* Summary Overview Tab */}
                  {activeTab === "summary" && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="w-5 h-5 text-indigo-600 shrink-0" />
                          <h4 className="font-semibold text-slate-800 text-base">
                            Overall Dataset Summary
                          </h4>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {analysis?.overallSummary}
                        </p>
                      </div>

                      {/* Stat summary bar */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block mb-1">
                            Total Row Count
                          </span>
                          <span className="text-2xl font-bold text-slate-900">
                            {formatRows(rowCount)}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-1">
                            {estimatedCount ? "*estimated for fast scanning" : "*exact row count parsed"}
                          </span>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block mb-1">
                            Columns Profiled
                          </span>
                          <span className="text-2xl font-bold text-slate-900">
                            {analysis?.columns.length}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-1">
                            *fully inferenced by Gemini
                          </span>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block mb-1">
                            Schema Data Genre
                          </span>
                          <span className="text-xl font-bold text-indigo-700 block truncate">
                            {analysis?.dataGenre}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-1.5">
                            *contextual domain label
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Columns Detail List tab */}
                  {activeTab === "columns" && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {/* Search Bar for Columns */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search column names, inferred types, or meanings..."
                          value={columnSearch}
                          onChange={(e) => setColumnSearch(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-150 focus:border-indigo-500 text-slate-700 transition"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4.5">
                        {filteredColumns.map((col, index) => (
                          <div
                            key={index}
                            className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-start justify-between gap-4"
                          >
                            <div className="space-y-2 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                  {col.name}
                                </span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getTypeBadgeStyle(col.inferredType)}`}>
                                  {col.inferredType}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 leading-relaxed md:max-w-3xl">
                                {col.meaning}
                              </p>
                            </div>

                            <div className="shrink-0 flex md:flex-col items-center md:items-end justify-between md:justify-start gap-1">
                              <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                                Confidence
                              </span>
                              <span className={`text-[10px] md:text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getConfidenceStyle(col.confidence)}`}>
                                {col.confidence}
                              </span>
                            </div>
                          </div>
                        ))}

                        {filteredColumns.length === 0 && (
                          <div className="text-center py-12 bg-white border border-slate-250 border-dashed rounded-xl">
                            <p className="text-sm text-slate-400 font-medium">
                              No columns matched your query "{columnSearch}"
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Sample Data Tab Grid */}
                  {activeTab === "samples" && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col"
                    >
                      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-slate-500 shrink-0" />
                          <h4 className="text-sm font-semibold text-slate-700">
                            Statistical Samples View (Order Order conformant)
                          </h4>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-mono">
                          Displaying {sampleRows.slice(0, 10).length} statistical rows
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-150 bg-slate-50/50">
                              {headers.map((h, i) => (
                                <th key={i} className="p-3.5 text-xs font-bold font-mono text-slate-600 whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sampleRows.slice(0, 10).map((row, rIndex) => (
                              <tr key={rIndex} className="border-b border-slate-100 hover:bg-slate-50/20 last:border-0">
                                {headers.map((_, cIndex) => (
                                  <td key={cIndex} className="p-3.5 text-xs font-mono text-slate-500 max-w-[200px] truncate">
                                    {row[cIndex] !== undefined && row[cIndex] !== "" ? row[cIndex] : (
                                      <span className="text-slate-300 italic">null</span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "visualizer" && analysis && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <DataVisualizer
                        headers={headers}
                        columns={analysis.columns}
                        sampleRows={sampleRows}
                      />
                    </motion.div>
                  )}

                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <footer className="w-full max-w-5xl mx-auto mt-12 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
        <p>CSV Analyzer & Summarizer — Modern full-stack statistical dataset metadata prompter</p>
        <div className="flex items-center gap-4">
          <p className="flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-indigo-500" /> Powered by Gemini-3.5-flash
          </p>
        </div>
      </footer>

    </div>
  );
}
