import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import type { HourlyAccuracyItem, PaginationMeta } from "@/types/api";
import { formatMw, formatPct, formatLondonWithDstOffset } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";

interface HourlyEvaluationsTableProps {
  items: HourlyAccuracyItem[];
  pagination: PaginationMeta;
  sortBy: string;
  order: string;
  onSortChange: (column: string) => void;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newSize: number) => void;
  onInspectLineage: (item: HourlyAccuracyItem) => void;
  selectedHourUtc?: string | null;
  isLoading?: boolean;
}

export function HourlyEvaluationsTable({
  items,
  pagination,
  sortBy,
  order,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onInspectLineage,
  selectedHourUtc,
  isLoading,
}: HourlyEvaluationsTableProps) {
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

  const startRecord = (pagination.page - 1) * pagination.page_size + 1;
  const endRecord = Math.min(pagination.page * pagination.page_size, pagination.total_items);

  return (
    <div className="rounded-lg bg-[#111C2D] border border-[#26364A] p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#E7EDF5] flex items-center gap-2">
            Granular Hourly Forecast vs Actual Evaluations
          </h3>
          <p className="text-xs text-[#718198]">
            Traceable to Elexon BMRS WINDFOR day-ahead publications and FUELHH settlement readings
          </p>
        </div>

        {/* Page size selection */}
        <div className="flex items-center gap-2 text-xs text-[#718198]">
          <span>Rows per page:</span>
          <select
            value={pagination.page_size}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md bg-[#0B1220] border border-[#26364A] px-2 py-1 text-[#E7EDF5] text-xs focus:outline-none focus:border-[#35B9C8] font-mono"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-[#26364A]">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#0E1726] border-b border-[#26364A] text-[#718198] text-[11px] font-mono uppercase tracking-wider">
              <th
                onClick={() => onSortChange("delivery_hour_utc")}
                className="py-2.5 px-3 font-semibold cursor-pointer hover:text-[#E7EDF5] select-none whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  Delivery Hour (London + Offset)
                  {renderSortIcon("delivery_hour_utc")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("forecast_generation_mw")}
                className="py-2.5 px-3 font-semibold text-right cursor-pointer hover:text-[#E7EDF5] select-none whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  Day-Ahead Forecast
                  {renderSortIcon("forecast_generation_mw")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("actual_generation_mw")}
                className="py-2.5 px-3 font-semibold text-right cursor-pointer hover:text-[#E7EDF5] select-none whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  Actual Generation
                  {renderSortIcon("actual_generation_mw")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("signed_error_mw")}
                className="py-2.5 px-3 font-semibold text-right cursor-pointer hover:text-[#E7EDF5] select-none whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  Signed Error (ΔMW)
                  {renderSortIcon("signed_error_mw")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("absolute_error_mw")}
                className="py-2.5 px-3 font-semibold text-right cursor-pointer hover:text-[#E7EDF5] select-none whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  |Error| (MW)
                  {renderSortIcon("absolute_error_mw")}
                </div>
              </th>
              <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">
                APE (%)
              </th>
              <th className="py-2.5 px-3 font-semibold text-center whitespace-nowrap">
                Status
              </th>
              <th className="py-2.5 px-3 font-semibold text-center whitespace-nowrap">
                Audit Lineage
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2B3E] font-mono">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[#718198] text-xs italic font-sans">
                  Loading evaluations...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[#718198] text-xs italic font-sans">
                  No hourly forecast evaluations match the active filter criteria.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isSelected = selectedHourUtc === item.delivery_hour_utc;
                const isOver = item.forecast_error_mw && item.forecast_error_mw > 0;
                const isUnder = item.forecast_error_mw && item.forecast_error_mw < 0;

                return (
                  <tr
                    key={item.delivery_hour_utc}
                    className={`hover:bg-[#162337]/70 transition-colors ${
                      isSelected ? "bg-[#162337] border-l-2 border-[#35B9C8]" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-semibold text-[#E7EDF5]">
                        {formatLondonWithDstOffset(item.delivery_hour_utc)}
                      </div>
                      <div className="text-[10px] text-[#718198]">
                        UTC: {item.delivery_hour_utc.substring(0, 19).replace("T", " ")}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[#35B9C8] tabular-nums">
                      {formatMw(item.forecast_generation_mw)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-[#E7EDF5] tabular-nums">
                      {formatMw(item.actual_generation_mw)}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-medium tabular-nums ${isOver ? "text-[#E7AD4A]" : isUnder ? "text-[#35B9C8]" : "text-[#718198]"}`}>
                      {isOver ? "+" : ""}
                      {formatMw(item.forecast_error_mw)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#E7EDF5] tabular-nums">
                      {formatMw(item.absolute_error_mw)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#9AAABD] tabular-nums">
                      {item.absolute_percentage_error !== null && item.absolute_percentage_error !== undefined
                        ? formatPct(item.absolute_percentage_error)
                        : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.comparison_status === "VALID" ? (
                        <Badge variant="success" size="sm">
                          VALID
                        </Badge>
                      ) : item.comparison_status === "MISSING_FORECAST" ? (
                        <Badge variant="warning" size="sm">
                          MISSING_FC
                        </Badge>
                      ) : (
                        <Badge variant="danger" size="sm">
                          MISSING_ACT
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onInspectLineage(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[#162337] hover:bg-[#1E2B3E] border border-[#26364A] text-[#35B9C8] transition-colors focus:outline-none focus:border-[#35B9C8]"
                        title="Audit selected forecast publication and half-hour settlement pairs"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Audit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination.total_items > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-[#718198]">
          <div>
            Showing <span className="font-mono text-[#E7EDF5] font-semibold">{startRecord}</span> to{" "}
            <span className="font-mono text-[#E7EDF5] font-semibold">{endRecord}</span> of{" "}
            <span className="font-mono text-[#E7EDF5] font-semibold">{pagination.total_items}</span> evaluations
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              type="button"
              disabled={!pagination.has_previous || isLoading}
              onClick={() => onPageChange(pagination.page - 1)}
              className="p-1.5 rounded-md bg-[#162337] hover:bg-[#1E2B3E] border border-[#26364A] disabled:opacity-40 text-[#E7EDF5] focus:outline-none transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-[#9AAABD]">
              Page {pagination.page} of {pagination.total_pages || 1}
            </span>
            <button
              type="button"
              disabled={!pagination.has_next || isLoading}
              onClick={() => onPageChange(pagination.page + 1)}
              className="p-1.5 rounded-md bg-[#162337] hover:bg-[#1E2B3E] border border-[#26364A] disabled:opacity-40 text-[#E7EDF5] focus:outline-none transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

