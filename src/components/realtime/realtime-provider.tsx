'use client'

import { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import type {
  PrismaSystem,
  PrismaMetric,
  PrismaAlarm,
  WebSocketMessage,
} from '@/types'

interface RealtimeContextValue {
  systems: PrismaSystem[]
  metrics: PrismaMetric[]
  alarms: PrismaAlarm[]
  connected: boolean
  reconnecting: boolean
  lastUpdate: Date | null
  updateSystem: (systemId: string, updates: Partial<PrismaSystem>) => void
  updateMetric: (metricId: string, updates: Partial<PrismaMetric>) => void
  addAlarm: (alarm: PrismaAlarm) => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

interface RealtimeProviderProps {
  children: React.ReactNode
  initialSystems: PrismaSystem[]
  initialAlarms: PrismaAlarm[]
}

export function RealtimeProvider({
  children,
  initialSystems,
  initialAlarms,
}: RealtimeProviderProps) {
  const [systems, setSystems] = useState<PrismaSystem[]>(initialSystems)
  const [alarms, setAlarms] = useState<PrismaAlarm[]>(initialAlarms)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Ref to avoid handleMessage depending on systems state (prevents recreation on every metric update)
  const systemsRef = useRef<PrismaSystem[]>(initialSystems)
  systemsRef.current = systems

  // Extract all metrics from systems
  const metrics = systems.flatMap((s) => s.metrics ?? [])

  const updateSystem = useCallback((systemId: string, updates: Partial<PrismaSystem>) => {
    setSystems((prev) =>
      prev.map((s) => (s.id === systemId ? { ...s, ...updates } : s))
    )
    setLastUpdate(new Date())
  }, [])

  const updateMetric = useCallback((metricId: string, updates: Partial<PrismaMetric>) => {
    setSystems((prev) =>
      prev.map((system) => ({
        ...system,
        metrics: system.metrics?.map((m) =>
          m.id === metricId ? { ...m, ...updates } : m
        ),
      }))
    )
    setLastUpdate(new Date())
  }, [])

  const addAlarm = useCallback((alarm: PrismaAlarm) => {
    setAlarms((prev) => [alarm, ...prev].slice(0, 100)) // Keep max 100 alarms
    setLastUpdate(new Date())
  }, [])

  const removeSystem = useCallback((systemId: string) => {
    setSystems((prev) => prev.filter((s) => s.id !== systemId))
    setAlarms((prev) => prev.filter((a) => a.systemId !== systemId))
    setLastUpdate(new Date())
  }, [])

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      const { type, data } = message

      switch (type) {
        case 'metric':
          if (data.metricId && data.value !== undefined) {
            updateMetric(data.metricId, {
              value: data.value,
              trend: data.trend ?? null,
              updatedAt: new Date(),
            })
          }
          break

        case 'system':
          if (data.systemId && data.status) {
            updateSystem(data.systemId, {
              status: data.status,
              updatedAt: new Date(),
            })
            // 정상 복귀 시 해당 시스템의 미해결 알람도 정리 (alarm-resolved 놓침 대비)
            if (data.status === 'normal') {
              setAlarms((prev) =>
                prev.filter((a) => a.systemId !== data.systemId || a.resolvedAt !== null)
              )
              setLastUpdate(new Date())
            }
          }
          break

        case 'alarm':
          // 단일 알람 확인 처리
          if (data.acknowledged && data.alarmId && !data.severity) {
            setAlarms((prev) =>
              prev.map((a) =>
                a.id === data.alarmId
                  ? { ...a, acknowledged: true, acknowledgedAt: new Date(message.timestamp) }
                  : a
              )
            )
            setLastUpdate(new Date())
            break
          }

          // 일괄 알람 확인 처리
          if (data.acknowledged && data.bulk && data.alarmIds) {
            const acknowledgedIds = new Set(data.alarmIds as string[])
            setAlarms((prev) =>
              prev.map((a) =>
                acknowledgedIds.has(a.id)
                  ? { ...a, acknowledged: true, acknowledgedAt: new Date(message.timestamp) }
                  : a
              )
            )
            setLastUpdate(new Date())
            break
          }

          // 새 알람 추가 (기존 로직)
          if (data.alarmId && data.severity && data.message && data.systemId) {
            const newAlarm: PrismaAlarm = {
              id: data.alarmId,
              systemId: data.systemId,
              severity: data.severity,
              message: data.message,
              acknowledged: data.acknowledged ?? false,
              acknowledgedAt: null,
              acknowledgedBy: null,
              createdAt: new Date(message.timestamp),
              resolvedAt: null,
              system: systemsRef.current.find((s) => s.id === data.systemId),
            }
            addAlarm(newAlarm)
          }
          break

        case 'ping':
          // Connection keepalive, no action needed
          break

        case 'delete':
          if (data.systemId) {
            removeSystem(data.systemId)
          }
          break

        case 'alarm-resolved':
          if (data.systemId) {
            // Remove unresolved alarms for this system
            setAlarms((prev) =>
              prev.filter((a) => a.systemId !== data.systemId || a.resolvedAt !== null)
            )
            setLastUpdate(new Date())
          }
          break

        default:
          console.log('[realtime] Unknown message type:', type)
      }
    },
    [updateMetric, updateSystem, addAlarm, removeSystem]
  )

  // WebSocket 재연결 시 전체 상태 동기화
  const syncState = useCallback(async () => {
    try {
      const [systemsRes, alarmsRes] = await Promise.all([
        fetch('/api/systems'),
        fetch('/api/alarms?acknowledged=false&resolved=false&limit=100'),
      ])
      if (systemsRes.ok) {
        const freshSystems = await systemsRes.json()
        setSystems(freshSystems)
      }
      if (alarmsRes.ok) {
        const freshAlarms = await alarmsRes.json()
        setAlarms(freshAlarms)
      }
      setLastUpdate(new Date())
    } catch (e) {
      console.error('[realtime] State sync failed:', e)
    }
  }, [])

  const hasConnectedOnce = useRef(false)

  const { connected, reconnecting } = useWebSocket({
    onMessage: handleMessage,
    onConnect: () => {
      console.log('[realtime] WebSocket connected')
      if (hasConnectedOnce.current) {
        // 재연결 시 전체 상태 동기화
        syncState()
      }
      hasConnectedOnce.current = true
    },
    onDisconnect: () => console.log('[realtime] WebSocket disconnected'),
  })

  // 주기적 상태 동기화 (30초) - WebSocket 메시지 유실 시 자동 복구
  useEffect(() => {
    if (!connected) return
    const interval = setInterval(syncState, 5000)
    return () => clearInterval(interval)
  }, [connected, syncState])

  // Update initial data when props change (e.g., page navigation)
  useEffect(() => {
    setSystems(initialSystems)
  }, [initialSystems])

  useEffect(() => {
    setAlarms(initialAlarms)
  }, [initialAlarms])

  return (
    <RealtimeContext.Provider
      value={{
        systems,
        metrics,
        alarms,
        connected,
        reconnecting,
        lastUpdate,
        updateSystem,
        updateMetric,
        addAlarm,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext)
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider')
  }
  return context
}
