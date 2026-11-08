import React, { useEffect } from "react";
import { X, CheckCircle2, ShieldCheck, Clock, Calculator, ArrowRight, Database } from "lucide-react";
import type { HourlyAccuracyItem } from "@/types/api";
import { formatMw, formatPct, formatLondonWithDstOffset, formatUtcDateTime, formatLeadTimeHours } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";

interface AuditLineageModalProps {
  item: HourlyAccuracyItem | null;
  onClose: () => void;
}

export function AuditLineageModal({ item, onClose }: AuditLineageModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!item) return null;

  const sp1 = item.traceability?.half_hour_readings?.[0];
  const sp2 = item.traceability?.half_hour_readings?.[1];

  const leadTimeText = formatLeadTimeHours(item.selected_publish_time_utc, item.delivery_hour_utc);

  const isEligible = Boolean(
    item.selected_publish_time_utc &&
      item.decision_cutoff_utc &&
      new Date(item.selected_publish_time_utc).getTime() <= new Date(item.decision_cutoff_utc).getTime()
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in duration-150"
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-app-surface border border-app-border shadow-2xl p-6 text-slate-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-app-border pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-app-elevated border border-app-border text-accent">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="audit-modal-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                Settlement Lineage &amp; Mathematical Audit
              </h2>
              <p className="text-xs text-muted font-mono mt-0.5">
                Delivery: {formatLondonWithDstOffset(item.delivery_hour_utc)} • UTC: {item.delivery_hour_utc}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close audit lineage modal"
            className="p-1.5 text-muted hover:text-white rounded-md hover:bg-app-elevated focus:outline-none focus:border-accent"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Forecast Lineage & 09:00 Cutoff Eligibility Check */}
        <div className="mb-5 p-4 rounded-lg bg-app-elevated border border-app-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              1. Day-Ahead Forecast Lineage &amp; Decision Lock
            </span>
            {isEligible ? (
              <Badge variant="success" size="sm">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Eligible (Pre-09:00 Cutoff)
              </Badge>
            ) : (
              <Badge variant="warning" size="sm">
                Cutoff Check Pending
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
            <div className="p-2.5 rounded bg-app-bg border border-app-border">
              <span className="text-[10px] text-muted uppercase tracking-wide block">Raw Record ID</span>
              <span className="font-mono font-bold text-slate-100">
                #{item.traceability?.selected_forecast_id ?? "—"}
              </span>
            </div>
            <div className="p-2.5 rounded bg-app-bg border border-app-border">
              <span className="text-[10px] text-muted uppercase tracking-wide block">Published (UTC)</span>
              <span className="font-mono text-accent">
                {item.selected_publish_time_utc ? formatUtcDateTime(item.selected_publish_time_utc) : "—"}
              </span>
            </div>
            <div className="p-2.5 rounded bg-app-bg border border-app-border">
              <span className="text-[10px] text-muted uppercase tracking-wide block">Decision Cutoff</span>
              <span className="font-mono text-slate-300">
                {formatUtcDateTime(item.decision_cutoff_utc)}
              </span>
            </div>
            <div className="p-2.5 rounded bg-app-bg border border-app-border">
              <span className="text-[10px] text-muted uppercase tracking-wide block">Lead Time</span>
              <span className="font-mono text-emerald-300 font-semibold">{leadTimeText}</span>
            </div>
          </div>

          <div className="text-[11px] text-muted bg-app-bg p-2.5 rounded border border-app-border">
            <span className="text-slate-300 font-semibold">Eligibility Verification:</span> Forecast was published at{" "}
            <span className="font-mono text-accent">{item.selected_publish_time_utc}</span> prior to the day-ahead{" "}
            <span className="font-mono text-slate-200">09:00 Europe/London</span> decision cutoff on{" "}
            <span className="font-mono text-slate-200">{item.decision_date}</span>. Any later publications leading up to delivery were disqualified to preserve true day-ahead commitment status.
          </div>
        </div>

        {/* Section 2: Constituent Settlement Readings (FUELHH Half-Hours) */}
        <div className="mb-5 p-4 rounded-lg bg-app-elevated border border-app-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-accent" />
              2. Constituent Settlement Readings (Elexon BMRS FUELHH)
            </span>
            <span className="text-xs font-mono text-muted">
              Actual ID: #{item.traceability?.hourly_actual_id ?? "—"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
            <div className="p-3 rounded bg-app-bg border border-app-border flex items-center justify-between">
              <div>
                <span className="text-[10px] text-muted uppercase tracking-wide block">
                  Settlement Period {sp1?.settlement_period ?? "—"} (Half-Hour 1)
                </span>
                <span className="font-mono text-slate-300 text-[11px]">
                  {sp1?.start_time_utc ? formatUtcDateTime(sp1.start_time_utc) : "—"}
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-slate-100">
                {sp1 ? formatMw(sp1.generation_mw) : "—"}
              </span>
            </div>

            <div className="p-3 rounded bg-app-bg border border-app-border flex items-center justify-between">
              <div>
                <span className="text-[10px] text-muted uppercase tracking-wide block">
                  Settlement Period {sp2?.settlement_period ?? "—"} (Half-Hour 2)
                </span>
                <span className="font-mono text-slate-300 text-[11px]">
                  {sp2?.start_time_utc ? formatUtcDateTime(sp2.start_time_utc) : "—"}
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-slate-100">
                {sp2 ? formatMw(sp2.generation_mw) : "—"}
              </span>
            </div>
          </div>

          {sp1 && sp2 && (
            <div className="p-2.5 rounded bg-app-bg border border-app-border text-xs font-mono text-slate-200 flex items-center justify-between">
              <span className="text-muted">Actual Generation Mean Formula:</span>
              <span className="font-semibold">
                ({formatMw(sp1.generation_mw, 1, false)} + {formatMw(sp2.generation_mw, 1, false)}) / 2 ={" "}
                <span className="text-accent underline">{formatMw(item.actual_generation_mw)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Section 3: Error & Percentage Derivation Proof */}
        <div className="p-4 rounded-lg bg-app-elevated border border-app-border">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-3">
            <Calculator className="w-3.5 h-3.5" />
            3. Error Derivation &amp; Percentage Proof
          </span>

          <div className="space-y-2.5 text-xs font-mono">
            {/* Signed error */}
            <div className="p-2.5 rounded bg-app-bg border border-app-border flex items-center justify-between">
              <span className="text-muted">Signed Forecast Error (Forecast − Actual):</span>
              <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                <span>{formatMw(item.forecast_generation_mw, 1, false)}</span>
                <span className="text-muted">−</span>
                <span>{formatMw(item.actual_generation_mw, 1, false)}</span>
                <ArrowRight className="w-3 h-3 text-accent" />
                <span className={item.forecast_error_mw && item.forecast_error_mw > 0 ? "text-amber-400" : "text-accent"}>
                  {item.forecast_error_mw && item.forecast_error_mw > 0 ? "+" : ""}
                  {formatMw(item.forecast_error_mw)}
                </span>
              </span>
            </div>

            {/* Absolute error */}
            <div className="p-2.5 rounded bg-app-bg border border-app-border flex items-center justify-between">
              <span className="text-muted">Absolute Forecast Error |ΔMW|:</span>
              <span className="font-semibold text-slate-100">
                |{item.forecast_error_mw && item.forecast_error_mw > 0 ? "+" : ""}
                {formatMw(item.forecast_error_mw, 1, false)}| ={" "}
                <span className="text-accent font-bold">{formatMw(item.absolute_error_mw)}</span>
              </span>
            </div>

            {/* APE */}
            <div className="p-2.5 rounded bg-app-bg border border-app-border flex items-center justify-between">
              <span className="text-muted">Absolute Percentage Error (APE):</span>
              {item.actual_generation_mw && item.actual_generation_mw > 0 ? (
                <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <span>({formatMw(item.absolute_error_mw, 1, false)} / {formatMw(item.actual_generation_mw, 1, false)}) × 100%</span>
                  <ArrowRight className="w-3 h-3 text-accent" />
                  <span className="text-accent font-bold">{formatPct(item.absolute_percentage_error, 4)}</span>
                </span>
              ) : (
                <span className="text-amber-400 italic">
                  NULL (Excluded from MAPE: Actual generation is ≤ 0 MW to prevent division by zero)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between pt-4 border-t border-app-border">
          <span className="text-[11px] text-muted">
            Audit standard: GB Elexon BMRS WINDFOR day-ahead commitment
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-app-elevated hover:bg-slate-700/60 border border-app-border text-slate-200 transition-colors"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
}

