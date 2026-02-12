"use client"

import * as React from "react"
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
import { Plus, Trash2, X, Volume2, Upload, Play, Square, Filter } from "lucide-react"
import type {
  MetricsConfig,
  DisplayItem,
  SystemType,
  ThresholdCondition,
  StatusConditions,
  AudioConfig,
  DataMatchCondition,
  DataMatchOperator,
} from "@/types"

interface SystemMetricsConfigProps {
  config: MetricsConfig
  onChange: (config: MetricsConfig) => void
  typeLabel: string
  systemType?: SystemType
  fixedSensorMode?: boolean
  dataPreviewSlot?: React.ReactNode
  disabled?: boolean
  sensorItemName?: string // "온도" or "습도" - render only this item
}

const SENSOR_TYPES = [
  { value: "온도", unit: "°C" },
  { value: "습도", unit: "%" },
]

const DEFAULT_CONDITIONS: StatusConditions = {
  normal: [],
  critical: [],
  coldCritical: [],
  dryCritical: [],
  humidCritical: [],
}

const DATA_MATCH_OPERATORS: { value: DataMatchOperator; label: string }[] = [
  { value: "contains", label: "포함" },
  { value: "startsWith", label: "시작" },
  { value: "endsWith", label: "끝남" },
  { value: "equals", label: "일치" },
  { value: "regex", label: "정규식" },
]

function newCondition(): ThresholdCondition {
  return { operator: "gte", value1: 0, value2: null }
}

// Number input that allows clearing the field before typing a new value
function NumericInput({
  value,
  onValueChange,
  className,
  disabled,
}: {
  value: number
  onValueChange: (v: number) => void
  className?: string
  disabled?: boolean
}) {
  const [local, setLocal] = React.useState(String(value))

  React.useEffect(() => {
    setLocal((prev) => {
      const parsed = prev === "" ? NaN : parseFloat(prev)
      return parsed === value ? prev : String(value)
    })
  }, [value])

  return (
    <Input
      type="number"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value)
        if (e.target.value !== "") {
          onValueChange(parseFloat(e.target.value))
        }
      }}
      onBlur={() => {
        if (local === "") setLocal(String(value))
      }}
      className={className}
      disabled={disabled}
    />
  )
}

