import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BarChart3, AlertTriangle } from "lucide-react";
import type { HourlyAccuracyItem } from "@/types/api";
import { formatMw, formatPct, calculateQuantileMetrics, calculateHistogramBins } from "@/lib/formatters";

interface ErrorDistributionViewProps {
  items: HourlyAccuracyItem[];
}

export function ErrorDistributionView({ items }: ErrorDistributionViewProps) {
  const [histogramMode, setHistogramMode] = useState<"signed" | "absolute">("signed");

  // Compute quantile metrics
  const quantiles = useMemo(() => calculateQuantileMetrics(items), [items]);

  // Compute histogram bins with underflow/overflow safety
  const { bins, underflowCount, overflowCount, includedCount } = useMemo(
    () => calculateHistogramBins(items, histogramMode === "signed"),
    [items, histogramMode]
  );

  return (
    <div className="space-y-6">
      {/* 1. Quantile Breakdown & Exceedance Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* P50 Median */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider">Median Error (P50)</span>
            <span className="text-[10px] text-cyan-400 font-mono">Nearest-Rank</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-cyan-300">
            {formatMw(quantiles.p50)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            50% of hours had error below this value
          </div>
        </div>

        {/* P75 */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider">75th Percentile (P75)</span>
            <span className="text-[10px] text-slate-400 font-mono">Upper Quartile</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-slate-100">
            {formatMw(quantiles.p75)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            25% of hours exceeded this deviation
          </div>
        </div>

        {/* P90 */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider">90th Percentile (P90)</span>
            <span className="text-[10px] text-amber-400 font-mono">Elevated Deviation</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-amber-300">
            {formatMw(quantiles.p90)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Top 10% severe forecasting divergence
          </div>
        </div>

        {/* P95 Tail Risk */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider">95th Percentile (P95)</span>
            <span className="text-[10px] text-rose-400 font-mono">Tail Risk</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-rose-300">
            {formatMw(quantiles.p95)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Worst 5% forecast errors (imbalance risk)
          </div>
        </div>
      </div>

      {/* 2. Critical Deviation Threshold Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium block">
              Deviation &gt; 1,000 MW
            </span>
            <span className="font-mono text-xs text-slate-400">
              {quantiles.threshold1000Count} / {quantiles.validCount} valid hours
            </span>
          </div>
          <span className="text-base font-bold font-mono text-cyan-300">
            {formatPct(quantiles.threshold1000Pct)}
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium block">
              Deviation &gt; 2,000 MW
            </span>
            <span className="font-mono text-xs text-slate-400">
              {quantiles.threshold2000Count} / {quantiles.validCount} valid hours
            </span>
          </div>
          <span className="text-base font-bold font-mono text-amber-300">
            {formatPct(quantiles.threshold2000Pct)}
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-rose-400 font-semibold block flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Critical Deviation (&gt; 3,000 MW)
            </span>
            <span className="font-mono text-xs text-slate-400">
              {quantiles.threshold3000Count} / {quantiles.validCount} valid hours
            </span>
          </div>
          <span className="text-base font-bold font-mono text-rose-400">
            {formatPct(quantiles.threshold3000Pct)}
          </span>
        </div>
      </div>

      {/* 3. Interactive Histogram with Overflow/Underflow Safety */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              {histogramMode === "signed" ? "Signed Error Distribution (Forecast − Actual)" : "Absolute Error Magnitude Distribution (|Error|)"}
            </h3>
            <p className="text-xs text-slate-400">
              {includedCount} observations • 500 MW bins with explicit underflow/overflow accounting
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800 self-start sm:self-auto text-xs">
            <button
              type="button"
              onClick={() => setHistogramMode("signed")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                histogramMode === "signed"
                  ? "bg-cyan-950 text-cyan-300 border border-cyan-800/80 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Signed Error
            </button>
            <button
              type="button"
              onClick={() => setHistogramMode("absolute")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                histogramMode === "absolute"
                  ? "bg-cyan-950 text-cyan-300 border border-cyan-800/80 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Absolute Error
            </button>
          </div>
        </div>

        {/* Overflow/Underflow Alert Note */}
        {(underflowCount > 0 || overflowCount > 0) && (
          <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between font-mono">
            <span>
              Extreme Error Observations:
              {underflowCount > 0 && <span className="text-amber-400 ml-2">Underflow (&lt; -5,000 MW): {underflowCount}</span>}
              {overflowCount > 0 && <span className="text-rose-400 ml-2">Overflow (≥ +5,000 MW): {overflowCount}</span>}
            </span>
            <span className="text-slate-500">Explicitly plotted at boundary bins</span>
          </div>
        )}

        {/* Histogram Chart */}
        <div className="w-full h-80 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
              <XAxis
                dataKey="binLabel"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                angle={-30}
                textAnchor="end"
                interval={0}
                height={55}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v) => String(v)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const b = payload[0].payload;
                  return (
                    <div className="rounded-lg bg-[#080d1a] border border-slate-700/80 p-3 shadow-xl text-xs space-y-1 min-w-[200px]">
                      <div className="font-semibold text-slate-100 border-b border-slate-800 pb-1">
                        {b.binLabel}
                      </div>
                      <div className="flex justify-between items-center text-cyan-300">
                        <span>Observation Count:</span>
                        <span className="font-mono font-bold">{b.count} hrs</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Proportion:</span>
                        <span className="font-mono font-semibold">{formatPct(b.percentage)}</span>
                      </div>
                      {(b.isUnderflow || b.isOverflow) && (
                        <div className="text-[10px] text-amber-400 italic pt-1 border-t border-slate-800">
                          Boundary overflow bin
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {bins.map((entry, index) => {
                  let fillColor = "#06b6d4"; // default cyan
                  if (entry.isUnderflow) fillColor = "#f59e0b"; // amber for underflow
                  else if (entry.isOverflow) fillColor = "#f43f5e"; // rose for overflow
                  else if (histogramMode === "signed") {
                    if (entry.min < 0) fillColor = "#10b981"; // underforecast
                    else fillColor = "#f59e0b"; // overforecast
                  }
                  return <Cell key={`cell-${index}`} fill={fillColor} opacity={0.8} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
