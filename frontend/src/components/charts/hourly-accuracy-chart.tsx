import React, { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from "recharts";
import type { HourlyAccuracyItem } from "@/types/api";
import { formatMw, formatPct, formatLondonWithDstOffset } from "@/lib/formatters";

interface HourlyAccuracyChartProps {
  items: HourlyAccuracyItem[];
  selectedHourUtc?: string | null;
  onSelectPoint?: (item: HourlyAccuracyItem) => void;
}

export function HourlyAccuracyChart({
  items,
  selectedHourUtc: _selectedHourUtc,
  onSelectPoint,
}: HourlyAccuracyChartProps) {
  const chartData = useMemo(() => {
    return items.map((item) => ({
      delivery_hour_utc: item.delivery_hour_utc,
      displayDate: item.delivery_hour_utc.substring(5, 13).replace("T", " "), // "01-28 12"
      forecast_mw: item.forecast_generation_mw ?? 0,
      actual_mw: item.actual_generation_mw ?? 0,
      signed_error_mw: item.forecast_error_mw ?? 0,
      rawItem: item,
    }));
  }, [items]);

  if (!items.length) {
    return (
      <div className="flex items-center justify-center h-80 rounded-lg bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
        No hourly forecast comparisons found for the selected filter criteria.
      </div>
    );
  }

  return (
    <div className="w-full h-[420px] rounded-xl bg-slate-900/60 border border-slate-800 p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            Hourly Day-Ahead Forecast vs Actual Generation & Error Delta
          </h3>
          <p className="text-xs text-slate-400">
            Evaluating {items.length} delivery hours • Click any point to audit lineage
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            Day-Ahead Forecast
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            Actual Generation
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block" />
            Overforecast Delta (+MW)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" />
            Underforecast Delta (−MW)
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 20, left: 10, bottom: 25 }}
            onClick={(e) => {
              const activePayload = e?.activePayload?.[0]?.payload?.rawItem as HourlyAccuracyItem | undefined;
              if (activePayload && onSelectPoint) {
                onSelectPoint(activePayload);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
            <XAxis
              dataKey="displayDate"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              dy={5}
              minTickGap={25}
            />
            {/* Primary Y-Axis for Generation (MW) */}
            <YAxis
              yAxisId="gen"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
              domain={[0, "auto"]}
            />
            {/* Secondary Y-Axis for Signed Error Delta (+/- MW) */}
            <YAxis
              yAxisId="delta"
              orientation="right"
              stroke="#475569"
              fontSize={11}
              tickLine={false}
              tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
            />

            <ReferenceLine yAxisId="delta" y={0} stroke="#475569" strokeDasharray="3 3" />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const raw = payload[0].payload.rawItem as HourlyAccuracyItem;
                return (
                  <div className="rounded-lg bg-[#080d1a] border border-slate-700/80 p-3 shadow-xl text-xs space-y-1.5 min-w-[240px]">
                    <div className="border-b border-slate-800 pb-1.5">
                      <div className="font-semibold text-slate-100">
                        {formatLondonWithDstOffset(raw.delivery_hour_utc)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        UTC: {raw.delivery_hour_utc}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-cyan-300">
                      <span>Day-Ahead Forecast:</span>
                      <span className="font-mono font-bold">{formatMw(raw.forecast_generation_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-400">
                      <span>Actual Generation:</span>
                      <span className="font-mono font-bold">{formatMw(raw.actual_generation_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-amber-300">
                      <span>Signed Error:</span>
                      <span className="font-mono font-semibold">
                        {raw.forecast_error_mw && raw.forecast_error_mw > 0 ? "+" : ""}
                        {formatMw(raw.forecast_error_mw)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Absolute % Error (APE):</span>
                      <span className="font-mono font-semibold">{formatPct(raw.absolute_percentage_error)}</span>
                    </div>
                    <div className="pt-1 text-[10px] text-cyan-400 border-t border-slate-800/80 italic text-center">
                      Click point to inspect settlement lineage
                    </div>
                  </div>
                );
              }}
            />

            {/* Signed Error Bar */}
            <Bar
              yAxisId="delta"
              dataKey="signed_error_mw"
              fill="#f59e0b"
              opacity={0.7}
              cursor="pointer"
            />

            {/* Generation Lines */}
            <Line
              yAxisId="gen"
              type="monotone"
              dataKey="forecast_mw"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: "#06b6d4", stroke: "#080d1a", strokeWidth: 2 }}
            />
            <Line
              yAxisId="gen"
              type="monotone"
              dataKey="actual_mw"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: "#10b981", stroke: "#080d1a", strokeWidth: 2 }}
            />

            {/* Brush for dense 744h horizon zooming */}
            {items.length > 48 && (
              <Brush
                dataKey="displayDate"
                height={26}
                stroke="#334155"
                fill="#0b1120"
                tickFormatter={() => ""}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
