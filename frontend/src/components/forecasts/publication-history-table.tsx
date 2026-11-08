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
    <div className="bg-[#111C2D] border border-[#26364A] rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#26364A] bg-[#162337] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#E7EDF5] flex items-center gap-2">
          <span>Complete Publication Lifecycle &amp; Step Revision Ledger</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#0B1220] border border-[#26364A] text-[#718198] font-mono">
            {pubs.length} versions
          </span>
        </h3>
        <span className="text-xs text-[#718198]">
          Ordered chronologically from earliest to final publication before delivery
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-[#0E1726] text-[#718198] font-mono text-[11px] uppercase tracking-wider border-b border-[#26364A]">
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
          <tbody className="divide-y divide-[#1E2B3E] font-mono">
            {pubs.map((pub, idx) => {
              const isSelected = pub.is_selected || (selId && pub.id === selId)
              return (
                <tr
                  key={pub.id ?? `${pub.publish_time_utc}-${idx}`}
                  className={`transition-colors hover:bg-[#162337]/70 ${
                    isSelected
                      ? 'bg-[#162337] border-l-2 border-l-[#35B9C8] font-medium'
                      : ''
                  }`}
                >
                  <td className="py-2 px-3 text-[#718198]">{idx + 1}</td>
                  <td className="py-2 px-3 text-[#E7EDF5]">
                    {formatDateTimeUtc(pub.publish_time_utc)}
                  </td>
                  <td className="py-2 px-3 text-[#718198]">
                    {formatDateTimeLondon(pub.publish_time_utc)}
                  </td>
                  <td className="py-2 px-3 text-right text-[#9AAABD]">
                    {pub.lead_time_hours !== null && pub.lead_time_hours !== undefined
                      ? `${pub.lead_time_hours > 0 ? '+' : ''}${pub.lead_time_hours.toFixed(1)}h`
                      : 'N/A'}
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-[#E7EDF5]">
                    {formatNumber(pub.forecast_mw)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {pub.revision_mw !== null && pub.revision_mw !== undefined ? (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                          pub.revision_mw > 0
                            ? 'text-[#35B98A]'
                            : pub.revision_mw < 0
                            ? 'text-[#E36D73]'
                            : 'text-[#718198]'
                        }`}
                      >
                        {pub.revision_mw > 0 && <ArrowUpRight className="w-3 h-3" />}
                        {pub.revision_mw < 0 && <ArrowDownRight className="w-3 h-3" />}
                        {pub.revision_mw > 0 ? '+' : ''}
                        {formatNumber(pub.revision_mw)}
                      </span>
                    ) : (
                      <span className="text-[#718198]">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {pub.is_eligible ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#133829] text-[#35B98A] border border-[#1C523B] font-sans">
                        <CheckCircle2 className="w-2.5 h-2.5 text-[#35B98A]" />
                        ELIGIBLE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#162337] text-[#718198] border border-[#26364A] font-sans">
                        <XCircle className="w-2.5 h-2.5 text-[#718198]" />
                        POST-CUTOFF
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[#0E2833] text-[#35B9C8] border border-[#183E4C] font-sans font-medium">
                        <Award className="w-3 h-3 text-[#35B9C8]" />
                        D-1 WINNER
                      </span>
                    ) : (
                      <span className="text-[#718198] text-[10px]">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleAudit(pub)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-sans font-medium text-[#35B9C8] bg-[#162337] hover:bg-[#1E2B3E] border border-[#26364A] transition-colors cursor-pointer"
                      title="Inspect raw BMRS payload & lineage"
                    >
                      <Eye className="w-3 h-3 text-[#35B9C8]" />
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

