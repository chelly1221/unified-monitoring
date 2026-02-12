// Database updater for incoming metric data

import { PrismaClient } from '@prisma/client'
import { ParsedData, extractNumericValue } from './parser'
import { PortConfig } from './config'
import {
  broadcastMetric,
  broadcastSystemStatus,
  broadcastAlarm,
  broadcastAlarmResolution,
} from './websocket-server'
import { syncSirenState } from './siren-trigger'
import type { EquipmentConfig, MetricsConfig, SystemStatus, DisplayItem } from '@/types'
import { evaluateSensorStatus, isColdCritical, isDryCritical, isHumidCritical } from '@/lib/threshold-evaluator'
import { matchesDataConditions } from '@/lib/data-match'

const prisma = new PrismaClient()

// Critical signal must occur CRITICAL_THRESHOLD consecutive times before triggering fault
const criticalCounters = new Map<string, number>()
const CRITICAL_THRESHOLD = 3

// Per-metric confirmed critical state: "systemId:metricName" → true when counter reached threshold
const metricCriticalState = new Map<string, boolean>()

// Per-system mutex to serialize async processing and prevent interleaving
const systemMutexes = new Map<string, Promise<void>>()

function withSystemMutex(systemId: string, fn: () => Promise<void>): Promise<void> {
  const prev = systemMutexes.get(systemId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  systemMutexes.set(systemId, next)
  return next
}

// Offline detection interval (check every 10 seconds)
const OFFLINE_CHECK_INTERVAL = 10000
// Systems are marked offline after 30 seconds of no data
const OFFLINE_THRESHOLD = 30000

let offlineCheckInterval: ReturnType<typeof setInterval> | null = null
let historyCleanupInterval: ReturnType<typeof setInterval> | null = null

/**
 * Calculate equipment status based on pattern matching
 */
function calculateEquipmentStatus(rawData: string, config: EquipmentConfig): SystemStatus | null {
  const trimmed = rawData.trim()

  // Check critical patterns first (highest priority)
  if (config.criticalPatterns?.some(pattern =>
    config.matchMode === 'exact' ? trimmed === pattern : trimmed.includes(pattern)
  )) {
    return 'critical'
  }

  // Check normal patterns
  if (config.normalPatterns?.some(pattern =>
    config.matchMode === 'exact' ? trimmed === pattern : trimmed.includes(pattern)
  )) {
    return 'normal'
  }

  // No match - ignore unknown messages (lastDataAt still updated for offline detection)
  return null
}

/**
 * Process a single system's metric update
 */
async function processSystemMetric(
  system: { id: string; name: string; config: string | null; metrics: { id: string; name: string; value: number; unit: string; warningThreshold: number | null; criticalThreshold: number | null }[] },
  data: ParsedData,
  numericValue: number | null
): Promise<boolean> {
  // Check if this is an equipment type system with pattern matching
  let equipmentConfig: EquipmentConfig | null = null
  if (system.config) {
    try {
      const parsed = JSON.parse(system.config)
      if (parsed.normalPatterns || parsed.criticalPatterns) {
        equipmentConfig = parsed as EquipmentConfig
      }
    } catch {
      // Invalid JSON, ignore
    }
  }

  if (equipmentConfig) {
    // Equipment type: use pattern matching
    let newStatus = calculateEquipmentStatus(data.value, equipmentConfig)

    // Critical threshold: require CRITICAL_THRESHOLD consecutive critical signals
    if (newStatus === 'critical') {
      const count = Math.min((criticalCounters.get(system.id) ?? 0) + 1, CRITICAL_THRESHOLD)
      criticalCounters.set(system.id, count)
      if (count < CRITICAL_THRESHOLD) {
        console.log(`[db-updater] ${system.name}: critical count ${count}/${CRITICAL_THRESHOLD}`)
        newStatus = null // suppress until threshold reached
      } else {
        console.log(`[db-updater] ${system.name}: critical threshold reached (${count}/${CRITICAL_THRESHOLD})`)
      }
    } else if (newStatus !== null) {
      // Non-critical matched status → decrement counter symmetrically
      const prev = criticalCounters.get(system.id) ?? 0
      if (prev > 0) {
        const count = prev - 1
        if (count > 0) {
          criticalCounters.set(system.id, count)
          console.log(`[db-updater] ${system.name}: critical counter decrement ${prev}→${count}/${CRITICAL_THRESHOLD}`)
          newStatus = null // suppress normal until counter reaches 0
        } else {
          criticalCounters.delete(system.id)
          console.log(`[db-updater] ${system.name}: critical counter cleared, allowing status change`)
        }
      }
    }
    // null (unmatched) → counter unchanged

    // null = unmatched message → ignore (lastDataAt still updated below)
    if (newStatus === null) {
      console.log(`[db-updater] ${system.name}: unmatched message ignored (${data.value})`)
    } else {
      // Get current status
      const currentSystem = await prisma.system.findUnique({
        where: { id: system.id },
        select: { status: true },
      })

      // Update status if changed
      if (currentSystem && currentSystem.status !== newStatus) {
        await prisma.system.update({
          where: { id: system.id },
          data: { status: newStatus },
        })
        broadcastSystemStatus(system.id, system.name, newStatus)
        console.log(`[db-updater] ${system.name} status: ${currentSystem.status} → ${newStatus}`)

        // Resolve alarms when system returns to normal
        if (newStatus === 'normal' && currentSystem.status !== 'normal') {
          const resolvedCount = await prisma.alarm.updateMany({
            where: {
              systemId: system.id,
              resolvedAt: null,
            },
            data: { resolvedAt: new Date() },
          })

          if (resolvedCount.count > 0) {
            console.log(`[db-updater] Resolved ${resolvedCount.count} alarm(s) for ${system.name}`)
            broadcastAlarmResolution(system.id, system.name)
          }

          // Sync siren state after alarm resolution
          await syncSirenState()
        }

        // Create alarm when status changes to warning or critical
        if (newStatus === 'warning' || newStatus === 'critical') {
          const severity = newStatus === 'critical' ? 'critical' : 'warning'
          const statusLabel = newStatus === 'critical' ? '심각' : '주의'

          const alarm = await prisma.alarm.create({
            data: {
              systemId: system.id,
              severity,
              message: `${system.name} ${statusLabel} 상태 (${data.value})`,
            },
          })

          // Log the alarm
          await prisma.alarmLog.create({
            data: {
              systemId: system.id,
              systemName: system.name,
              severity,
              message: `${system.name} ${statusLabel} 상태 (${data.value})`,
            },
          })

          // Broadcast alarm via WebSocket
          broadcastAlarm(
            system.id,
            system.name,
            alarm.id,
            severity,
            `${system.name} ${statusLabel} 상태 (${data.value})`
          )

          console.log(`[db-updater] Alarm created for ${system.name}: ${statusLabel}`)

          // Sync siren state after alarm creation
          await syncSirenState()
        }
      }
    }
    return true
  }

  // UPS/Sensor type: check for condition-based config
  let metricsConfig: MetricsConfig | null = null
  if (system.config) {
    try {
      const parsed = JSON.parse(system.config)
      if (parsed.delimiter && parsed.displayItems) {
        metricsConfig = parsed as MetricsConfig
      }
    } catch {
      // Invalid JSON
    }
  }

  if (metricsConfig) {
    // Two-phase processing to handle sensors that send separate messages
    // (e.g. 온습도 sends "td43.0" then "hd55.0" as individual messages).
    // Phase 1 updates only the matched metric values in DB.
    // Phase 2 evaluates system status from ALL metrics (fresh + DB-loaded),
    // preventing a normal humidity message from overriding a critical temp alarm.

    const rawParts = data.value.split(metricsConfig.delimiter).map(s => s.trim())
    let anyProcessed = false
    const processedMetricNames = new Set<string>()

    // === Phase 1: Update matched metric values only ===
    for (const displayItem of metricsConfig.displayItems) {
      // Check data match conditions (skip if raw data doesn't match)
      if (!matchesDataConditions(data.value, displayItem.dataMatchConditions)) continue

      // When dataMatchConditions are used, the entire message may be for this metric
      // (e.g. "hd55.0" arrives as a separate message, so index 1 won't exist).
      // Fall back to the full raw data string for numeric extraction.
      const rawVal = rawParts[displayItem.index] ?? (displayItem.dataMatchConditions?.length ? data.value : undefined)
      if (rawVal === undefined) continue
      // Extract numeric value from raw part (handles prefixed data like "td25.5")
      const numMatch = rawVal.match(/-?\d+\.?\d*/)
      if (!numMatch) continue
      const val = parseFloat(numMatch[0])
      if (isNaN(val)) continue

      anyProcessed = true
      processedMetricNames.add(displayItem.name)

      // Find matching metric in DB
      const metric = system.metrics.find(m => m.name === displayItem.name)
      if (!metric) continue

      const oldValue = metric.value
      const trend = val > oldValue ? 'up' : val < oldValue ? 'down' : 'stable'

      await prisma.metric.update({
        where: { id: metric.id },
        data: { value: val, trend, updatedAt: new Date() },
      })

      // Keep local copy in sync so Phase 2 sees fresh values
      metric.value = val

      // Record metric history for charts
      await prisma.metricHistory.create({
        data: { metricId: metric.id, value: val },
      })

      broadcastMetric(system.id, system.name, metric.id, metric.name, val, metric.unit, trend)
    }

    // === Phase 2: Per-metric counter + derive system status ===
    // Wrapped in per-system mutex to prevent async interleaving when
    // separate UDP messages (e.g. temperature + humidity) arrive concurrently.
    if (anyProcessed) {
      await withSystemMutex(system.id, async () => {
        // Loop 1: Apply per-metric critical counter for processed metrics only
        for (const displayItem of metricsConfig!.displayItems) {
          if (!processedMetricNames.has(displayItem.name)) continue
          const metric = system.metrics.find(m => m.name === displayItem.name)
          if (!metric) continue
          const val = metric.value
          const counterKey = `${system.id}:${displayItem.name}`

          // Evaluate this metric's raw status
          let itemStatus: SystemStatus = 'normal'
          if (displayItem.conditions) {
            itemStatus = evaluateSensorStatus(val, displayItem.conditions)
          } else {
            if (displayItem.critical !== null && val >= displayItem.critical) itemStatus = 'critical'
            else if (displayItem.warning !== null && val >= displayItem.warning) itemStatus = 'warning'
          }

          // Per-metric critical counter
          if (itemStatus === 'critical') {
            const count = Math.min((criticalCounters.get(counterKey) ?? 0) + 1, CRITICAL_THRESHOLD)
            criticalCounters.set(counterKey, count)
            if (count >= CRITICAL_THRESHOLD) {
              metricCriticalState.set(counterKey, true)
            }
            console.log(`[db-updater] ${system.name}:${displayItem.name} critical count ${count}/${CRITICAL_THRESHOLD}`)
          } else {
            const prev = criticalCounters.get(counterKey) ?? 0
            if (prev > 0) {
              criticalCounters.delete(counterKey)
              metricCriticalState.delete(counterKey)
              console.log(`[db-updater] ${system.name}:${displayItem.name} non-critical, counter reset (was ${prev})`)
            }
          }
        }

        // Loop 2: Derive system status from ALL metrics' confirmed states
        let worstStatus: SystemStatus = 'normal'
        let coldTriggered = false
        let dryTriggered = false
        let humidTriggered = false
        let hotTriggered = false

        for (const displayItem of metricsConfig!.displayItems) {
          const counterKey = `${system.id}:${displayItem.name}`
          const metric = system.metrics.find(m => m.name === displayItem.name)
          if (!metric) continue

          if (metricCriticalState.get(counterKey)) {
            worstStatus = 'critical'
            // Determine trigger type for alarm message
            if (displayItem.conditions) {
              if (isColdCritical(metric.value, displayItem.conditions)) coldTriggered = true
              else if (isDryCritical(metric.value, displayItem.conditions)) dryTriggered = true
              else if (isHumidCritical(metric.value, displayItem.conditions)) humidTriggered = true
              else hotTriggered = true
            } else {
              if (displayItem.name.includes('온도')) hotTriggered = true
              else if (displayItem.name.includes('습도')) humidTriggered = true
            }
          } else {
            // Check warning status (no counter needed for warning)
            if (!displayItem.conditions) {
              if (displayItem.warning !== null && metric.value >= displayItem.warning && worstStatus !== 'critical') {
                worstStatus = 'warning'
              }
            }
          }
        }

        await updateSensorSystemStatus(system.id, system.name, worstStatus, coldTriggered, dryTriggered, humidTriggered, hotTriggered)
      })
    }
    return anyProcessed
  }

  if (numericValue !== null && system.metrics.length > 0) {
    // Legacy UPS mode: single numeric threshold
    const metric = system.metrics[0]
    const oldValue = metric.value
    const trend = numericValue > oldValue ? 'up' : numericValue < oldValue ? 'down' : 'stable'

    await prisma.metric.update({
      where: { id: metric.id },
      data: {
        value: numericValue,
        trend,
        updatedAt: new Date(),
      },
    })

    // Record metric history for charts
    await prisma.metricHistory.create({
      data: { metricId: metric.id, value: numericValue },
    })

    broadcastMetric(
      system.id,
      system.name,
      metric.id,
      metric.name,
      numericValue,
      metric.unit,
      trend
    )

    // Check thresholds and update system status
    await updateSystemStatus(system.id, system.name, numericValue, metric)
    return true
  }

  return false
}

/**
 * Update metric in database based on incoming data.
 * Finds all systems registered on the given port/protocol and processes each.
 */
export async function updateMetric(config: PortConfig, data: ParsedData, port: number, protocol: 'udp' | 'tcp'): Promise<void> {
  try {
    // Find all systems registered on this port/protocol
    const systems = await prisma.system.findMany({
      where: {
        port,
        protocol,
        isEnabled: true,
        isActive: true,
      },
      include: { metrics: true },
    })

    if (systems.length === 0) {
      console.log(`[db-updater] No systems found for port ${port}/${protocol}`)
      return
    }

    const numericValue = extractNumericValue(data)

    for (const system of systems) {
      const processed = await processSystemMetric(system, data, numericValue)

      // Update system's lastDataAt and updatedAt timestamps
      // For equipment: always update (even unmatched messages count for offline detection)
      // For sensor/ups: only update if data was actually processed
      let equipmentConfig: EquipmentConfig | null = null
      if (system.config) {
        try {
          const parsed = JSON.parse(system.config)
          if (parsed.normalPatterns || parsed.criticalPatterns) {
            equipmentConfig = parsed as EquipmentConfig
          }
        } catch { /* ignore */ }
      }

      if (equipmentConfig || processed) {
        await prisma.system.update({
          where: { id: system.id },
          data: {
            lastDataAt: new Date(),
            updatedAt: new Date(),
          },
        })
      }

      if (processed) {
        console.log(`[db-updater] Updated ${system.name}: ${data.value}`)
      }
    }
  } catch (error) {
    console.error(`[db-updater] Error updating port ${port}/${protocol}:`, error)
  }
}

/**
 * Update system status based on metric thresholds
 */
async function updateSystemStatus(
  systemId: string,
  systemName: string,
  value: number,
  metric: { warningThreshold: number | null; criticalThreshold: number | null }
): Promise<void> {
  let status: 'normal' | 'warning' | 'critical' = 'normal'

  if (metric.criticalThreshold !== null && value >= metric.criticalThreshold) {
    status = 'critical'
  } else if (metric.warningThreshold !== null && value >= metric.warningThreshold) {
    status = 'warning'
  }

  // Fetch current system status (used for both counter suppression and change detection)
  const currentSystem = await prisma.system.findUnique({
    where: { id: systemId },
    select: { status: true },
  })

  // Critical threshold: require CRITICAL_THRESHOLD consecutive critical signals
  if (status === 'critical') {
    const count = Math.min((criticalCounters.get(systemId) ?? 0) + 1, CRITICAL_THRESHOLD)
    criticalCounters.set(systemId, count)
    if (count < CRITICAL_THRESHOLD) {
      console.log(`[db-updater] ${systemName}: critical count ${count}/${CRITICAL_THRESHOLD}`)
      if (currentSystem) status = currentSystem.status as 'normal' | 'warning' | 'critical'
    } else {
      console.log(`[db-updater] ${systemName}: critical threshold reached (${count}/${CRITICAL_THRESHOLD})`)
    }
  } else {
    // Symmetric decrement: require CRITICAL_THRESHOLD consecutive non-critical to exit
    const prev = criticalCounters.get(systemId) ?? 0
    if (prev > 0) {
      const count = prev - 1
      if (count > 0) {
        criticalCounters.set(systemId, count)
        console.log(`[db-updater] ${systemName}: critical counter decrement ${prev}→${count}/${CRITICAL_THRESHOLD}`)
        if (currentSystem) status = currentSystem.status as 'normal' | 'warning' | 'critical'
      } else {
        criticalCounters.delete(systemId)
        console.log(`[db-updater] ${systemName}: critical counter cleared, allowing status change`)
      }
    }
  }

  await prisma.system.update({
    where: { id: systemId },
    data: { status },
  })

  // Broadcast status change if different
  if (currentSystem && currentSystem.status !== status) {
    broadcastSystemStatus(systemId, systemName, status)

    // Resolve alarms when system returns to normal
    if (status === 'normal' && currentSystem.status !== 'normal') {
      const resolvedCount = await prisma.alarm.updateMany({
        where: {
          systemId: systemId,
          resolvedAt: null,
        },
        data: { resolvedAt: new Date() },
      })

      if (resolvedCount.count > 0) {
        console.log(`[db-updater] Resolved ${resolvedCount.count} alarm(s) for ${systemName}`)
        broadcastAlarmResolution(systemId, systemName)
      }

      // Sync siren state after alarm resolution
      await syncSirenState()
    }

    // Create alarm when status changes to warning or critical
    if (status === 'warning' || status === 'critical') {
      const severity = status === 'critical' ? 'critical' : 'warning'
      const statusLabel = status === 'critical' ? '심각' : '주의'

      const alarm = await prisma.alarm.create({
        data: {
          systemId,
          severity,
          message: `${systemName} ${statusLabel} 상태`,
        },
      })

      await prisma.alarmLog.create({
        data: {
          systemId,
          systemName,
          severity,
          message: `${systemName} ${statusLabel} 상태`,
        },
      })

      broadcastAlarm(
        systemId,
        systemName,
        alarm.id,
        severity,
        `${systemName} ${statusLabel} 상태`
      )

      console.log(`[db-updater] Alarm created for ${systemName}: ${statusLabel}`)

      // Sync siren state after alarm creation
      await syncSirenState()
    }
  }
}

/**
 * Update system status for condition-based sensor systems
 */
async function updateSensorSystemStatus(
  systemId: string,
  systemName: string,
  status: SystemStatus,
  coldTriggered: boolean,
  dryTriggered: boolean,
  humidTriggered: boolean,
  hotTriggered: boolean
): Promise<void> {
  const currentSystem = await prisma.system.findUnique({
    where: { id: systemId },
    select: { status: true },
  })

  if (!currentSystem || currentSystem.status === status) {
    // Defensive: resolve stale alarms if system is normal but has unresolved alarms
    if (status === 'normal' && currentSystem) {
      const staleAlarms = await prisma.alarm.updateMany({
        where: { systemId, resolvedAt: null },
        data: { resolvedAt: new Date() },
      })
      if (staleAlarms.count > 0) {
        console.log(`[db-updater] Cleaned up ${staleAlarms.count} stale alarm(s) for ${systemName}`)
        broadcastAlarmResolution(systemId, systemName)
        await syncSirenState()
      }
    }
    return
  }

  await prisma.system.update({
    where: { id: systemId },
    data: { status },
  })

  broadcastSystemStatus(systemId, systemName, status)

  // Resolve alarms when system returns to normal
  if (status === 'normal' && currentSystem.status !== 'normal') {
    const resolvedCount = await prisma.alarm.updateMany({
      where: { systemId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    })

    if (resolvedCount.count > 0) {
      console.log(`[db-updater] Resolved ${resolvedCount.count} alarm(s) for ${systemName}`)
      broadcastAlarmResolution(systemId, systemName)
    }

    await syncSirenState()
  }

  // Create alarm when status changes to warning or critical
  if (status === 'warning' || status === 'critical') {
    const severity = status === 'critical' ? 'critical' : 'warning'
    const statusLabel = hotTriggered ? '고온 경고'
      : coldTriggered ? '저온 경고'
      : dryTriggered ? '건조 경고'
      : humidTriggered ? '다습 경고'
      : status === 'critical' ? '심각' : '주의'

    const alarm = await prisma.alarm.create({
      data: {
        systemId,
        severity,
        message: `${systemName} ${statusLabel} 상태`,
      },
    })

    await prisma.alarmLog.create({
      data: {
        systemId,
        systemName,
        severity,
        message: `${systemName} ${statusLabel} 상태`,
      },
    })

    broadcastAlarm(systemId, systemName, alarm.id, severity, `${systemName} ${statusLabel} 상태`)
    console.log(`[db-updater] Alarm created for ${systemName}: ${statusLabel}`)

    await syncSirenState()
  }
}

/**
 * Process alarm data and create alarm records if needed
 */
export async function processAlarm(config: PortConfig, data: ParsedData): Promise<void> {
  try {
    const system = await prisma.system.findFirst({
      where: {
        OR: [
          { name: { contains: config.system } },
          { name: config.system },
        ],
      },
    })

    if (!system) {
      console.log(`[db-updater] Alarm system not found: ${config.system}`)
      return
    }

    // Parse alarm data (implementation depends on actual alarm format)
    const alarmValue = data.value.trim()

    if (alarmValue && alarmValue !== '0' && alarmValue.toLowerCase() !== 'ok') {
      // Create new alarm
      const alarm = await prisma.alarm.create({
        data: {
          systemId: system.id,
          severity: 'warning',
          message: `Alarm triggered: ${alarmValue}`,
        },
      })

      // Log the alarm
      await prisma.alarmLog.create({
        data: {
          systemId: system.id,
          systemName: system.name,
          severity: 'warning',
          message: `Alarm triggered: ${alarmValue}`,
        },
      })

      // Update system status
      await prisma.system.update({
        where: { id: system.id },
        data: { status: 'warning' },
      })

      // Broadcast alarm via WebSocket
      broadcastAlarm(
        system.id,
        system.name,
        alarm.id,
        'warning',
        `Alarm triggered: ${alarmValue}`
      )

      // Broadcast status change
      broadcastSystemStatus(system.id, system.name, 'warning')

      console.log(`[db-updater] Alarm created for ${config.system}: ${alarmValue}`)
    }
  } catch (error) {
    console.error(`[db-updater] Error processing alarm for ${config.system}:`, error)
  }
}

/**
 * Start the offline detection check interval
 */
export function startOfflineDetection(): void {
  if (offlineCheckInterval) return

  console.log('[db-updater] Starting offline detection (30s threshold)')

  offlineCheckInterval = setInterval(async () => {
    try {
      const systems = await prisma.system.findMany({
        where: {
          isEnabled: true,
          isActive: true,
          status: { not: 'offline' },
        },
      })

      const now = Date.now()

      for (const system of systems) {
        const lastData = system.lastDataAt?.getTime() ?? 0
        const timeSinceLastData = now - lastData

        if (timeSinceLastData > OFFLINE_THRESHOLD) {
          console.log(`[db-updater] System "${system.name}" offline (${Math.round(timeSinceLastData / 1000)}s since last data)`)

          // Update status to offline
          await prisma.system.update({
            where: { id: system.id },
            data: { status: 'offline' },
          })

          // Create offline alarm
          const alarm = await prisma.alarm.create({
            data: {
              systemId: system.id,
              severity: 'warning',
              message: `${system.name} 오프라인 (30초 이상 데이터 없음)`,
            },
          })

          // Log the alarm
          await prisma.alarmLog.create({
            data: {
              systemId: system.id,
              systemName: system.name,
              severity: 'warning',
              message: `${system.name} 오프라인 (30초 이상 데이터 없음)`,
            },
          })

          // Broadcast status change and alarm
          broadcastSystemStatus(system.id, system.name, 'offline')
          broadcastAlarm(
            system.id,
            system.name,
            alarm.id,
            'warning',
            `${system.name} 오프라인 (30초 이상 데이터 없음)`
          )
        }
      }
    } catch (error) {
      console.error('[db-updater] Offline detection error:', error)
    }
  }, OFFLINE_CHECK_INTERVAL)
}

/**
 * Stop the offline detection check interval
 */
export function stopOfflineDetection(): void {
  if (offlineCheckInterval) {
    clearInterval(offlineCheckInterval)
    offlineCheckInterval = null
    console.log('[db-updater] Offline detection stopped')
  }
}

/**
 * Start periodic cleanup of old metric history (keeps 25 hours, runs every hour)
 */
export function startHistoryCleanup(): void {
  if (historyCleanupInterval) return

  console.log('[db-updater] Starting metric history cleanup (25h retention)')

  // Run cleanup immediately on start
  cleanOldHistory()

  historyCleanupInterval = setInterval(cleanOldHistory, 60 * 60 * 1000) // 1 hour
}

async function cleanOldHistory(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
    const result = await prisma.metricHistory.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    })
    if (result.count > 0) {
      console.log(`[db-updater] Cleaned ${result.count} old metric history records`)
    }
  } catch (error) {
    console.error('[db-updater] History cleanup error:', error)
  }
}

/**
 * Stop the history cleanup interval
 */
export function stopHistoryCleanup(): void {
  if (historyCleanupInterval) {
    clearInterval(historyCleanupInterval)
    historyCleanupInterval = null
    console.log('[db-updater] History cleanup stopped')
  }
}

/**
 * Graceful shutdown - close database connection
 */
export async function closeDatabase(): Promise<void> {
  stopOfflineDetection()
  stopHistoryCleanup()
  await prisma.$disconnect()
}
