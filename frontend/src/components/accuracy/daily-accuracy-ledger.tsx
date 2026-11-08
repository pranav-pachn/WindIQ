import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, Award, AlertOctagon, TrendingDown, TrendingUp } from "lucide-react";
import type { DailyAccuracyItem, DailyAccuracySummary, PaginationMeta } from "@/types/api";
import { formatMw, formatPct, formatDate, formatBias } from "@/lib/formatters";

interface DailyAccuracyLedgerProps {
  items: DailyAccuracyItem[];
  summary?: DailyAccuracySummary | null;
  pagination?: PaginationMeta | null;
  sortBy: string;
  order: string;
  onSortChange: (column: string) => void;
  onSelectDay: (deliveryDate: string) => void;
  isLoading?: boolean;
}

export function DailyAccuracyLedger({
  items,
  summary,
  pagination: _pagination,
  sortBy,
  order,
  onSortChange,
  onSelectDay,
  isLoading,
}: DailyAccuracyLedgerProps) {
  const renderSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-3 h-3 text-muted opacity-50" />;
    }
    return order === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-accent font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-accent font-bold" />
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Dynamic Performance Extremes Banner (API-Derived) */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Best MAE */}
          <div className="p-4 rounded-xl bg-app-surface border border-app-border relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-muted mb-1">
              <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" />
                Best MAE (Lowest Error)
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-300">
              {summary.best_day_mae ? formatMw(summary.best_day_mae.value) : "—"}
            </div>
            <div className="text-xs font-mono text-slate-300 mt-1 flex items-center justify-between">
              <span className="text-muted">Delivery Date:</span>
              <button
                type="button"
                onClick={() => summary.best_day_mae && onSelectDay(summary.best_day_mae.delivery_date)}
                className="underline text-emerald-400 hover:text-emerald-300"
              >
                {summary.best_day_mae ? formatDate(summary.best_day_mae.delivery_date) : "—"}
              </button>
            </div>
          </div>

          {/* Worst MAE */}
          <div className="p-4 rounded-xl bg-app-surface border border-app-border relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-muted mb-1">
              <span className="font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5" />
                Worst MAE (Highest Error)
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-rose-300">
              {summary.worst_day_mae ? formatMw(summary.worst_day_mae.value) : "—"}
            </div>
            <div className="text-xs font-mono text-slate-300 mt-1 flex items-center justify-between">
              <span className="text-muted">Delivery Date:</span>
              <button
                type="button"
                onClick={() => summary.worst_day_mae && onSelectDay(summary.worst_day_mae.delivery_date)}
                className="underline text-rose-400 hover:text-rose-300"
              >
                {summary.worst_day_mae ? formatDate(summary.worst_day_mae.delivery_date) : "—"}
              </button>
            </div>
          </div>

          {/* Best MAPE (Independent Date) */}
          <div className="p-4 rounded-xl bg-app-surface border border-app-border">
            <div className="flex items-center justify-between text-xs text-muted mb-1">
              <span className="font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" />
                Best MAPE (Relative)
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-accent">
              {summary.best_day_mape ? formatPct(summary.best_day_mape.value) : "—"}
            </div>
            <div className="text-xs font-mono text-slate-300 mt-1 flex items-center justify-between">
              <span className="text-muted">Delivery Date:</span>
              <button
                type="button"
                onClick={() => summary.best_day_mape && onSelectDay(summary.best_day_mape.delivery_date)}
                className="underline text-accent hover:text-accent/80"
              >
                {summary.best_day_mape ? formatDate(summary.best_day_mape.delivery_date) : "—"}
              </button>
            </div>
          </div>

          {/* Worst MAPE */}
          <div className="p-4 rounded-xl bg-app-surface border border-app-border">
            <div className="flex items-center justify-between text-xs text-muted mb-1">
              <span className="font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Worst MAPE (Relative)
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-amber-300">
              {summary.worst_day_mape ? formatPct(summary.worst_day_mape.value) : "—"}
            </div>
            <div className="text-xs font-mono text-slate-300 mt-1 flex items-center justify-between">
              <span className="text-muted">Delivery Date:</span>
              <button
                type="button"
                onClick={() => summary.worst_day_mape && onSelectDay(summary.worst_day_mape.delivery_date)}
                className="underline text-amber-400 hover:text-amber-300"
              >
                {summary.worst_day_mape ? formatDate(summary.worst_day_mape.delivery_date) : "—"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Daily Accuracy Ledger Table */}
      <div className="rounded-xl bg-app-surface border border-app-border p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            Daily Accuracy Ledger ({items.length} Evaluated Delivery Days)
          </h3>
          <p className="text-xs text-muted">
            Day-by-day aggregated forecast accuracy, completeness, and bias metrics across Europe/London calendar dates
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-app-border">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#0E1726] border-b border-app-border text-muted">
                <th
                  onClick={() => onSortChange("delivery_date")}
                  className="py-2.5 px-3 font-semibold cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    Delivery Date (London)
                    {renderSortIcon("delivery_date")}
                  </div>
                </th>
                <th className="py-2.5 px-3 font-semibold text-center whitespace-nowrap">
                  Hours Evaluated
                </th>
                <th
                  onClick={() => onSortChange("mae_mw")}
                  className="py-2.5 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    MAE (MW)
                    {renderSortIcon("mae_mw")}
                  </div>
                </th>
                <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">
                  RMSE (MW)
                </th>
                <th
                  onClick={() => onSortChange("mape_pct")}
                  className="py-2.5 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    MAPE (%)
                    {renderSortIcon("mape_pct")}
                  </div>
                </th>
                <th
                  onClick={() => onSortChange("bias_mw")}
                  className="py-2.5 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    Signed Bias (MW)
                    {renderSortIcon("bias_mw")}
                  </div>
                </th>
                <th className="py-2.5 px-3 font-semibold text-center whitespace-nowrap">
                  Over vs Under
                </th>
                <th className="py-2.5 px-3 font-semibold text-center whitespace-nowrap">
                  Drilldown
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border/40 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted text-xs italic font-sans">
                    Loading daily ledger...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted text-xs italic font-sans">
                    No daily records found.
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const biasInfo = formatBias(row.bias_mw);
                  return (
                    <tr
                      key={row.delivery_date}
                      className="hover:bg-app-elevated/60 transition-colors"
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-slate-200">
                        {formatDate(row.delivery_date)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted">
                        <span className="text-slate-200">{row.valid_hours}</span> / {row.total_hours} hrs
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-100 font-bold">
                        {formatMw(row.mae_mw)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {formatMw(row.rmse_mw)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200 font-medium">
                        {formatPct(row.mape_pct)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-medium ${
                          biasInfo.direction === "positive"
                            ? "text-amber-400"
                            : biasInfo.direction === "negative"
                            ? "text-accent"
                            : "text-muted"
                        }`}
                      >
                        {biasInfo.text}
                      </td>
                      <td className="py-2.5 px-3 text-center text-xs">
                        <span className="text-amber-400 font-medium">{row.overforecast_hours}</span>
                        <span className="text-muted mx-1">:</span>
                        <span className="text-accent font-medium">{row.underforecast_hours}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onSelectDay(row.delivery_date)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-app-elevated hover:bg-app-surface border border-app-border text-slate-200 transition-colors focus:outline-none focus:border-accent"
                        >
                          Explore
                          <ChevronRight className="w-3.5 h-3.5 text-accent" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
