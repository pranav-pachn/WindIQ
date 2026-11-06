import React, { useState } from "react";
import {
  Calendar,
  Clock,
  Download,
  Filter,
  BarChart3,
  Layers,
  Table as TableIcon,
  Sun,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { useEvaluationPeriod } from "@/hooks/use-evaluation-period";
import {
  useHourlyAccuracyTable,
  useAllHourlyAccuracy,
  useDailyAccuracy,
} from "@/hooks/use-accuracy";
import type { HourlyAccuracyItem } from "@/types/api";
import { HourlyAccuracyChart } from "@/components/charts/hourly-accuracy-chart";
import { HourlyEvaluationsTable } from "@/components/accuracy/hourly-evaluations-table";
import { AuditLineageModal } from "@/components/accuracy/audit-lineage-modal";
import { DiurnalProfileChart } from "@/components/charts/diurnal-profile-chart";
import { DiurnalGenerationChart } from "@/components/charts/diurnal-generation-chart";
import { DiurnalHeatmap } from "@/components/charts/diurnal-heatmap";
import { ErrorDistributionView } from "@/components/accuracy/error-distribution-view";
import { DailyAccuracyLedger } from "@/components/accuracy/daily-accuracy-ledger";
import { generateHourlyAccuracyCsv, downloadCsvFile } from "@/lib/export-accuracy-csv";
import { formatDate } from "@/lib/formatters";

type ViewMode = "timeline" | "diurnal" | "distribution" | "daily";

export function AccuracyPage() {
  const { period, isBenchmark } = useEvaluationPeriod();

  // Local view and filter states
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Table pagination & sorting states
  const [tablePage, setTablePage] = useState<number>(1);
  const [tablePageSize, setTablePageSize] = useState<number>(50);
  const [tableSortBy, setTableSortBy] = useState<string>("delivery_hour_utc");
  const [tableOrder, setTableOrder] = useState<string>("asc");

  // Daily ledger sorting state
  const [dailySortBy, setDailySortBy] = useState<string>("delivery_date");
  const [dailyOrder, setDailyOrder] = useState<string>("asc");

  // Audit modal state
  const [auditItem, setAuditItem] = useState<HourlyAccuracyItem | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);

  // Filter modifications reset table page to 1
  const handleDayFilterChange = (day: string | null) => {
    setSelectedDay(day);
    setTablePage(1);
  };

  const handleHourFilterChange = (hour: number | null) => {
    setSelectedHour(hour);
    setTablePage(1);
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setTablePage(1);
  };

  const handleTableSort = (column: string) => {
    if (tableSortBy === column) {
      setTableOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setTableSortBy(column);
      setTableOrder("asc");
    }
    setTablePage(1);
  };

  const handleDailySort = (column: string) => {
    if (dailySortBy === column) {
      setDailyOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setDailySortBy(column);
      setDailyOrder("asc");
    }
  };

  // 1. Complete Series Query (Charts, Heatmaps, Quantiles, CSV Export)
  const {
    data: seriesData,
    isLoading: _isLoadingSeries,
    error: seriesError,
    refetch: refetchSeries,
  } = useAllHourlyAccuracy({
    delivery_date: selectedDay || undefined,
    delivery_date_from: selectedDay ? undefined : period.deliveryDateFrom,
    delivery_date_to: selectedDay ? undefined : period.deliveryDateTo,
    hour_of_day: selectedHour !== null ? selectedHour : undefined,
    status: statusFilter,
  });

  // 2. Paginated Table Query
  const {
    data: tableData,
    isLoading: isLoadingTable,
    refetch: refetchTable,
  } = useHourlyAccuracyTable({
    delivery_date: selectedDay || undefined,
    delivery_date_from: selectedDay ? undefined : period.deliveryDateFrom,
    delivery_date_to: selectedDay ? undefined : period.deliveryDateTo,
    hour_of_day: selectedHour !== null ? selectedHour : undefined,
    status: statusFilter,
    sort_by: tableSortBy as any,
    order: tableOrder as any,
    page: tablePage,
    page_size: tablePageSize,
  });

  // 3. Daily Ledger Query
  const {
    data: dailyData,
    isLoading: isLoadingDaily,
  } = useDailyAccuracy(
    period.deliveryDateFrom,
    period.deliveryDateTo,
    dailySortBy,
    dailyOrder,
    1,
    100
  );

  // CSV Export action across complete filtered dataset
  const handleExportCsv = async () => {
    if (!seriesData?.items?.length) return;
    setIsExportingCsv(true);
    try {
      const csv = generateHourlyAccuracyCsv(seriesData.items);
      const filename = `windiq_hourly_accuracy_${period.deliveryDateFrom}_to_${period.deliveryDateTo}.csv`;
      downloadCsvFile(csv, filename);
    } finally {
      setIsExportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Active window indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Evaluation Window:</span>
            <span className="font-mono text-cyan-300 font-semibold">
              {formatDate(period.deliveryDateFrom)} – {formatDate(period.deliveryDateTo)}
            </span>
            {isBenchmark && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 border border-emerald-800 text-emerald-300 ml-1">
                Jan 2026 Benchmark
              </span>
            )}
          </div>

          {/* Single-day drilldown badge / clear button */}
          {selectedDay && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-950/80 border border-cyan-800 text-xs text-cyan-200">
              <span>Drilldown:</span>
              <span className="font-mono font-bold text-white">{formatDate(selectedDay)}</span>
              <button
                type="button"
                onClick={() => handleDayFilterChange(null)}
                className="ml-1 text-cyan-300 hover:text-white"
                title="Clear day filter"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Global Controls: Status filter, Hour filter, Export */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          {/* Hour of Day Filter */}
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedHour !== null ? String(selectedHour) : "ALL"}
              onChange={(e) => handleHourFilterChange(e.target.value === "ALL" ? null : Number(e.target.value))}
              aria-label="Filter by hour of day in Europe/London"
              className="rounded bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
            >
              <option value="ALL">All Hours (24h)</option>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00 UK
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              aria-label="Filter by evaluation status"
              className="rounded bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
            >
              <option value="ALL">Status: ALL</option>
              <option value="VALID">VALID Only</option>
              <option value="MISSING_FORECAST">MISSING_FORECAST</option>
              <option value="MISSING_ACTUAL">MISSING_ACTUAL</option>
            </select>
          </div>

          {/* CSV Export Button */}
          <button
            type="button"
            disabled={isExportingCsv || !seriesData?.items?.length}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-50 transition-colors"
            title="Export all matching evaluation records to CSV"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Inconsistency Alert Banner (if multi-page pagination drift occurs) */}
      {seriesError && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>
              <strong>Evaluation Dataset Inconsistency:</strong> {seriesError.message}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              refetchSeries();
              refetchTable();
            }}
            className="px-3 py-1 rounded bg-rose-900 hover:bg-rose-800 text-white font-semibold transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Resync Dataset
          </button>
        </div>
      )}

      {/* 3. Four-View Workstation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-2 text-xs">
        <button
          type="button"
          onClick={() => setViewMode("timeline")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-colors ${
            viewMode === "timeline"
              ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>1. Hourly Timeline & Evaluations</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode("diurnal")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-colors ${
            viewMode === "diurnal"
              ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <Sun className="w-4 h-4" />
          <span>2. 24-Hour Diurnal Pattern</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode("distribution")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-colors ${
            viewMode === "distribution"
              ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>3. Error Distribution & Quantiles</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode("daily")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-colors ${
            viewMode === "daily"
              ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <TableIcon className="w-4 h-4" />
          <span>4. Daily Performance Ledger</span>
        </button>
      </div>

      {/* 4. Active View Content */}
      {viewMode === "timeline" && (
        <div className="space-y-6">
          {/* Complete Horizon Time Series Chart */}
          <HourlyAccuracyChart
            items={seriesData?.items ?? []}
            selectedHourUtc={tableData?.items?.[0]?.delivery_hour_utc}
            onSelectPoint={(item) => setAuditItem(item)}
          />

          {/* Paginated Evaluations Table */}
          <HourlyEvaluationsTable
            items={tableData?.items ?? []}
            pagination={
              tableData?.pagination ?? {
                page: tablePage,
                page_size: tablePageSize,
                total_items: 0,
                total_pages: 0,
                has_next: false,
                has_previous: false,
              }
            }
            sortBy={tableSortBy}
            order={tableOrder}
            onSortChange={handleTableSort}
            onPageChange={setTablePage}
            onPageSizeChange={(newSize) => {
              setTablePageSize(newSize);
              setTablePage(1);
            }}
            onInspectLineage={(item) => setAuditItem(item)}
            isLoading={isLoadingTable}
          />
        </div>
      )}

      {viewMode === "diurnal" && (
        <div className="space-y-6">
          {/* Dual-Axis Diurnal Error Curve */}
          <DiurnalProfileChart data={seriesData?.hour_of_day_summary ?? []} />

          {/* Diurnal Generation Envelope */}
          <DiurnalGenerationChart data={seriesData?.hour_of_day_summary ?? []} />

          {/* Diurnal Error Heatmap */}
          <DiurnalHeatmap
            items={seriesData?.items ?? []}
            onSelectCell={(item) => setAuditItem(item)}
          />
        </div>
      )}

      {viewMode === "distribution" && (
        <ErrorDistributionView items={seriesData?.items ?? []} />
      )}

      {viewMode === "daily" && (
        <DailyAccuracyLedger
          items={dailyData?.items ?? []}
          summary={dailyData?.summary}
          pagination={dailyData?.pagination}
          sortBy={dailySortBy}
          order={dailyOrder}
          onSortChange={handleDailySort}
          onSelectDay={(day) => {
            handleDayFilterChange(day);
            setViewMode("timeline");
          }}
          isLoading={isLoadingDaily}
        />
      )}

      {/* 5. Settlement Period Lineage & Mathematical Audit Modal */}
      <AuditLineageModal item={auditItem} onClose={() => setAuditItem(null)} />
    </div>
  );
}
