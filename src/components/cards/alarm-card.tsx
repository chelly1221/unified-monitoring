'use client'

import { AlertTriangle, AlertCircle, Check } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface AlarmData {
  id: string
  severity: string
  message: string
  acknowledged: boolean
  createdAt: Date
  system?: { name: string } | null
}

interface AlarmCardProps {
  alarm: AlarmData
  onAcknowledge?: (id: string) => void
  className?: string
  compact?: boolean
  showAcknowledgedLabel?: boolean
  showSystemName?: boolean
}

function formatTime(date: Date): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}.${month}.${day} ${hour}:${minute}`
}

export function AlarmCard({ alarm, onAcknowledge, className, compact = false, showAcknowledgedLabel = true, showSystemName = true }: AlarmCardProps) {
  const isCritical = alarm.severity === 'critical'

  if (compact) {
    return (
      <Card
        className={cn(
          'flex flex-row items-center gap-2 rounded border px-2 py-0.5 text-xs shadow-none',
          isCritical && !alarm.acknowledged && 'border-[#f87171] bg-[#f87171]/10',
          !isCritical && !alarm.acknowledged && 'border-[#facc15] bg-[#facc15]/10',
          alarm.acknowledged && 'opacity-60 border-border',
          className
        )}
      >
        {isCritical ? (
          <AlertCircle className="h-3 w-3 shrink-0 text-[#f87171]" />
        ) : (
          <AlertTriangle className="h-3 w-3 shrink-0 text-[#facc15]" />
        )}
        <span className={cn(
          'font-medium shrink-0',
          isCritical ? 'text-[#f87171]' : 'text-[#facc15]'
        )}>
          {isCritical ? '심각' : '주의'}
        </span>
        {showSystemName && <span className="text-white shrink-0">{alarm.system?.name || '알 수 없음'}</span>}
        <span className="text-muted-foreground shrink-0 ml-auto">{formatTime(alarm.createdAt)}</span>
      </Card>
    )
  }

  // In acknowledged alarms tab (showAcknowledgedLabel=false), don't dim the card
  const shouldDim = alarm.acknowledged && showAcknowledgedLabel

  return (
    <Card
      className={cn(
        'flex flex-row items-center justify-between rounded-none border px-2 py-1 text-xs shadow-none gap-0',
        isCritical && !alarm.acknowledged && 'animate-pulse-border border-[#f87171] bg-[#f87171]/5',
        !isCritical && !alarm.acknowledged && 'border-[#facc15] bg-[#facc15]/5',
        shouldDim && 'opacity-60 border-border bg-card',
        alarm.acknowledged && !shouldDim && 'border-border bg-card',
        className
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {isCritical ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#f87171]" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#facc15]" />
        )}
        <span className={cn(
          'font-medium shrink-0',
          isCritical ? 'text-[#f87171]' : 'text-[#facc15]'
        )}>
          {isCritical ? '심각' : '주의'}
        </span>
        {showSystemName && <span className="text-white shrink-0">{alarm.system?.name || '알 수 없음'}</span>}
        <span className="text-muted-foreground/70 shrink-0 ml-1">
          {formatTime(alarm.createdAt)}
        </span>
      </div>

      {!alarm.acknowledged && onAcknowledge && (
        <button
          onClick={() => onAcknowledge(alarm.id)}
          className="shrink-0 ml-2 flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-xs hover:bg-accent cursor-pointer"
        >
          <Check className="h-3 w-3" />
          확인
        </button>
      )}

      {alarm.acknowledged && showAcknowledgedLabel && (
        <span className="shrink-0 ml-2 text-muted-foreground/70">확인됨</span>
      )}
    </Card>
  )
}
