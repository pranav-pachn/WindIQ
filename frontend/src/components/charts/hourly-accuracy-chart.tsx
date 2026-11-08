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
import { CHART_THEME } from "@/lib/chart-theme";

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
      <div className="flex items-center justify-center h-80 rounded-xl bg-app-surface border border-app-border text-muted text-xs">
        No hourly forecast comparisons found for the selected filter criteria.
      </div>
    );
  }

  return (
    <div className="w-full h-[420px] rounded-xl bg-app-surface border border-app-border p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            Hourly Day-Ahead Forecast vs Actual Generation &amp; Error Delta
          </h3>
          <p className="text-xs text-muted">
            Evaluating {items.length} delivery hours • Click any point to audit lineage
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-accent inline-block" />
            Day-Ahead Forecast
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" />
            Actual Generation
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#E7AD4A] inline-block" />
            Error Delta (+/− MW)
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
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} opacity={0.6} />
            <XAxis
              dataKey="displayDate"
              stroke={CHART_THEME.axes}
              fontSize={11}
              tickLine={false}
              dy={5}
              minTickGap={25}
            />
            {/* Primary Y-Axis for Generation (MW) */}
            <YAxis
              yAxisId="gen"
              stroke={CHART_THEME.axes}
              fontSize={11}
              tickLine={false}
              tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
              domain={[0, "auto"]}
            />
            {/* Secondary Y-Axis for Signed Error Delta (+/- MW) */}
            <YAxis
              yAxisId="delta"
              orientation="right"
              stroke={CHART_THEME.axes}
              fontSize={11}
              tickLine={false}
              tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
            />

            <ReferenceLine yAxisId="delta" y={0} stroke={CHART_THEME.border} strokeDasharray="3 3" />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const raw = payload[0].payload.rawItem as HourlyAccuracyItem;
                return (
                  <div className="rounded-lg bg-app-surface border border-app-border p-3 shadow-xl text-xs space-y-1.5 min-w-[240px]">
                    <div className="border-b border-app-border pb-1.5">
                      <div className="font-semibold text-slate-100">
                        {formatLondonWithDstOffset(raw.delivery_hour_utc)}
                      </div>
                      <div className="text-[10px] font-mono text-muted">
                        UTC: {raw.delivery_hour_utc}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-accent">
                      <span>Day-Ahead Forecast:</span>
                      <span className="font-mono font-medium">{formatMw(raw.forecast_generation_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-200">
                      <span>Actual Generation:</span>
                      <span className="font-mono font-medium">{formatMw(raw.actual_generation_mw)}</span>
                    </div>
                    <div className="flex justify-between items-center text-amber-300">
                      <span>Signed Error:</span>
                      <span className="font-mono font-medium">
                        {raw.forecast_error_mw && raw.forecast_error_mw > 0 ? "+" : ""}
                        {formatMw(raw.forecast_error_mw)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-muted">
                      <span>Absolute % Error (APE):</span>
                      <span className="font-mono font-medium text-slate-200">{formatPct(raw.absolute_percentage_error)}</span>
                    </div>
                    <div className="pt-1 text-[10px] text-accent border-t border-app-border italic text-center">
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
              fill={CHART_THEME.positiveError}
              opacity={0.65}
              cursor="pointer"
            />

            {/* Generation Lines */}
            <Line
              yAxisId="gen"
              type="monotone"
              dataKey="forecast_mw"
              stroke={CHART_THEME.forecast}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: CHART_THEME.forecast, stroke: "#0B1220", strokeWidth: 2 }}
            />
            <Line
              yAxisId="gen"
              type="monotone"
              dataKey="actual_mw"
              stroke={CHART_THEME.actual}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: CHART_THEME.actual, stroke: "#0B1220", strokeWidth: 2 }}
            />

            {/* Brush for dense 744h horizon zooming */}
            {items.length > 48 && (
              <Brush
                dataKey="displayDate"
                height={26}
                stroke={CHART_THEME.border}
                fill={CHART_THEME.elevated}
                tickFormatter={() => ""}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