// Data match conditions for filtering incoming data per display item
function SensorItemDataMatch({
  conditions,
  onUpdate,
  disabled,
}: {
  conditions: DataMatchCondition[]
  onUpdate: (conditions: DataMatchCondition[]) => void
  disabled?: boolean
}) {
  const addCondition = () => {
    onUpdate([...conditions, { operator: "contains", value: "" }])
  }

  const removeCondition = (idx: number) => {
    onUpdate(conditions.filter((_, i) => i !== idx))
  }

  const updateCondition = (idx: number, updates: Partial<DataMatchCondition>) => {
    onUpdate(conditions.map((c, i) => (i === idx ? { ...c, ...updates } : c)))
  }

  return (
    <div className="ml-2 mt-0.5 space-y-1">
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">데이터 매칭 조건</span>
        {conditions.length >= 2 && (
          <span className="text-[10px] text-muted-foreground">(OR 매칭)</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-xs text-muted-foreground"
          onClick={addCondition}
          disabled={disabled}
        >
          <Plus className="h-3 w-3 mr-0.5" />
          조건
        </Button>
      </div>
      {conditions.map((cond, idx) => (
        <div key={idx} className="flex items-center gap-1 ml-4">
          <Select
            value={cond.operator}
            onValueChange={(v) => updateCondition(idx, { operator: v as DataMatchOperator })}
            disabled={disabled}
          >
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATA_MATCH_OPERATORS.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={cond.value}
            onChange={(e) => updateCondition(idx, { value: e.target.value })}
            placeholder="매칭 값"
            className="h-7 flex-1 text-xs font-mono"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => removeCondition(idx)}
            disabled={disabled}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}

// Sensor-specific condition editor for a single display item
function SensorItemConditions({
  item,
  onUpdate,
  disabled,
}: {
  item: DisplayItem
  onUpdate: (updates: Partial<DisplayItem>) => void
  disabled?: boolean
}) {
  const conditions = item.conditions || DEFAULT_CONDITIONS
  const isTemperature = item.name === "온도"
  const isHumidity = item.name === "습도"

  const updateConditions = (newConditions: StatusConditions) => {
    onUpdate({ conditions: newConditions })
  }

  const addCondition = (status: keyof StatusConditions) => {
    updateConditions({
      ...conditions,
      [status]: [...(conditions[status] || []), newCondition()],
    })
  }

  const removeCondition = (status: keyof StatusConditions, idx: number) => {
    updateConditions({
      ...conditions,
      [status]: conditions[status].filter((_, i) => i !== idx),
    })
  }

  const updateCondition = (
    status: keyof StatusConditions,
    idx: number,
    updates: Partial<ThresholdCondition>
  ) => {
    updateConditions({
      ...conditions,
      [status]: conditions[status].map((c, i) =>
        i === idx ? { ...c, ...updates } : c
      ),
    })
  }

  const statusSections: {
    key: keyof StatusConditions
    label: string
    color: string
    dot: string
  }[] = [
    { key: "normal", label: "표준", color: "text-green-500", dot: "bg-green-500" },
    ...(isTemperature ? [
      { key: "critical" as const, label: "고온 경고", color: "text-red-500", dot: "bg-red-500" },
      { key: "coldCritical" as const, label: "저온 경고", color: "text-blue-500", dot: "bg-blue-500" },
    ] : isHumidity ? [
      { key: "dryCritical" as const, label: "건조 경고", color: "text-orange-500", dot: "bg-orange-500" },
      { key: "humidCritical" as const, label: "다습 경고", color: "text-cyan-500", dot: "bg-cyan-500" },
    ] : [
      { key: "critical" as const, label: "경고", color: "text-red-500", dot: "bg-red-500" },
    ]),
  ]

  return (
    <div className="ml-4 mt-1 space-y-2">
      {statusSections.map(({ key, label, color, dot }) => (
        <div key={key} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
            <span className={`text-xs font-medium ${color}`}>{label}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1 text-xs text-muted-foreground"
              onClick={() => addCondition(key)}
              disabled={disabled}
            >
              <Plus className="h-3 w-3 mr-0.5" />
              조건
            </Button>
          </div>
          {(conditions[key] || []).map((cond, idx) => (
            <div key={idx} className="flex items-center gap-1 ml-4">
              <NumericInput
                value={cond.value1}
                onValueChange={(v) =>
                  updateCondition(key, idx, { value1: v })
                }
                className="h-7 w-20 text-xs"
                disabled={disabled}
              />
              <span className="text-[10px] text-muted-foreground">{item.unit}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeCondition(key, idx)}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Per-item audio config for sensor display items
function SensorItemAudio({
  audioConfig,
  onUpdate,
  itemIndex,
  disabled,
}: {
  audioConfig: AudioConfig
  onUpdate: (config: AudioConfig) => void
  itemIndex: number
  disabled?: boolean
}) {
  const [uploading, setUploading] = React.useState(false)
  const [playing, setPlaying] = React.useState(false)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  const isFile = audioConfig.type === "file"

  const handleToggle = () => {
    if (isFile) {
      onUpdate({ type: "none" })
    } else {
      onUpdate({ type: "file" })
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/audio/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "업로드 실패")
      }

      const { fileName } = await response.json()
      onUpdate({ type: "file", fileName })
    } catch (err) {
      alert(err instanceof Error ? err.message : "업로드 오류")
    } finally {
      setUploading(false)
    }
  }

  const handlePreview = () => {
    if (playing) {
      audioRef.current?.pause()
      if (audioRef.current) audioRef.current.currentTime = 0
      setPlaying(false)
      return
    }

    if (!audioConfig.fileName) return

    const audio = new Audio(`/api/audio/${audioConfig.fileName}`)
    audio.onended = () => setPlaying(false)
    audio.onerror = () => {
      setPlaying(false)
      alert("파일 재생에 실패했습니다")
    }
    audioRef.current = audio
    setPlaying(true)
    audio.play()
  }

  const uploadId = `sensor-audio-upload-${itemIndex}`

  return (
    <div className="ml-2 mt-0.5 flex items-center gap-2">
      <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">경고 음성</span>
      <Button
        type="button"
        variant={isFile ? "default" : "outline"}
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={handleToggle}
        disabled={disabled}
      >
        {isFile ? "파일" : "없음"}
      </Button>
      {isFile && (
        <>
          <Label
            htmlFor={uploadId}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent'}`}
          >
            <Upload className="h-3 w-3" />
            {uploading ? "업로드 중..." : audioConfig.fileName || "파일 선택"}
          </Label>
          <input
            id={uploadId}
            type="file"
            accept=".mp3,.wav"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading || disabled}
          />
          {audioConfig.fileName && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handlePreview}
              disabled={disabled}
            >
              {playing ? (
                <Square className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

export function SystemMetricsConfig({
  config,
  onChange,
  typeLabel,
  systemType,
  fixedSensorMode = false,
  dataPreviewSlot,
  disabled = false,
  sensorItemName,
}: SystemMetricsConfigProps) {
  const isSensor = systemType === "sensor"

  const addItem = () => {
    const nextIndex = config.displayItems.length
    if (isSensor) {
      onChange({
        ...config,
        displayItems: [
          ...config.displayItems,
          {
            name: "온도",
            index: nextIndex,
            unit: "°C",
            warning: null,
            critical: null,
            conditions: { ...DEFAULT_CONDITIONS },
            audioConfig: { type: 'none' },
            dataMatchConditions: [],
          },
        ],
      })
    } else {
      onChange({
        ...config,
        displayItems: [
          ...config.displayItems,
          {
            name: "",
            index: nextIndex,
            unit: "",
            warning: null,
            critical: null,
          },
        ],
      })
    }
  }

  const updateItem = (index: number, updates: Partial<DisplayItem>) => {
    onChange({
      ...config,
      displayItems: config.displayItems.map((item, i) =>
        i === index ? { ...item, ...updates } : item
      ),
    })
  }

  const removeItem = (index: number) => {
    onChange({
      ...config,
      displayItems: config.displayItems.filter((_, i) => i !== index),
    })
  }

  const handleSensorTypeChange = (index: number, sensorName: string) => {
    const sensorType = SENSOR_TYPES.find((s) => s.value === sensorName)
    if (!sensorType) return
    const item = config.displayItems[index]
    const updates: Partial<DisplayItem> = {
      name: sensorType.value,
      unit: sensorType.unit,
    }
    // Reset irrelevant conditions when switching type
    if (sensorName === "습도" && item.conditions) {
      updates.conditions = { ...item.conditions, coldCritical: [], critical: [] }
    }
    if (sensorName === "온도" && item.conditions) {
      updates.conditions = { ...item.conditions, dryCritical: [], humidCritical: [] }
    }
    updateItem(index, updates)
  }

  // Fixed 2-item sensor mode for temperature/humidity
  if (isSensor && fixedSensorMode) {
    // Initialize: auto-create temperature/humidity items if missing
    React.useEffect(() => {
      const tempItem = config.displayItems.find((i) => i.name === "온도")
      const humidItem = config.displayItems.find((i) => i.name === "습도")

      if (!tempItem || !humidItem) {
        const newItems: DisplayItem[] = []

        // Reuse existing temperature item or create new
        newItems.push(
          tempItem || {
            name: "온도",
            index: 0,
            unit: "°C",
            warning: null,
            critical: null,
            conditions: { ...DEFAULT_CONDITIONS },
            audioConfig: { type: "none" },
            dataMatchConditions: [],
          }
        )

        // Reuse existing humidity item or create new
        newItems.push(
          humidItem || {
            name: "습도",
            index: 1,
            unit: "%",
            warning: null,
            critical: null,
            conditions: { ...DEFAULT_CONDITIONS },
            audioConfig: { type: "none" },
            dataMatchConditions: [],
          }
        )

        onChange({ ...config, displayItems: newItems })
      }
    }, [])

    const temperatureItem = config.displayItems.find((item) => item.name === "온도")
    const humidityItem = config.displayItems.find((item) => item.name === "습도")

    // Helper to update a single condition value
    const updateSingleCondition = (
      itemIndex: number,
      conditionKey: keyof StatusConditions,
      value: number | null
    ) => {
      const item = config.displayItems[itemIndex]
      const conditions = item.conditions || DEFAULT_CONDITIONS
      const operator = (conditionKey === 'coldCritical' || conditionKey === 'dryCritical')
        ? 'lte' as const
        : 'gte' as const
      // Clear stale fields that don't belong to this item type
      const staleClears: Partial<StatusConditions> = {}
      if (item.name === '습도') {
        staleClears.critical = []
        staleClears.coldCritical = []
      } else if (item.name === '온도') {
        staleClears.dryCritical = []
        staleClears.humidCritical = []
      }
      const newConditions = {
        ...conditions,
        ...staleClears,
        [conditionKey]: value === null ? [] : [{ operator, value1: value, value2: null }],
      }
      updateItem(itemIndex, { conditions: newConditions })
    }

    // Helper to get single condition value
    const getSingleConditionValue = (
      item: DisplayItem | undefined,
      conditionKey: keyof StatusConditions
    ): number | null => {
      if (!item?.conditions) return null
      const conds = item.conditions[conditionKey]
      return conds && conds.length > 0 ? conds[0].value1 : null
    }

    // Render only specific sensor item if specified
    const shouldRenderTemp = !sensorItemName || sensorItemName === "온도"
    const shouldRenderHumid = !sensorItemName || sensorItemName === "습도"

    return (
      <div className="space-y-1">
        {/* Temperature item */}
        {temperatureItem && shouldRenderTemp && (
          <div className="space-y-1">
            {!sensorItemName && (
              <div className="pb-2 border-b">
                <span className="font-medium text-sm">온도</span>
              </div>
            )}

            {/* Data matching conditions */}
            <SensorItemDataMatch
              conditions={temperatureItem.dataMatchConditions || []}
              onUpdate={(c) => {
                const idx = config.displayItems.findIndex((i) => i.name === "온도")
                if (idx !== -1) updateItem(idx, { dataMatchConditions: c })
              }}
              disabled={disabled}
            />

            {/* Simplified single-value conditions - 3-column grid */}
            <div className="ml-2 mt-0.5 grid grid-cols-3 gap-2">
              {/* Normal */}
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-green-500">표준</span>
                </div>
                <div className="flex items-center gap-1">
                  <NumericInput
                    value={getSingleConditionValue(temperatureItem, "normal") ?? 0}
                    onValueChange={(v) => {
                      const idx = config.displayItems.findIndex((i) => i.name === "온도")
                      if (idx !== -1) updateSingleCondition(idx, "normal", v)
                    }}
                    className="h-7 w-20 text-xs"
                    disabled={disabled}
                  />
                  <span className="text-[10px] text-muted-foreground">{temperatureItem.unit}</span>
                </div>
              </div>
              {/* High temperature critical */}
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-xs font-medium text-red-500">고온</span>
                </div>
                <div className="flex items-center gap-1">
                  <NumericInput
                    value={getSingleConditionValue(temperatureItem, "critical") ?? 0}
                    onValueChange={(v) => {
                      const idx = config.displayItems.findIndex((i) => i.name === "온도")
                      if (idx !== -1) updateSingleCondition(idx, "critical", v)
                    }}
                    className="h-7 w-20 text-xs"
                    disabled={disabled}
                  />
                  <span className="text-[10px] text-muted-foreground">{temperatureItem.unit}</span>
                </div>
              </div>
              {/* Low temperature critical */}
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-xs font-medium text-blue-500">저온</span>
                </div>
                <div className="flex items-center gap-1">
                  <NumericInput
                    value={getSingleConditionValue(temperatureItem, "coldCritical") ?? 0}
                    onValueChange={(v) => {
                      const idx = config.displayItems.findIndex((i) => i.name === "온도")
                      if (idx !== -1) updateSingleCondition(idx, "coldCritical", v)
                    }}
                    className="h-7 w-20 text-xs"
                    disabled={disabled}
                  />
                  <span className="text-[10px] text-muted-foreground">{temperatureItem.unit}</span>
                </div>
              </div>
            </div>

            {/* Audio alert */}
            <SensorItemAudio
              audioConfig={temperatureItem.audioConfig || { type: "none" }}
              onUpdate={(ac) => {
                const idx = config.displayItems.findIndex((i) => i.name === "온도")
                if (idx !== -1) updateItem(idx, { audioConfig: ac })
              }}
              itemIndex={0}
              disabled={disabled}
            />
          </div>
        )}

        {/* Humidity item */}
        {humidityItem && shouldRenderHumid && (
          <div className="space-y-1">
            {!sensorItemName && (
              <div className="pb-2 border-b">
                <span className="font-medium text-sm">습도</span>
              </div>
            )}

            {/* Data matching conditions */}
            <SensorItemDataMatch
              conditions={humidityItem.dataMatchConditions || []}
              onUpdate={(c) => {
                const idx = config.displayItems.findIndex((i) => i.name === "습도")
                if (idx !== -1) updateItem(idx, { dataMatchConditions: c })
              }}
              disabled={disabled}
            />

            {/* Simplified single-value conditions - 3-column grid */}
            <div className="ml-2 mt-0.5 grid grid-cols-3 gap-2">
              {/* Normal */}
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-green-500">표준</span>
                </div>
                <div className="flex items-center gap-1">
                  <NumericInput
                    value={getSingleConditionValue(humidityItem, "normal") ?? 0}
                    onValueChange={(v) => {
                      const idx = config.displayItems.findIndex((i) => i.name === "습도")
                      if (idx !== -1) updateSingleCondition(idx, "normal", v)
                    }}
                    className="h-7 w-20 text-xs"
                    disabled={disabled}
                  />
                  <span className="text-[10px] text-muted-foreground">{humidityItem.unit}</span>
                </div>
              </div>
              {/* Dry critical */}
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                  <span className="text-xs font-medium text-orange-500">건조</span>
                </div>
                <div className="flex items-center gap-1">
                  <NumericInput
                    value={getSingleConditionValue(humidityItem, "dryCritical") ?? 0}
                    onValueChange={(v) => {
                      const idx = config.displayItems.findIndex((i) => i.name === "습도")
                      if (idx !== -1) updateSingleCondition(idx, "dryCritical", v)
                    }}
                    className="h-7 w-20 text-xs"
                    disabled={disabled}
                  />
                  <span className="text-[10px] text-muted-foreground">{humidityItem.unit}</span>
                </div>
              </div>
              {/* Humid critical */}
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-cyan-500" />
                  <span className="text-xs font-medium text-cyan-500">다습</span>
                </div>
                <div className="flex items-center gap-1">
                  <NumericInput
                    value={getSingleConditionValue(humidityItem, "humidCritical") ?? 0}
                    onValueChange={(v) => {
                      const idx = config.displayItems.findIndex((i) => i.name === "습도")
                      if (idx !== -1) updateSingleCondition(idx, "humidCritical", v)
                    }}
                    className="h-7 w-20 text-xs"
                    disabled={disabled}
                  />
                  <span className="text-[10px] text-muted-foreground">{humidityItem.unit}</span>
                </div>
              </div>
            </div>

            {/* Audio alert */}
            <SensorItemAudio
              audioConfig={humidityItem.audioConfig || { type: "none" }}
              onUpdate={(ac) => {
                const idx = config.displayItems.findIndex((i) => i.name === "습도")
                if (idx !== -1) updateItem(idx, { audioConfig: ac })
              }}
              itemIndex={1}
              disabled={disabled}
            />
          </div>
        )}

      </div>
    )
  }

  // Sensor mode UI
  if (isSensor) {
    return (
      <div className="space-y-4">
        <div className="font-medium text-sm">{typeLabel} 설정</div>

        <div className="space-y-3">
          <Label className="text-sm text-muted-foreground">표시 항목</Label>

          {config.displayItems.map((item, index) => (
            <div key={index} className="rounded-md border p-3 space-y-2">
              {/* Item header row */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">종류</span>
                <Select
                  value={item.name || "온도"}
                  onValueChange={(v) => handleSensorTypeChange(index, v)}
                >
                  <SelectTrigger className="h-8 w-20 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENSOR_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-xs text-muted-foreground">순서</span>
                <Input
                  type="number"
                  value={item.index}
                  onChange={(e) =>
                    updateItem(index, {
                      index: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  min={0}
                  className="h-8 w-14 text-sm"
                />

                <span className="text-xs text-muted-foreground">단위</span>
                <span className="text-sm font-mono px-2 py-1 bg-muted rounded">
                  {item.unit || "—"}
                </span>

                <div className="flex-1" />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Data match conditions */}
              <SensorItemDataMatch
                conditions={item.dataMatchConditions || []}
                onUpdate={(c) => updateItem(index, { dataMatchConditions: c })}
                disabled={disabled}
              />

              {/* Condition sections */}
              <SensorItemConditions
                item={item}
                onUpdate={(updates) => updateItem(index, updates)}
                disabled={disabled}
              />

              {/* Per-item audio config */}
              <SensorItemAudio
                audioConfig={item.audioConfig || { type: 'none' }}
                onUpdate={(ac) => updateItem(index, { audioConfig: ac })}
                itemIndex={index}
                disabled={disabled}
              />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            항목 추가
          </Button>
        </div>
      </div>
    )
  }

  // Default UPS/other mode (unchanged table UI)
  return (
    <div className="space-y-4">
      <div className="font-medium text-sm">{typeLabel} 설정</div>

      <div className="space-y-3">
        <Label className="text-sm text-muted-foreground">표시 항목</Label>

        {config.displayItems.length > 0 && (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">이름</th>
                  <th className="px-3 py-2 text-left font-medium w-16">순서</th>
                  <th className="px-3 py-2 text-left font-medium w-16">단위</th>
                  <th className="px-3 py-2 text-left font-medium w-20">주의</th>
                  <th className="px-3 py-2 text-left font-medium w-20">경고</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {config.displayItems.map((item, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-2 py-1">
                      <Input
                        value={item.name}
                        onChange={(e) =>
                          updateItem(index, { name: e.target.value })
                        }
                        placeholder="항목명"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={item.index}
                        onChange={(e) =>
                          updateItem(index, {
                            index: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        min={0}
                        className="h-8 w-14"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={item.unit}
                        onChange={(e) =>
                          updateItem(index, { unit: e.target.value })
                        }
                        placeholder="V"
                        className="h-8 w-14"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={item.warning ?? ""}
                        onChange={(e) =>
                          updateItem(index, {
                            warning: e.target.value
                              ? parseFloat(e.target.value)
                              : null,
                          })
                        }
                        placeholder="-"
                        className="h-8 w-16"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={item.critical ?? ""}
                        onChange={(e) =>
                          updateItem(index, {
                            critical: e.target.value
                              ? parseFloat(e.target.value)
                              : null,
                          })
                        }
                        placeholder="-"
                        className="h-8 w-16"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" />
          항목 추가
        </Button>
      </div>
    </div>
  )
}
