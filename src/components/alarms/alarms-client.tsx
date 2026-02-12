'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlarmCard } from '@/components/cards/alarm-card'
import { AlertTriangle, AlertCircle, CheckCircle, CheckCheck } from 'lucide-react'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { WebSocketMessage } from '@/types'
import { toast } from 'sonner'

interface AlarmData {
  id: string
  severity: string
  message: string
  acknowledged: boolean
  acknowledgedAt: Date | null
  createdAt: Date
  resolvedAt: Date | null
  systemId: string
  system?: { id: string; name: string } | null
}

interface AlarmsClientProps {
  initialActiveAlarms: AlarmData[]
  initialAcknowledgedAlarms: AlarmData[]
}

export function AlarmsClient({
  initialActiveAlarms,
  initialAcknowledgedAlarms,
}: AlarmsClientProps) {
  const [activeAlarms, setActiveAlarms] = useState<AlarmData[]>(initialActiveAlarms)
  const [acknowledgedAlarms, setAcknowledgedAlarms] = useState<AlarmData[]>(initialAcknowledgedAlarms)

  const criticalCount = activeAlarms.filter((a) => a.severity === 'critical').length
  const warningCount = activeAlarms.filter((a) => a.severity === 'warning').length

  // Handle WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    const { type, data } = message

    // Handle bulk alarm acknowledgment
    if (type === 'alarm' && data.acknowledged && data.bulk && data.alarmIds) {
      const acknowledgedIds = new Set(data.alarmIds as string[])
      const alarmsToMove = activeAlarms.filter((a) => acknowledgedIds.has(a.id))
      if (alarmsToMove.length > 0) {
        setActiveAlarms((prev) => prev.filter((a) => !acknowledgedIds.has(a.id)))
        setAcknowledgedAlarms((prev) => [
          ...alarmsToMove.map((a) => ({
            ...a,
            acknowledged: true,
            acknowledgedAt: new Date(message.timestamp),
          })),
          ...prev,
        ])
      }
      return
    }

    // Handle single alarm acknowledgment (from another page)
    if (type === 'alarm' && data.acknowledged && data.alarmId) {
      const alarmId = data.alarmId as string
      const alarm = activeAlarms.find((a) => a.id === alarmId)
      if (alarm) {
        setActiveAlarms((prev) => prev.filter((a) => a.id !== alarmId))
        setAcknowledgedAlarms((prev) => [
          {
            ...alarm,
            acknowledged: true,
            acknowledgedAt: new Date(message.timestamp),
          },
          ...prev,
        ])
      }
      return
    }

    // Handle new alarm
    if (type === 'alarm' && data.alarmId && data.severity && data.message && data.systemId) {
      const newAlarm: AlarmData = {
        id: data.alarmId,
        systemId: data.systemId,
        severity: data.severity,
        message: data.message,
        acknowledged: data.acknowledged ?? false,
        acknowledgedAt: null,
        createdAt: new Date(message.timestamp),
        resolvedAt: null,
        system: { id: data.systemId, name: data.systemName || '' },
      }
      setActiveAlarms((prev) => [newAlarm, ...prev])
    } else if (type === 'alarm-resolved' && data.systemId) {
      // Remove resolved alarms from active list
      setActiveAlarms((prev) =>
        prev.filter((a) => a.systemId !== data.systemId || a.resolvedAt !== null)
      )
    }
  }, [activeAlarms])

  useWebSocket({
    onMessage: handleMessage,
  })

  // Sync with server data when it changes
  useEffect(() => {
    setActiveAlarms(initialActiveAlarms)
  }, [initialActiveAlarms])

  useEffect(() => {
    setAcknowledgedAlarms(initialAcknowledgedAlarms)
  }, [initialAcknowledgedAlarms])

  const handleAcknowledge = useCallback(async (alarmId: string) => {
    try {
      const response = await fetch(`/api/alarms/${alarmId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgedBy: 'operator' }),
      })

      if (!response.ok) {
        throw new Error('Failed to acknowledge alarm')
      }

      const updatedAlarm = await response.json()

      // Move alarm from active to acknowledged
      setActiveAlarms((prev) => prev.filter((a) => a.id !== alarmId))

      const acknowledgedAlarmData = activeAlarms.find((a) => a.id === alarmId)
      if (acknowledgedAlarmData) {
        setAcknowledgedAlarms((prev) => [
          {
            ...acknowledgedAlarmData,
            acknowledged: true,
            acknowledgedAt: new Date(updatedAlarm.acknowledgedAt),
          },
          ...prev,
        ])
      }

      toast.success('알람이 확인되었습니다')
    } catch (error) {
      console.error('Failed to acknowledge alarm:', error)
      toast.error('알람 확인에 실패했습니다')
    }
  }, [activeAlarms])

  const handleAcknowledgeAll = useCallback(async () => {
    if (activeAlarms.length === 0) return

    try {
      const response = await fetch('/api/alarms/acknowledge-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgedBy: 'operator' }),
      })

      if (!response.ok) {
        throw new Error('Failed to acknowledge all alarms')
      }

      const { count } = await response.json()

      // Move all active alarms to acknowledged
      const now = new Date()
      setAcknowledgedAlarms((prev) => [
        ...activeAlarms.map((a) => ({
          ...a,
          acknowledged: true,
          acknowledgedAt: now,
        })),
        ...prev,
      ])
      setActiveAlarms([])

      toast.success(`${count}개 알람이 일괄 확인되었습니다`)
    } catch (error) {
      console.error('Failed to acknowledge all alarms:', error)
      toast.error('일괄 확인에 실패했습니다')
    }
  }, [activeAlarms])

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Summary Stats */}
      <div className="flex items-center gap-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-8 w-8 text-[#f87171]" />
          <div>
            <p className="text-sm text-muted-foreground">경고</p>
            <p className="text-2xl font-bold text-[#f87171]">{criticalCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-8 w-8 text-[#facc15]" />
          <div>
            <p className="text-sm text-muted-foreground">주의</p>
            <p className="text-2xl font-bold text-[#facc15]">{warningCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="h-8 w-8 text-[#4ade80]" />
          <div>
            <p className="text-sm text-muted-foreground">확인됨</p>
            <p className="text-2xl font-bold text-[#4ade80]">{acknowledgedAlarms.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="flex-1 flex flex-col min-h-0 gap-0">
        <div className="flex items-center justify-between">
          <TabsList className="rounded-b-none">
            <TabsTrigger value="active" className="gap-2">
              활성 알람
              {activeAlarms.length > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {activeAlarms.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="acknowledged">확인된 알람</TabsTrigger>
          </TabsList>
          {activeAlarms.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAcknowledgeAll}
              className="gap-2"
            >
              <CheckCheck className="h-4 w-4" />
              일괄 확인
            </Button>
          )}
        </div>

        <TabsContent value="active" className="mt-0 flex-1 min-h-0">
          <Card className="h-full flex flex-col rounded-tl-none py-0">
            <CardContent className="flex-1 min-h-0 p-0 overflow-auto">
              {activeAlarms.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground">
                  활성 알람 없음
                </div>
              ) : (
                <div>
                  {activeAlarms.map((alarm) => (
                    <AlarmCard
                      key={alarm.id}
                      alarm={alarm}
                      onAcknowledge={handleAcknowledge}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acknowledged" className="mt-0 flex-1 min-h-0">
          <Card className="h-full flex flex-col rounded-tl-none py-0">
            <CardContent className="flex-1 min-h-0 p-0 overflow-auto">
              {acknowledgedAlarms.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground">
                  확인된 알람 없음
                </div>
              ) : (
                <div>
                  {acknowledgedAlarms.map((alarm) => (
                    <AlarmCard key={alarm.id} alarm={alarm} showAcknowledgedLabel={false} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
