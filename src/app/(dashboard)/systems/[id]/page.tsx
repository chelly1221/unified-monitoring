"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Edit, Save, X, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlarmCard } from "@/components/cards/alarm-card"
import { SystemActions } from "@/components/forms/system-actions"
import { SystemMetricsConfig } from "@/components/forms/system-metrics-config"
import { SystemEquipmentConfig } from "@/components/forms/system-equipment-config"
import { SystemAudioConfig } from "@/components/forms/system-audio-config"
import { SystemDataPreview } from "@/components/forms/system-data-preview"
import { useWebSocket } from "@/hooks/useWebSocket"
import type {
  SystemStatus,
  PrismaSystem,
  WebSocketMessage,
  SystemType,
  MetricsConfig,
  EquipmentConfig,
  AudioConfig,
  DataMatchCondition,
} from "@/types"

const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  delimiter: ",",
  displayItems: [],
}

const DEFAULT_EQUIPMENT_CONFIG: EquipmentConfig = {
  normalPatterns: ["OK", "NORMAL", "정상"],
  criticalPatterns: ["CRITICAL", "FAIL", "심각"],
  matchMode: "exact",
}

const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  type: "none",
}

function getStatusBadgeClass(status: SystemStatus, isEnabled: boolean): string {
  if (!isEnabled) return "bg-neutral-800 text-neutral-500"

  switch (status) {
    case "normal":
      return "bg-[#4ade80] text-white hover:bg-[#4ade80]/90"
    case "warning":
      return "bg-[#facc15] text-black hover:bg-[#facc15]/90"
    case "critical":
      return "bg-[#f87171] text-white hover:bg-[#f87171]/90"
    case "offline":
    default:
      return ""
  }
}

function getStatusLabel(status: SystemStatus, isEnabled: boolean): string {
  if (!isEnabled) return "비활성"

  switch (status) {
    case "normal":
      return "정상"
    case "warning":
      return "주의"
    case "critical":
      return "경고"
    case "offline":
    default:
      return "오프라인"
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "equipment":
      return "장비상태"
    case "ups":
      return "UPS"
    case "sensor":
      return "온습도"
    case "radar":
      return "레이더"
    case "fms":
      return "FMS"
    case "lcms":
      return "LCMS"
    case "vdl":
      return "VDL"
    case "marc":
      return "MARC"
    case "transmission":
      return "전송로"
    default:
      return type
  }
}

function getSystemType(type: string): SystemType {
  if (["equipment", "ups", "sensor"].includes(type)) {
    return type as SystemType
  }
  if (type === "ups") return "ups"
  if (type === "sensor") return "sensor"
  return "equipment"
}

interface MetricData {
  id: string
  name: string
  value: number
  unit: string
  min: number | null
  max: number | null
  warningThreshold: number | null
  criticalThreshold: number | null
  trend: string | null
}

interface AlarmData {
  id: string
  severity: string
  message: string
  createdAt: string
  acknowledged: boolean
  acknowledgedAt: string | null
  system: { id: string; name: string }
}

interface SystemWithRelations {
  id: string
  name: string
  type: string
  status: string
  port: number | null
  protocol: string | null
  isEnabled: boolean
  isActive: boolean
  config: string | null
  audioConfig: string | null
  lastDataAt: string | null
  createdAt: string
  updatedAt: string
  metrics: MetricData[]
  alarms: AlarmData[]
}

