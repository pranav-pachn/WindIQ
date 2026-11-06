import React, { useMemo } from "react";
import type { HourlyAccuracyItem } from "@/types/api";
import { formatMw } from "@/lib/formatters";

interface DiurnalHeatmapProps {
  items: HourlyAccuracyItem[];
  onSelectCell?: (item: HourlyAccuracyItem) => void;
}

export function DiurnalHeatmap({ items, onSelectCell }: DiurnalHeatmapProps) {
  const { dates, matrix } = useMemo(() => {
    // Unique sorted delivery dates
    const dateSet = new Set<string>();
    for (const item of items) {
      dateSet.add(item.delivery_date);
    }
    const sortedDates = Array.from(dateSet).sort();

    // Map: key `${date}_${hour}` -> HourlyAccuracyItem
    const map = new Map<string, HourlyAccuracyItem>();
    for (const item of items) {
      map.set(`${item.delivery_date}_${item.hour_of_day}`, item);
    }

    return { dates: sortedDates, matrix: map };
  }, [items]);

  const getCellColor = (absError: number | null | undefined) => {
    if (absError === null || absError === undefined) {
      return "bg-slate-900 text-slate-600";
    }
    if (absError < 1000) {
      return "bg-emerald-950/60 hover:bg-emerald-800/80 border-emerald-900/40 text-emerald-300";
    }
    if (absError < 2000) {
      return "bg-amber-950/70 hover:bg-amber-800/80 border-amber-800/50 text-amber-300";
    }
    if (absError < 3000) {
      return "bg-orange-950/80 hover:bg-orange-800/80 border-orange-700/60 text-orange-200";
    }
    return "bg-rose-950/90 hover:bg-rose-800/90 border-rose-700/80 text-rose-200 font-bold";
  };

  if (!dates.length) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-500 text-xs">
        No hourly data available for diurnal heatmap.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            Diurnal Forecast Error Heatmap (24h × {dates.length} Delivery Days)
          </h3>
          <p className="text-xs text-slate-400">
            Absolute forecast deviation (|Error| MW) by local hour of day and delivery date
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-[10px] text-slate-400 self-end sm:self-auto">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-emerald-950 border border-emerald-800 inline-block" />
            &lt;1k MW
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-amber-950 border border-amber-800 inline-block" />
            1k–2k
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-orange-950 border border-orange-700 inline-block" />
            2k–3k
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-rose-950 border border-rose-700 inline-block" />
            &gt;3k MW
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-center border-collapse text-[10px] font-mono">
          <thead>
            <tr className="bg-slate-950 border-b border-slate-800 text-slate-400">
              <th className="p-1 text-left w-14 font-semibold text-slate-300">Hour</th>
              {dates.map((d) => (
                <th key={d} className="p-1 font-semibold whitespace-nowrap min-w-[28px]">
                  {d.substring(8, 10)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {Array.from({ length: 24 }, (_, hour) => (
              <tr key={hour} className="hover:bg-slate-800/20">
                <td className="p-1 text-left font-semibold text-slate-400 whitespace-nowrap bg-slate-950/60 border-r border-slate-800/60">
                  {String(hour).padStart(2, "0")}:00
                </td>
                {dates.map((date) => {
                  const item = matrix.get(`${date}_${hour}`);
                  const absErr = item?.absolute_error_mw;
                  const colorClass = getCellColor(absErr);

                  return (
                    <td
                      key={date}
                      onClick={() => item && onSelectCell && onSelectCell(item)}
                      title={
                        item
                          ? `${date} ${String(hour).padStart(2, "0")}:00 UK\nForecast: ${formatMw(item.forecast_generation_mw)}\nActual: ${formatMw(item.actual_generation_mw)}\nError: ${item.forecast_error_mw && item.forecast_error_mw > 0 ? "+" : ""}${formatMw(item.forecast_error_mw)}\nClick to inspect lineage`
                          : "No evaluation data"
                      }
                      className={`p-1 cursor-pointer transition-colors border border-transparent ${colorClass}`}
                    >
                      {absErr !== null && absErr !== undefined ? (absErr / 1000).toFixed(1) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

