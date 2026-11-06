import React from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { HourOfDayAggregate } from "@/types/api";
import { formatMw, formatPct } from "@/lib/formatters";

interface DiurnalProfileChartProps {
  data: HourOfDayAggregate[];
}

export function DiurnalProfileChart({ data }: DiurnalProfileChartProps) {
  const chartData = data.map((d) => ({
    hour_label: `${String(d.hour_of_day).padStart(2, "0")}:00`,
    hour_of_day: d.hour_of_day,
    mae_mw: d.mae_mw ?? 0,
    rmse_mw: d.rmse_mw ?? 0,
    bias_mw: d.bias_mw ?? 0,
    mape_pct: d.mape_pct ?? 0,
    overforecast_count: d.overforecast_count,
    underforecast_count: d.underforecast_count,
    comparison_count: d.comparison_count,
  }));

  return (
    <div className="w-full h-[380px] rounded-xl bg-slate-900/60 border border-slate-800 p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            24-Hour Diurnal Forecast Accuracy Profile (Europe/London Local Time)
          </h3>
          <p className="text-xs text-slate-400">
            Systematic diurnal bias and error divergence across local hours of the day
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-cyan-400 inline-block" />
            Signed Bias (+/− MW)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            MAE (Linear MW)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
            RMSE (Penalized MW)
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
            <XAxis dataKey="hour_label" stroke="#64748b" fontSize={11} tickLine={false} />
            {/* Primary Left Y-Axis for MAE and RMSE */}
            <YAxis
              yAxisId="error"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              domain={[0, "auto"]}
            />
            {/* Secondary Right Y-Axis for Signed Bias */}
            <YAxis
              yAxisId="bias"
              orientation="right"
              stroke="#06b6d4"
              fontSize={11}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
            />

            <ReferenceLine yAxisId="bias" y={0} stroke="#475569" strokeDasharray="3 3" />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg bg-[#080d1a] border border-slate-700/80 p-3 shadow-xl text-xs space-y-1.5 min-w-[220px]">
                    <div className="font-semibold text-slate-100 border-b border-slate-800 pb-1 flex justify-between">
                      <span>Hour {d.hour_label} UK</span>
                      <span className="text-[10px] text-slate-400">({d.comparison_count} days)</span>
                    </div>
                    <div className="flex justify-between items-center text-amber-400">
                      <span>MAE (Linear):</span>
                      <span className="font-mono font-bold">{formatMw(d.mae_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-rose-400">
                      <span>RMSE (Penalized):</span>
                      <span className="font-mono font-bold">{formatMw(d.rmse_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-cyan-300">
                      <span>Signed Bias:</span>
                      <span className="font-mono font-bold">
                        {d.bias_mw > 0 ? "+" : ""}
                        {formatMw(d.bias_mw)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>MAPE:</span>
                      <span className="font-mono font-semibold">{formatPct(d.mape_pct)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                      <span>Direction:</span>
                      <span>
                        {d.overforecast_count} over / {d.underforecast_count} under
                      </span>
                    </div>
                  </div>
                );
              }}
            />

            {/* Bias Bar on right axis */}
            <Bar yAxisId="bias" dataKey="bias_mw" fill="#06b6d4" opacity={0.6} />

            {/* MAE & RMSE on left axis */}
            <Line
              yAxisId="error"
              type="monotone"
              dataKey="mae_mw"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3, fill: "#f59e0b" }}
            />
            <Line
              yAxisId="error"
              type="monotone"
              dataKey="rmse_mw"
              stroke="#f43f5e"
              strokeWidth={2}
              dot={{ r: 3, fill: "#f43f5e" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
