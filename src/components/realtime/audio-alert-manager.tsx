'use client'

import { useEffect, useRef } from 'react'
import { useRealtime } from './realtime-provider'
import { evaluateSensorStatus } from '@/lib/threshold-evaluator'
import type { AudioConfig, MetricsConfig } from '@/types'

interface AudioAlertManagerProps {
  audioMuted?: boolean
}

export function AudioAlertManager({ audioMuted = false }: AudioAlertManagerProps) {
  const { alarms, systems, metrics } = useRealtime()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentFileRef = useRef<string | null>(null)

  useEffect(() => {
    // If muted, stop any playing audio immediately
    if (audioMuted) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
        currentFileRef.current = null
      }
      return
    }

    // Find active critical alarms: unresolved AND unacknowledged
    const activeCritical = alarms.filter(
      (a) => a.severity === 'critical' && !a.resolvedAt && !a.acknowledged
    )

    if (activeCritical.length > 0) {
      // Find the first alarm that has a valid audio file configured
      let targetFile: string | null = null
      for (const alarm of activeCritical) {
        const system = systems.find((s) => s.id === alarm.systemId)
        if (!system) continue

        // Sensor systems: use per-item audio based on current metric values
        if (system.type === 'sensor' && system.config) {
          try {
            const metricsConfig = JSON.parse(system.config) as MetricsConfig
            if (metricsConfig.displayItems) {
              for (const item of metricsConfig.displayItems) {
                if (!item.audioConfig || item.audioConfig.type !== 'file' || !item.audioConfig.fileName) continue
                if (!item.conditions) continue

                // Find matching metric for this display item
                const metric = metrics.find(
                  (m) => m.systemId === system.id && m.name === item.name
                )
                if (!metric) continue

                // Check if this specific metric is currently in critical state
                const status = evaluateSensorStatus(metric.value, item.conditions)
                if (status === 'critical') {
                  targetFile = item.audioConfig.fileName
                  break
                }
              }
            }
          } catch {
            // Invalid config, skip
          }
          if (targetFile) break
          continue
        }

        // Non-sensor systems: use system-level audioConfig
        if (!system.audioConfig) continue
        try {
          const config = JSON.parse(system.audioConfig) as AudioConfig
          if (config.type === 'file' && config.fileName) {
            targetFile = config.fileName
            break
          }
        } catch {
          continue
        }
      }

      if (targetFile) {
        // Already playing this file — do nothing
        if (currentFileRef.current === targetFile && audioRef.current && !audioRef.current.paused) {
          return
        }

        // Different file or not playing — stop current and start new
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ''
          audioRef.current = null
        }

        const audio = new Audio(`/api/audio/${targetFile}`)
        audio.loop = true
        audio.play().catch(() => {
          // Browser may block autoplay without user interaction — silently ignore
        })
        audioRef.current = audio
        currentFileRef.current = targetFile
      } else {
        // Active critical alarms exist but none have audio configured — stop if playing
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ''
          audioRef.current = null
          currentFileRef.current = null
        }
      }
    } else {
      // No active critical alarms — stop audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
        currentFileRef.current = null
      }
    }
  }, [alarms, systems, metrics, audioMuted])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])

  return null
}
