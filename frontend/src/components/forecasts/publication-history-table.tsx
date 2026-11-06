import React from 'react'
import {
  formatDateTimeUtc,
  formatDateTimeLondon,
  formatNumber,
} from '@/lib/formatters'
import type { PublicationVersion, SingleDeliveryHourPublicationResponse } from '@/types/api'
import { CheckCircle2, XCircle, Award, Eye, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface PublicationHistoryTableProps {
  data?: SingleDeliveryHourPublicationResponse
  publications?: PublicationVersion[]
  selectedForecastId?: number | null
  onAuditPublication?: (pub: PublicationVersion) => void
  onOpenAuditModal?: () => void
}

export const PublicationHistoryTable: React.FC<PublicationHistoryTableProps> = ({
  data,
  publications,
  selectedForecastId,
  onAuditPublication,
  onOpenAuditModal,
}) => {
  const pubs = data?.publications ?? publications ?? []
  const selId = data?.selected_forecast_id ?? selectedForecastId

  const handleAudit = (pub: PublicationVersion) => {
    if (onAuditPublication) onAuditPublication(pub)
    if (onOpenAuditModal) onOpenAuditModal()
  }
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <span>Complete Publication Lifecycle & Step Revision Ledger</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {pubs.length} versions
          </span>
        </h3>
        <span className="text-xs text-slate-400">
          Ordered chronologically from earliest to final gate closure
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-950/90 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-slate-800">
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Publication Time (UTC)</th>
              <th className="py-2.5 px-3">UK Local Time</th>
              <th className="py-2.5 px-3 text-right">Lead Time (h)</th>
              <th className="py-2.5 px-3 text-right">Forecast (MW)</th>
              <th className="py-2.5 px-3 text-right">Step Revision</th>
              <th className="py-2.5 px-3 text-center">Cutoff Status</th>
              <th className="py-2.5 px-3 text-center">Selection</th>
              <th className="py-2.5 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {pubs.map((pub, idx) => {
              const isSelected = pub.is_selected || (selId && pub.id === selId)
              return (
                <tr
                  key={pub.id ?? `${pub.publish_time_utc}-${idx}`}
                  className={`transition-colors hover:bg-slate-800/40 ${
                    isSelected
                      ? 'bg-cyan-950/30 border-l-2 border-l-cyan-400 font-medium'
                      : ''
                  }`}
                >
                  <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                  <td className="py-2 px-3 text-slate-200">
                    {formatDateTimeUtc(pub.publish_time_utc)}
                  </td>
                  <td className="py-2 px-3 text-slate-400">
                    {formatDateTimeLondon(pub.publish_time_utc)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    {pub.lead_time_hours !== null && pub.lead_time_hours !== undefined
                      ? `${pub.lead_time_hours > 0 ? '+' : ''}${pub.lead_time_hours.toFixed(1)}h`
                      : 'N/A'}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-100">
                    {formatNumber(pub.forecast_mw)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {pub.revision_mw !== null && pub.revision_mw !== undefined ? (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                          pub.revision_mw > 0
                            ? 'text-emerald-400'
                            : pub.revision_mw < 0
                            ? 'text-rose-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {pub.revision_mw > 0 && <ArrowUpRight className="w-3 h-3" />}
                        {pub.revision_mw < 0 && <ArrowDownRight className="w-3 h-3" />}
                        {pub.revision_mw > 0 ? '+' : ''}
                        {formatNumber(pub.revision_mw)}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {pub.is_eligible ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 font-sans">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        ELIGIBLE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-800/80 text-slate-400 font-sans">
                        <XCircle className="w-2.5 h-2.5 text-slate-500" />
                        POST-CUTOFF
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-cyan-900/90 text-cyan-200 border border-cyan-700 font-sans font-bold shadow-sm">
                        <Award className="w-3 h-3 text-cyan-400" />
                        D-1 WINNER
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleAudit(pub)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-sans font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                      title="Inspect raw BMRS payload & lineage"
                    >
                      <Eye className="w-3 h-3 text-cyan-400" />
                      <span>Audit</span>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