export default function SystemDetailPage() {
  const router = useRouter()
  const params = useParams()
  const systemId = params.id as string

  const [system, setSystem] = React.useState<SystemWithRelations | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Edit mode state
  const [isEditMode, setIsEditMode] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Form state for edit mode
  const [name, setName] = React.useState("")
  const [port, setPort] = React.useState("")
  const [protocol, setProtocol] = React.useState<"udp" | "tcp">("udp")
  const [metricsConfig, setMetricsConfig] = React.useState<MetricsConfig>(DEFAULT_METRICS_CONFIG)
  const [equipmentConfig, setEquipmentConfig] = React.useState<EquipmentConfig>(DEFAULT_EQUIPMENT_CONFIG)
  const [audioConfig, setAudioConfig] = React.useState<AudioConfig>(DEFAULT_AUDIO_CONFIG)

  // Data preview state
  const [previewMessages, setPreviewMessages] = React.useState<string[]>([])
  const [wsConnected, setWsConnected] = React.useState(false)

  const handleWebSocketMessage = React.useCallback(
    (message: WebSocketMessage) => {
      setSystem((prev) => {
        if (!prev) return prev

        // Handle bulk alarm acknowledgment
        if (
          message.type === "alarm" &&
          message.data.acknowledged &&
          message.data.bulk &&
          message.data.alarmIds
        ) {
          const acknowledgedIds = new Set(message.data.alarmIds as string[])
          return {
            ...prev,
            alarms: prev.alarms.map((a) =>
              acknowledgedIds.has(a.id)
                ? { ...a, acknowledged: true, acknowledgedAt: message.timestamp }
                : a
            ),
          }
        }

        // Handle single alarm acknowledgment (from any source)
        if (message.type === "alarm" && message.data.acknowledged && message.data.alarmId) {
          return {
            ...prev,
            alarms: prev.alarms.map((a) =>
              a.id === message.data.alarmId
                ? { ...a, acknowledged: true, acknowledgedAt: message.timestamp }
                : a
            ),
          }
        }

        // Below handlers require matching systemId
        if (!message.data?.systemId || message.data.systemId !== systemId) return prev

        if (message.type === "system") {
          return {
            ...prev,
            status: message.data.status || prev.status,
          }
        }

        if (message.type === "metric" && message.data.metricId) {
          return {
            ...prev,
            metrics: prev.metrics.map((m) =>
              m.id === message.data.metricId
                ? {
                    ...m,
                    value: message.data.value ?? m.value,
                    trend: message.data.trend ?? m.trend,
                  }
                : m
            ),
          }
        }

        if (message.type === "alarm" && message.data.alarmId && !message.data.acknowledged) {
          const newAlarm: AlarmData = {
            id: message.data.alarmId,
            severity: message.data.severity || "warning",
            message: message.data.message || "",
            createdAt: message.timestamp,
            acknowledged: false,
            acknowledgedAt: null,
            system: { id: systemId, name: prev.name },
          }
          return {
            ...prev,
            alarms: [newAlarm, ...prev.alarms].slice(0, 10),
          }
        }

        return prev
      })
    },
    [systemId]
  )

  useWebSocket({
    onMessage: handleWebSocketMessage,
  })

  // Fetch system data
  React.useEffect(() => {
    async function fetchSystem() {
      try {
        const response = await fetch(`/api/systems/${systemId}`)
        if (!response.ok) {
          throw new Error("시설을 찾을 수 없습니다")
        }
        const data = await response.json()
        setSystem(data)

        // Initialize form state
        setName(data.name)
        setPort(data.port?.toString() || "")
        setProtocol((data.protocol as "udp" | "tcp") || "udp")

        // Parse config based on type
        if (data.config) {
          try {
            const parsed = JSON.parse(data.config)
            if (data.type === "equipment") {
              setEquipmentConfig(parsed as EquipmentConfig)
            } else {
              setMetricsConfig(parsed as MetricsConfig)
            }
          } catch {
            // Use defaults
          }
        }

        // Parse audioConfig
        if (data.audioConfig) {
          try {
            setAudioConfig(JSON.parse(data.audioConfig) as AudioConfig)
          } catch {
            // Use defaults
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다")
      } finally {
        setLoading(false)
      }
    }

    fetchSystem()
  }, [systemId])

  // WebSocket connection for data preview
  React.useEffect(() => {
    const portNum = parseInt(port, 10)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setPreviewMessages([])
      setWsConnected(false)
      return
    }

    const wsUrl = `ws://${window.location.hostname}:7778`
    let ws: WebSocket | null = null

    try {
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setWsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === "raw" && message.data?.port === portNum) {
            setPreviewMessages((prev) => {
              const newMessages = [...prev, message.data.rawData]
              return newMessages.slice(-100)
            })
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
      }

      ws.onerror = () => {
        setWsConnected(false)
      }
    } catch {
      setWsConnected(false)
    }

    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [port])

  const handleAcknowledge = async (alarmId: string) => {
    try {
      const response = await fetch(`/api/alarms/${alarmId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgedBy: "operator" }),
      })
      if (response.ok) {
        setSystem((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            alarms: prev.alarms.map((alarm) =>
              alarm.id === alarmId
                ? { ...alarm, acknowledged: true, acknowledgedAt: new Date().toISOString() }
                : alarm
            ),
          }
        })
      }
    } catch (error) {
      console.error("Failed to acknowledge alarm:", error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      if (!name.trim()) {
        throw new Error("시설명을 입력하세요")
      }
      if (!port.trim()) {
        throw new Error("포트 번호를 입력하세요")
      }

      const portNum = parseInt(port, 10)
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error("유효한 포트 번호를 입력하세요 (1-65535)")
      }

      const systemType = system?.type
      const configValue = systemType === "equipment" ? equipmentConfig : metricsConfig

      const payload: Record<string, unknown> = {
        name: name.trim(),
        type: systemType,
        port: portNum,
        protocol,
        config: configValue,
      }

      // Include audioConfig for non-sensor types
      if (systemType !== "sensor") {
        payload.audioConfig = audioConfig
      } else {
        payload.audioConfig = { type: "none" as const }
      }

      const response = await fetch(`/api/systems/${systemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "저장에 실패했습니다")
      }

      // Refetch system data
      const updatedData = await response.json()
      setSystem(updatedData)
      setIsEditMode(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset form to original values
    if (system) {
      setName(system.name)
      setPort(system.port?.toString() || "")
      setProtocol((system.protocol as "udp" | "tcp") || "udp")
      if (system.config) {
        try {
          const parsed = JSON.parse(system.config)
          if (system.type === "equipment") {
            setEquipmentConfig(parsed as EquipmentConfig)
          } else {
            setMetricsConfig(parsed as MetricsConfig)
          }
        } catch {
          setMetricsConfig(DEFAULT_METRICS_CONFIG)
          setEquipmentConfig(DEFAULT_EQUIPMENT_CONFIG)
        }
      }
      if (system.audioConfig) {
        try {
          setAudioConfig(JSON.parse(system.audioConfig) as AudioConfig)
        } catch {
          setAudioConfig(DEFAULT_AUDIO_CONFIG)
        }
      } else {
        setAudioConfig(DEFAULT_AUDIO_CONFIG)
      }
    }
    setError(null)
    setIsEditMode(false)
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !system) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error || "시설을 찾을 수 없습니다"}</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          뒤로
        </Button>
      </div>
    )
  }

  if (!system) return null

  const status = system.status as SystemStatus
  const isEnabled = system.isEnabled !== false
  const isSensor = system.type === "sensor"

  const getConditionsForItem = (name: string): DataMatchCondition[] | undefined =>
    metricsConfig.displayItems.find((i) => i.name === name)?.dataMatchConditions

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{isEditMode ? name : system.name}</h1>
              <Badge className={getStatusBadgeClass(status, isEnabled)}>
                {getStatusLabel(status, isEnabled)}
              </Badge>
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span>{getTypeLabel(system.type)}</span>
              {(isEditMode ? port : system.port) && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  <span>
                    포트: {isEditMode ? port : system.port} (
                    {(isEditMode ? protocol : system.protocol)?.toUpperCase()})
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isEditMode ? (
            <>
              {/* 취소 버튼 (아이콘만) */}
              <Button
                variant="outline"
                size="icon"
                onClick={handleCancel}
                disabled={saving}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>

              {/* 저장 버튼 (아이콘만) */}
              <Button
                size="icon"
                onClick={handleSave}
                disabled={saving}
                className="h-8 w-8"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </>
          ) : (
            <SystemActions
              system={system as unknown as PrismaSystem}
              onEnabledChange={(enabled) =>
                setSystem((prev) => (prev ? { ...prev, isEnabled: enabled } : prev))
              }
              onEditClick={() => setIsEditMode(true)}
            />
          )}
        </div>
      </div>

      {/* Content - sensor 타입은 3열 레이아웃 */}
      {isSensor ? (
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
          {/* Band 1: 기본정보 (편집 모드에서만 수정 가능) */}
          <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-card p-4 shrink-0">
            <div className="flex items-center gap-2">
              <Label htmlFor="name" className="whitespace-nowrap">시설명</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 온습도 센서"
                className="w-64"
                disabled={!isEditMode}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="port" className="whitespace-nowrap">포트</Label>
              <Input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="1892"
                className="w-24"
                disabled={!isEditMode}
                min={1}
                max={65535}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">프로토콜</Label>
              <Select
                value={protocol}
                onValueChange={(value) => setProtocol(value as "udp" | "tcp")}
                disabled={!isEditMode}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="udp">UDP</SelectItem>
                  <SelectItem value="tcp">TCP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive shrink-0">
              {error}
            </div>
          )}

          {/* Band 2: 3열 레이아웃 (온습도 설정 | 데이터 미리보기 | 알람) */}
          <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
            {/* 왼쪽 컬럼: 온습도 설정 */}
            <Card className="flex-1 flex flex-col overflow-hidden p-0">
              <CardHeader className="shrink-0 py-2">
                <CardTitle className="text-sm">온습도 설정</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-2 overflow-y-auto px-3 pb-3">
                {/* 온도 설정 (상단 50%) */}
                <div className="flex-1 min-h-0 border rounded-lg p-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">온도</div>
                  <SystemMetricsConfig
                    config={metricsConfig}
                    onChange={setMetricsConfig}
                    typeLabel="온도"
                    systemType={getSystemType(system.type)}
                    fixedSensorMode={true}
                    disabled={!isEditMode}
                    sensorItemName="온도"
                  />
                </div>

                {/* 습도 설정 (하단 50%) */}
                <div className="flex-1 min-h-0 border rounded-lg p-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">습도</div>
                  <SystemMetricsConfig
                    config={metricsConfig}
                    onChange={setMetricsConfig}
                    typeLabel="습도"
                    systemType={getSystemType(system.type)}
                    fixedSensorMode={true}
                    disabled={!isEditMode}
                    sensorItemName="습도"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 중앙 컬럼: 데이터 미리보기 */}
            <Card className="flex-1 flex flex-col overflow-hidden p-0">
              <CardHeader className="shrink-0 py-2">
                <CardTitle className="text-sm">데이터 미리보기</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden px-3 pb-3">
                {/* 온도 미리보기 (상단 50%) */}
                <div className="flex-1 min-h-0 border rounded-lg p-3">
                  <SystemDataPreview
                    port={port}
                    connected={wsConnected}
                    messages={previewMessages}
                    className="h-[calc(100%-1.5rem)]"
                    label="온도"
                    dataMatchConditions={getConditionsForItem("온도")}
                  />
                </div>

                {/* 습도 미리보기 (하단 50%) */}
                <div className="flex-1 min-h-0 border rounded-lg p-3">
                  <SystemDataPreview
                    port={port}
                    connected={wsConnected}
                    messages={previewMessages}
                    className="h-[calc(100%-1.5rem)]"
                    label="습도"
                    dataMatchConditions={getConditionsForItem("습도")}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 오른쪽 컬럼: 알람 로그 */}
            <Card className="flex-1 flex flex-col overflow-hidden p-0">
              <CardHeader className="shrink-0 py-2">
                <CardTitle className="text-sm">알람 로그</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto px-3 pb-3">
                {system.alarms.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    알람 기록 없음
                  </div>
                ) : (
                  <div className="space-y-1">
                    {system.alarms.map((alarm) => (
                      <AlarmCard
                        key={alarm.id}
                        alarm={alarm as never}
                        onAcknowledge={handleAcknowledge}
                        showSystemName={false}
                        compact={true}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* equipment/UPS: 인라인 편집 레이아웃 */
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
          {/* Band 1: 기본정보 */}
          <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-card p-4 shrink-0">
            <div className="flex items-center gap-2">
              <Label htmlFor="name" className="whitespace-nowrap">시설명</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 장비명"
                className="w-64"
                disabled={!isEditMode}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="port" className="whitespace-nowrap">포트</Label>
              <Input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="1892"
                className="w-24"
                disabled={!isEditMode}
                min={1}
                max={65535}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">프로토콜</Label>
              <Select
                value={protocol}
                onValueChange={(value) => setProtocol(value as "udp" | "tcp")}
                disabled={!isEditMode}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="udp">UDP</SelectItem>
                  <SelectItem value="tcp">TCP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive shrink-0">
              {error}
            </div>
          )}

          {/* Band 2: 3열 레이아웃 (설정 | 데이터 미리보기 | 알람 로그) */}
          <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
            {/* 왼쪽: 타입별 설정 */}
            <Card className="flex-1 flex flex-col overflow-hidden p-0">
              <CardHeader className="shrink-0 py-2">
                <CardTitle className="text-sm">
                  {system.type === "equipment" ? "상태 판단 패턴" : "메트릭 설정"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto px-3 pb-3">
                {system.type === "equipment" ? (
                  <SystemEquipmentConfig
                    config={equipmentConfig}
                    onChange={setEquipmentConfig}
                    layout="horizontal"
                    disabled={!isEditMode}
                  />
                ) : (
                  <SystemMetricsConfig
                    config={metricsConfig}
                    onChange={setMetricsConfig}
                    typeLabel="UPS"
                    systemType="ups"
                    disabled={!isEditMode}
                  />
                )}
              </CardContent>
            </Card>

            {/* 중앙: 데이터 미리보기 */}
            <Card className="flex-1 flex flex-col overflow-hidden p-0">
              <CardHeader className="shrink-0 py-2">
                <CardTitle className="text-sm">데이터 미리보기</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden px-3 pb-3">
                <SystemDataPreview
                  port={port}
                  connected={wsConnected}
                  messages={previewMessages}
                  className="flex-1 min-h-0"
                />
              </CardContent>
            </Card>

            {/* 오른쪽: 알람 로그 */}
            <Card className="flex-1 flex flex-col overflow-hidden p-0">
              <CardHeader className="shrink-0 py-2">
                <CardTitle className="text-sm">알람 로그</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto px-3 pb-3">
                {system.alarms.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    알람 기록 없음
                  </div>
                ) : (
                  <div className="space-y-1">
                    {system.alarms.map((alarm) => (
                      <AlarmCard
                        key={alarm.id}
                        alarm={alarm as never}
                        onAcknowledge={handleAcknowledge}
                        showSystemName={false}
                        compact={true}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Band 3: 음성 알림 설정 (편집 모드에서만) */}
          {isEditMode && (
            <div className="shrink-0">
              <SystemAudioConfig config={audioConfig} onChange={setAudioConfig} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
