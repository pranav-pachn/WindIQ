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
import { CHART_THEME } from "@/lib/chart-theme";

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
        <div className="p-4 rounded-xl bg-app-surface border border-app-border">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider">Median Error (P50)</span>
            <span className="text-[10px] text-accent font-mono">Nearest-Rank</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-accent">
            {formatMw(quantiles.p50)}
          </div>
          <div className="text-[11px] text-muted mt-1">
            50% of hours had error below this value
          </div>
        </div>

        {/* P75 */}
        <div className="p-4 rounded-xl bg-app-surface border border-app-border">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider">75th Percentile (P75)</span>
            <span className="text-[10px] text-muted font-mono">Upper Quartile</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-slate-100">
            {formatMw(quantiles.p75)}
          </div>
          <div className="text-[11px] text-muted mt-1">
            25% of hours exceeded this deviation
          </div>
        </div>

        {/* P90 */}
        <div className="p-4 rounded-xl bg-app-surface border border-app-border">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider">90th Percentile (P90)</span>
            <span className="text-[10px] text-amber-400 font-mono">Elevated</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-amber-300">
            {formatMw(quantiles.p90)}
          </div>
          <div className="text-[11px] text-muted mt-1">
            Top 10% severe forecasting divergence
          </div>
        </div>

        {/* P95 Tail Risk */}
        <div className="p-4 rounded-xl bg-app-surface border border-app-border">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider">95th Percentile (P95)</span>
            <span className="text-[10px] text-rose-400 font-mono">Tail Risk</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-rose-300">
            {formatMw(quantiles.p95)}
          </div>
          <div className="text-[11px] text-muted mt-1">
            Worst 5% forecast errors (imbalance risk)
          </div>
        </div>
      </div>

      {/* 2. Critical Deviation Threshold Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="p-3.5 rounded-lg bg-app-surface border border-app-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-muted font-medium block">
              Deviation &gt; 1,000 MW
            </span>
            <span className="font-mono text-xs text-muted">
              {quantiles.threshold1000Count} / {quantiles.validCount} valid hours
            </span>
          </div>
          <span className="text-base font-bold font-mono text-accent">
            {formatPct(quantiles.threshold1000Pct)}
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-app-surface border border-app-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-muted font-medium block">
              Deviation &gt; 2,000 MW
            </span>
            <span className="font-mono text-xs text-muted">
              {quantiles.threshold2000Count} / {quantiles.validCount} valid hours
            </span>
          </div>
          <span className="text-base font-bold font-mono text-amber-300">
            {formatPct(quantiles.threshold2000Pct)}
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-app-surface border border-app-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-rose-400 font-semibold block flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Critical Deviation (&gt; 3,000 MW)
            </span>
            <span className="font-mono text-xs text-muted">
              {quantiles.threshold3000Count} / {quantiles.validCount} valid hours
            </span>
          </div>
          <span className="text-base font-bold font-mono text-rose-400">
            {formatPct(quantiles.threshold3000Pct)}
          </span>
        </div>
      </div>

      {/* 3. Interactive Histogram with Overflow/Underflow Safety */}
      <div className="rounded-xl bg-app-surface border border-app-border p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" />
              {histogramMode === "signed" ? "Signed Error Distribution (Forecast − Actual)" : "Absolute Error Magnitude Distribution (|Error|)"}
            </h3>
            <p className="text-xs text-muted">
              {includedCount} observations • 500 MW bins with explicit underflow/overflow accounting
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-app-bg border border-app-border self-start sm:self-auto text-xs">
            <button
              type="button"
              onClick={() => setHistogramMode("signed")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                histogramMode === "signed"
                  ? "bg-app-elevated text-accent border border-accent/40"
                  : "text-muted hover:text-slate-200 border border-transparent"
              }`}
            >
              Signed Error
            </button>
            <button
              type="button"
              onClick={() => setHistogramMode("absolute")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                histogramMode === "absolute"
                  ? "bg-app-elevated text-accent border border-accent/40"
                  : "text-muted hover:text-slate-200 border border-transparent"
              }`}
            >
              Absolute Error
            </button>
          </div>
        </div>

        {/* Overflow/Underflow Alert Note */}
        {(underflowCount > 0 || overflowCount > 0) && (
          <div className="p-2.5 rounded bg-app-bg border border-app-border text-[11px] text-muted flex items-center justify-between font-mono">
            <span>
              Extreme Error Observations:
              {underflowCount > 0 && <span className="text-amber-400 ml-2">Underflow (&lt; -5,000 MW): {underflowCount}</span>}
              {overflowCount > 0 && <span className="text-rose-400 ml-2">Overflow (≥ +5,000 MW): {overflowCount}</span>}
            </span>
            <span className="text-muted">Explicitly plotted at boundary bins</span>
          </div>
        )}

        {/* Histogram Chart */}
        <div className="w-full h-80 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} opacity={0.6} />
              <XAxis
                dataKey="binLabel"
                stroke={CHART_THEME.axes}
                fontSize={10}
                tickLine={false}
                angle={-30}
                textAnchor="end"
                interval={0}
                height={55}
              />
              <YAxis
                stroke={CHART_THEME.axes}
                fontSize={11}
                tickLine={false}
                tickFormatter={(v) => String(v)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const b = payload[0].payload;
                  return (
                    <div className="rounded-lg bg-app-surface border border-app-border p-3 shadow-xl text-xs space-y-1 min-w-[200px]">
                      <div className="font-semibold text-slate-100 border-b border-app-border pb-1">
                        {b.binLabel}
                      </div>
                      <div className="flex justify-between items-center text-accent">
                        <span>Observation Count:</span>
                        <span className="font-mono font-medium">{b.count} hrs</span>
                      </div>
                      <div className="flex justify-between items-center text-muted">
                        <span>Proportion:</span>
                        <span className="font-mono font-medium text-slate-200">{formatPct(b.percentage)}</span>
                      </div>
                      {(b.isUnderflow || b.isOverflow) && (
                        <div className="text-[10px] text-amber-400 italic pt-1 border-t border-app-border">
                          Boundary overflow bin
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {bins.map((entry, index) => {
                  let fillColor = CHART_THEME.forecast;
                  if (entry.isUnderflow) fillColor = CHART_THEME.warning;
                  else if (entry.isOverflow) fillColor = CHART_THEME.error;
                  else if (histogramMode === "signed") {
                    if (entry.min < 0) fillColor = CHART_THEME.forecast; // underforecast
                    else fillColor = CHART_THEME.warning; // overforecast
                  }
                  return <Cell key={`cell-${index}`} fill={fillColor} opacity={0.75} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
