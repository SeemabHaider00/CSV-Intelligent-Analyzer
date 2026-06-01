import React, { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { BarChart3, PieChart as PieIcon, TrendingUp, HelpCircle, Sigma, Hash } from "lucide-react";
import { ColumnAnalysis } from "../types";

interface DataVisualizerProps {
  headers: string[];
  columns: ColumnAnalysis[];
  sampleRows: string[][];
}

export function DataVisualizer({ headers, columns, sampleRows }: DataVisualizerProps) {
  // Find valid columns with data
  const visualizableColumns = useMemo(() => {
    return columns.filter(col => {
      const colIndex = headers.indexOf(col.name);
      if (colIndex === -1) return false;
      // Ensure there are at least some actual values present in samples
      const sampleCount = sampleRows.filter(row => row[colIndex] !== undefined && row[colIndex] !== "").length;
      return sampleCount > 0;
    });
  }, [headers, columns, sampleRows]);

  // Default selection to first visualizable column
  const [selectedColumnName, setSelectedColumnName] = useState<string>(() => {
    const firstMatch = visualizableColumns.find(c => 
      c.inferredType.toLowerCase().includes("category") || 
      c.inferredType.toLowerCase().includes("numeric") ||
      c.inferredType.toLowerCase().includes("currency") ||
      c.inferredType.toLowerCase().includes("bool")
    );
    return firstMatch ? firstMatch.name : (visualizableColumns[0]?.name || "");
  });

  const selectedColumn = useMemo(() => {
    return visualizableColumns.find(c => c.name === selectedColumnName);
  }, [visualizableColumns, selectedColumnName]);

  // Compute stats and distribution payload based on column value
  const chartData = useMemo(() => {
    if (!selectedColumn) return null;
    const colIndex = headers.indexOf(selectedColumn.name);
    if (colIndex === -1) return null;

    // Direct cell string values
    const rawValues = sampleRows
      .map(row => row[colIndex])
      .filter(val => val !== undefined && val !== null && val.trim() !== "");

    const isNumericType = 
      selectedColumn.inferredType.toLowerCase().includes("numeric") ||
      selectedColumn.inferredType.toLowerCase().includes("currency") ||
      selectedColumn.inferredType.toLowerCase().includes("price") ||
      rawValues.every(v => !isNaN(Number(v.replace(/[^0-9.-]/g, ""))));

    if (isNumericType && rawValues.length > 0) {
      // 1. Process as Numeric distribution (Histogram bucket analyzer)
      const numbers = rawValues
        .map(v => Number(v.replace(/[^0-9.-]/g, "")))
        .filter(n => !isNaN(n));

      if (numbers.length === 0) return { type: "empty" };

      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      const sum = numbers.reduce((a, b) => a + b, 0);
      const avg = sum / numbers.length;
      
      // Calculate median
      const sorted = [...numbers].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

      // Construct 6 histogram buckets
      const bucketCount = Math.min(6, numbers.length);
      const range = max - min;
      
      if (range === 0 || bucketCount <= 1) {
        // All numbers identical
        return {
          type: "numeric",
          stats: { min, max, avg, median, count: numbers.length },
          distribution: [{ name: `${min}`, count: numbers.length }]
        };
      }

      const step = range / bucketCount;
      const buckets = Array.from({ length: bucketCount }, (_, i) => {
        const start = min + i * step;
        const end = start + step;
        return {
          start,
          end,
          label: `${start.toFixed(1)} - ${end.toFixed(1)}`,
          count: 0
        };
      });

      numbers.forEach(n => {
        // Assign to correct bucket
        let assigned = false;
        for (let i = 0; i < buckets.length; i++) {
          const isLast = i === buckets.length - 1;
          const inRange = isLast 
            ? (n >= buckets[i].start && n <= buckets[i].end)
            : (n >= buckets[i].start && n < buckets[i].end);
          if (inRange) {
            buckets[i].count++;
            assigned = true;
            break;
          }
        }
        // Fallback for floating inaccuracies
        if (!assigned && n >= min && n <= max) {
          buckets[buckets.length - 1].count++;
        }
      });

      return {
        type: "numeric",
        stats: { min, max, avg, median, count: numbers.length },
        distribution: buckets.map(b => ({
          name: b.label,
          count: b.count,
        }))
      };

    } else {
      // 2. Process as Categorical values frequency analyzer
      const frequencyMap: Record<string, number> = {};
      rawValues.forEach(val => {
        const label = val.trim();
        frequencyMap[label] = (frequencyMap[label] || 0) + 1;
      });

      const sortedFreqs = Object.entries(frequencyMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // Take top 10 values, optionally sum remaining under "Others"
      const maxCategories = 10;
      let distribution = sortedFreqs.slice(0, maxCategories);
      
      if (sortedFreqs.length > maxCategories) {
        const othersCount = sortedFreqs
          .slice(maxCategories)
          .reduce((sum, item) => sum + item.count, 0);
        distribution.push({ name: "Other categories", count: othersCount });
      }

      return {
        type: "categorical",
        stats: {
          uniqueTypes: Object.keys(frequencyMap).length,
          totalCount: rawValues.length,
          mostFrequent: sortedFreqs[0]?.name || "N/A",
          mostFrequentCount: sortedFreqs[0]?.count || 0
        },
        distribution
      };
    }
  }, [selectedColumn, headers, sampleRows]);

  // Color sequence generator
  const colors = ["#4f46e5", "#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#3b82f6"];

  if (visualizableColumns.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center" id="visualizer-no-columns">
        <HelpCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h5 className="font-semibold text-slate-700 mb-1">No Columns Available</h5>
        <p className="text-xs text-slate-400">
          This parsed dataset does not contain sufficient columns with valid values for plotting.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-6" id="visualizer-root">
      
      {/* Header and selection tool */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h4 className="font-semibold text-slate-800 text-base flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Distribution Visualizer
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Statistical groupings computed instantly from sampled data rows.
          </p>
        </div>

        {/* Dropdown column selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="col-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            Select Column:
          </label>
          <select
            id="col-select"
            value={selectedColumnName}
            onChange={(e) => setSelectedColumnName(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100/80 text-xs font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-150 transition cursor-pointer"
          >
            {visualizableColumns.map((col, index) => (
              <option key={index} value={col.name}>
                {col.name} ({col.inferredType})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: Statistics Card & Distribution Chart */}
      {chartData && chartData.type !== "empty" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Statistics summary side column */}
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-150 rounded-xl p-4.5 space-y-3.5">
              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-slate-400" />
                Column Metrics Profile
              </h5>

              <div className="space-y-2.5">
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">Profiled Column</span>
                  <span className="text-sm font-semibold text-slate-800 break-all">{selectedColumn?.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">Inferred Datatype</span>
                  <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                    {selectedColumn?.inferredType}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-200/60 pt-3 space-y-2.5">
                {chartData.type === "numeric" && chartData.stats ? (
                  <>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Minimum</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {chartData.stats.min.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Maximum</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {chartData.stats.max.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Average (Mean)</span>
                      <span className="font-mono font-semibold text-indigo-600">
                        {chartData.stats.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Median</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {chartData.stats.median.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Analyzed Samples</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {chartData.stats.count} cells
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Unique Classes</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {chartData.stats.uniqueTypes}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Top Category</span>
                      <span className="font-semibold text-teal-700 max-w-[140px] truncate block text-right" title={chartData.stats.mostFrequent}>
                        {chartData.stats.mostFrequent}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Top Frequency</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {chartData.stats.mostFrequentCount} occurrences
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Inference Confidence</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {selectedColumn?.confidence}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Inferred Context Description */}
            <div className="p-4 bg-indigo-50/40 border border-indigo-100/75 rounded-xl text-xs space-y-1">
              <span className="font-bold text-indigo-800 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Logical Semantic Meaning
              </span>
              <p className="text-indigo-950/85 leading-relaxed">
                "{selectedColumn?.meaning}"
              </p>
            </div>
          </div>

          {/* Interactive Recharts Display canvas */}
          <div className="lg:col-span-2 flex flex-col justify-between">
            <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-150 inline-flex items-center gap-1.5 mb-2.5 text-slate-500 max-w-fit">
              <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                {chartData.type === "numeric" 
                  ? "Histogram frequency chart (Grouping intervals)"
                  : "Categorical relative counts chart (Discrete groups)"
                }
              </span>
            </div>

            <div className="h-[260px] w-full" id="recharts-container-element">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData.distribution}
                  margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={{ stroke: "#e2e8f0" }}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={{ stroke: "#e2e8f0" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "none",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "11px",
                      padding: "8px 12px"
                    }}
                    cursor={{ fill: "#f8fafc", opacity: 0.6 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.distribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex gap-4.5 justify-center items-center pt-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-indigo-600 rounded-sm inline-block"></span>
                Primary count
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-cyan-500 rounded-sm inline-block"></span>
                Secondary class
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-purple-500 rounded-sm inline-block"></span>
                Minor groups
              </span>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-150 rounded-xl p-10 text-center text-slate-400 text-sm">
          No records found inside column to plot distribution records.
        </div>
      )}

    </div>
  );
}
