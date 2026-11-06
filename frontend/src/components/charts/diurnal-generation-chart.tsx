import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { HourOfDayAggregate } from "@/types/api";
import { formatMw } from "@/lib/formatters";

interface DiurnalGenerationChartProps {
  data: HourOfDayAggregate[];
}

export function DiurnalGenerationChart({ data }: DiurnalGenerationChartProps) {
  const chartData = data.map((d) => ({
    hour_label: `${String(d.hour_of_day).padStart(2, "0")}:00`,
    hour_of_day: d.hour_of_day,
    avg_forecast_mw: d.avg_forecast_mw ?? 0,
    avg_actual_mw: d.avg_actual_mw ?? 0,
    delta_mw: (d.avg_forecast_mw ?? 0) - (d.avg_actual_mw ?? 0),
  }));

  return (
    <div className="w-full h-[360px] rounded-xl bg-slate-900/60 border border-slate-800 p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            Diurnal Fleet Generation Envelope: Mean Forecast vs Actual
          </h3>
          <p className="text-xs text-slate-400">
            Average GB national wind fleet generation by hour of day (Europe/London)
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            Mean Forecast (MW)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            Mean Actual (MW)
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 10 }}>
            <defs>
              <linearGradient id="diurnalForecastGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="diurnalActualGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
            <XAxis dataKey="hour_label" stroke="#64748b" fontSize={11} tickLine={false} />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg bg-[#080d1a] border border-slate-700/80 p-3 shadow-xl text-xs space-y-1.5 min-w-[200px]">
                    <div className="font-semibold text-slate-100 border-b border-slate-800 pb-1">
                      Hour {d.hour_label} UK
                    </div>
                    <div className="flex justify-between items-center text-cyan-300">
                      <span>Mean Forecast:</span>
                      <span className="font-mono font-bold">{formatMw(d.avg_forecast_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-400">
                      <span>Mean Actual:</span>
                      <span className="font-mono font-bold">{formatMw(d.avg_actual_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-amber-300 pt-1 border-t border-slate-800">
                      <span>Delta:</span>
                      <span className="font-mono font-bold">
                        {d.delta_mw > 0 ? "+" : ""}
                        {formatMw(d.delta_mw)}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="avg_forecast_mw"
              stroke="#06b6d4"
              strokeWidth={2}
              fill="url(#diurnalForecastGrad)"
            />
            <Area
              type="monotone"
              dataKey="avg_actual_mw"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#diurnalActualGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
