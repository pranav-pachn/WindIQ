import { Construction, ArrowLeft } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface PlaceholderPageProps {
  moduleName: string
  scheduledPhase: string
  description: string
  plannedFeatures: string[]
}

export function PlaceholderPage({
  moduleName,
  scheduledPhase,
  description,
  plannedFeatures,
}: PlaceholderPageProps) {
  return (
    <div className="max-w-2xl mx-auto py-12 space-y-6">
      <Card className="border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Badge variant="warning" size="sm">
              <Construction className="w-3 h-3 text-amber-400" />
              <span>{scheduledPhase}</span>
            </Badge>
            <span className="text-[11px] font-mono text-slate-400">
              Under Active Development
            </span>
          </div>
          <CardTitle className="text-lg mt-2 text-slate-100">
            {moduleName}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <p className="text-sm text-slate-300 leading-relaxed">
            {description}
          </p>

          <div className="rounded-lg bg-[#0b1120] border border-slate-800/80 p-4 space-y-2.5">
            <span className="text-xs font-semibold text-slate-200 block">
              Planned Capabilities for {scheduledPhase}:
            </span>
            <ul className="space-y-1.5 text-xs text-slate-400">
              {plannedFeatures.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-cyan-400 font-mono text-sm leading-none">•</span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2">
            <NavLink to="/">
              <Button variant="primary" size="sm">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Executive Overview</span>
              </Button>
            </NavLink>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

