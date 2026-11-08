import React, { useEffect } from 'react'
import {
  X,
  ShieldCheck,
  Clock,
  Calculator,
  Database,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import type { SingleDeliveryHourPublicationResponse } from '@/types/api'
import {
  formatMw,
  formatPct,
  formatUtcDateTime,
  formatLondonWithDstOffset,
} from '@/lib/formatters'
import { Badge } from '@/components/ui/badge'

interface PublicationTraceModalProps {
  data: SingleDeliveryHourPublicationResponse | null
  onClose: () => void
}

export const PublicationTraceModal: React.FC<PublicationTraceModalProps> = ({
  data,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!data) return null

  const selectedPub = data.publications.find((p) => p.is_selected)
  const sp1 = data.settlement_readings?.[0]
  const sp2 = data.settlement_readings?.[1]

  const forecastMw = selectedPub?.forecast_mw ?? null
  const actualMw = data.actual_generation_mw ?? null
  const errorMw =
    forecastMw !== null && actualMw !== null ? forecastMw - actualMw : null
  const apePct =
    forecastMw !== null && actualMw !== null && actualMw > 0
      ? (Math.abs(forecastMw - actualMw) / actualMw) * 100
      : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pub-trace-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1220]/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-[#111C2D] border border-[#26364A] shadow-2xl p-6 text-[#E7EDF5]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#26364A] pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#162337] border border-[#26364A] text-[#35B9C8]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="pub-trace-modal-title"
                className="text-base font-bold text-[#E7EDF5] flex items-center gap-2"
              >
                Forecast Selection &amp; Settlement Lineage Audit
              </h2>
              <p className="text-xs text-[#718198] font-mono mt-0.5">
                Delivery: {formatLondonWithDstOffset(data.delivery_hour_utc)} &bull; UTC: {data.delivery_hour_utc}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[#718198] hover:text-[#E7EDF5] rounded-md hover:bg-[#162337] focus:outline-none focus:border-[#35B9C8]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 text-xs">
          {/* Section 1: Decision Cutoff & Selection Rule */}
          <div className="p-3.5 rounded-lg bg-[#162337] border border-[#26364A] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#E7EDF5] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#35B9C8]" />
                Decision Cutoff Gate &amp; Eligibility
              </span>
              <Badge variant="outline" className="border-[#1C523B] bg-[#133829] text-[#35B98A] font-mono">
                Deterministic Policy
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[#718198]">Decision Cutoff (UTC):</span>
                <p className="font-mono text-[#E7EDF5] font-bold mt-0.5">
                  {formatUtcDateTime(data.decision_cutoff_utc)}
                </p>
              </div>
              <div>
                <span className="text-[#718198]">Total Publications Ingested:</span>
                <p className="font-mono text-[#E7EDF5] font-bold mt-0.5">
                  {data.total_publications} ({data.forward_publications} forward, {data.eligible_publications} eligible)
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Selected Winner */}
          <div className="p-3.5 rounded-lg bg-[#162337] border border-[#26364A] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#E7EDF5] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#35B98A]" />
                Selected Day-Ahead Forecast Publication
              </span>
              <Badge variant="outline" className="border-[#183E4C] bg-[#0E2833] text-[#35B9C8] font-mono">
                Official Benchmark Forecast
              </Badge>
            </div>
            {selectedPub ? (
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div>
                  <span className="text-[#718198]">Published At (UTC):</span>
                  <p className="font-mono text-[#E7EDF5] font-bold mt-0.5">
                    {formatUtcDateTime(selectedPub.publish_time_utc)}
                  </p>
                </div>
                <div>
                  <span className="text-[#718198]">Lead Time:</span>
                  <p className="font-mono text-[#35B9C8] font-bold mt-0.5">
                    {selectedPub.lead_time_hours?.toFixed(1) ?? '—'} hours
                  </p>
                </div>
                <div>
                  <span className="text-[#718198]">Selected Forecast MW:</span>
                  <p className="font-mono text-[#E7EDF5] font-bold text-sm mt-0.5">
                    {formatMw(selectedPub.forecast_mw)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-[#E7AD4A] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>No eligible forecast publication before cutoff.</span>
              </div>
            )}
          </div>

          {/* Section 3: Constituent Settlement Readings */}
          <div className="p-3.5 rounded-lg bg-[#162337] border border-[#26364A] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#E7EDF5] flex items-center gap-1.5">
                <Database className="w-4 h-4 text-[#35B98A]" />
                Elexon BMRS FUELHH Half-Hourly Readings
              </span>
              <Badge variant="outline" className="border-[#26364A] text-[#718198] font-mono">
                Status: {data.actual_data_status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded bg-[#0B1220] border border-[#26364A]">
                <div className="text-[#718198] text-[11px] mb-1">
                  Settlement Period {sp1?.settlement_period ?? '—'} (First Half-Hour)
                </div>
                <div className="font-mono text-[#E7EDF5] font-medium">
                  {sp1 ? formatUtcDateTime(sp1.start_time_utc) : 'Missing'}
                </div>
                <div className="font-mono text-[#E7EDF5] font-bold text-sm mt-1">
                  {sp1 ? formatMw(sp1.generation_mw) : '— MW'}
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#0B1220] border border-[#26364A]">
                <div className="text-[#718198] text-[11px] mb-1">
                  Settlement Period {sp2?.settlement_period ?? '—'} (Second Half-Hour)
                </div>
                <div className="font-mono text-[#E7EDF5] font-medium">
                  {sp2 ? formatUtcDateTime(sp2.start_time_utc) : 'Missing'}
                </div>
                <div className="font-mono text-[#E7EDF5] font-bold text-sm mt-1">
                  {sp2 ? formatMw(sp2.generation_mw) : '— MW'}
                </div>
              </div>
            </div>

            {sp1 && sp2 && (
              <div className="pt-2 border-t border-[#26364A] flex items-center justify-between text-[#9AAABD] text-[11px]">
                <span className="flex items-center gap-1 text-[#718198]">
                  <Calculator className="w-3.5 h-3.5 text-[#35B9C8]" />
                  Arithmetic Mean Formula:
                </span>
                <span className="font-mono">
                  ({formatMw(sp1.generation_mw, 1)} + {formatMw(sp2.generation_mw, 1)}) / 2 ={' '}
                  <strong className="text-[#35B9C8]">{formatMw(data.actual_generation_mw)}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Section 4: Mathematical Error Verification */}
          {forecastMw !== null && actualMw !== null && (
            <div className="p-3.5 rounded-lg bg-[#162337] border border-[#26364A] space-y-2">
              <span className="font-semibold text-[#E7EDF5] flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-[#35B9C8]" />
                Deterministic Verification
              </span>
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div>
                  <span className="text-[#718198]">Signed Error (&Delta; MW):</span>
                  <p
                    className={`font-mono font-bold mt-0.5 ${
                      (errorMw ?? 0) > 0 ? 'text-[#E7AD4A]' : 'text-[#35B9C8]'
                    }`}
                  >
                    {(errorMw ?? 0) > 0 ? '+' : ''}
                    {formatMw(errorMw)}
                  </p>
                </div>
                <div>
                  <span className="text-[#718198]">Absolute Error:</span>
                  <p className="font-mono text-[#35B9C8] font-bold mt-0.5">
                    {formatMw(Math.abs(errorMw ?? 0))}
                  </p>
                </div>
                <div>
                  <span className="text-[#718198]">Absolute Percentage Error:</span>
                  <p className="font-mono text-[#E7EDF5] font-bold mt-0.5">
                    {formatPct(apePct)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[#26364A] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-[#162337] hover:bg-[#1E2B3E] border border-[#26364A] text-[#E7EDF5] transition-colors"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  )
}

