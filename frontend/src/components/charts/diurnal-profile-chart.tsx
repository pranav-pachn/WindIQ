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
import { CHART_THEME } from "@/lib/chart-theme";

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
    <div className="w-full h-[380px] rounded-xl bg-app-surface border border-app-border p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            24-Hour Diurnal Forecast Accuracy Profile (Europe/London Local Time)
          </h3>
          <p className="text-xs text-muted">
            Systematic diurnal bias and error divergence across local hours of the day
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-accent inline-block" />
            Signed Bias (+/− MW)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#35B9C8] inline-block" />
            MAE (Linear MW)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E7AD4A] inline-block" />
            RMSE (Penalized MW)
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} opacity={0.6} />
            <XAxis dataKey="hour_label" stroke={CHART_THEME.axes} fontSize={11} tickLine={false} />
            {/* Primary Left Y-Axis for MAE and RMSE */}
            <YAxis
              yAxisId="error"
              stroke={CHART_THEME.axes}
              fontSize={11}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              domain={[0, "auto"]}
            />
            {/* Secondary Right Y-Axis for Signed Bias */}
            <YAxis
              yAxisId="bias"
              orientation="right"
              stroke={CHART_THEME.axes}
              fontSize={11}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
            />

            <ReferenceLine yAxisId="bias" y={0} stroke={CHART_THEME.border} strokeDasharray="3 3" />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg bg-app-surface border border-app-border p-3 shadow-xl text-xs space-y-1.5 min-w-[220px]">
                    <div className="font-semibold text-slate-100 border-b border-app-border pb-1 flex justify-between">
                      <span>Hour {d.hour_label} UK</span>
                      <span className="text-[10px] text-muted">({d.comparison_count} days)</span>
                    </div>
                    <div className="flex justify-between items-center text-accent">
                      <span>MAE (Linear):</span>
                      <span className="font-mono font-medium">{formatMw(d.mae_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-amber-300">
                      <span>RMSE (Penalized):</span>
                      <span className="font-mono font-medium">{formatMw(d.rmse_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-200">
                      <span>Signed Bias:</span>
                      <span className="font-mono font-medium">
                        {d.bias_mw > 0 ? "+" : ""}
                        {formatMw(d.bias_mw)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-muted">
                      <span>MAPE:</span>
                      <span className="font-mono font-medium text-slate-200">{formatPct(d.mape_pct)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-muted pt-1 border-t border-app-border">
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
            <Bar yAxisId="bias" dataKey="bias_mw" fill={CHART_THEME.forecast} opacity={0.5} />

            {/* MAE & RMSE on left axis */}
            <Line
              yAxisId="error"
              type="monotone"
              dataKey="mae_mw"
              stroke={CHART_THEME.mae}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_THEME.mae }}
            />
            <Line
              yAxisId="error"
              type="monotone"
              dataKey="rmse_mw"
              stroke={CHART_THEME.rmse}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_THEME.rmse }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
