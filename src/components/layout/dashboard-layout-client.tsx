'use client'

import { useState, useEffect, useCallback } from 'react'
import { RealtimeProvider } from '@/components/realtime/realtime-provider'
import { AudioAlertManager } from '@/components/realtime/audio-alert-manager'
import { HeaderWithStatus } from './header-with-status'
import { Sidebar } from './sidebar'
import type { PrismaSystem, PrismaAlarm } from '@/types'

interface DashboardLayoutClientProps {
  children: React.ReactNode
  initialSystems: PrismaSystem[]
  initialAlarms: PrismaAlarm[]
}

export function DashboardLayoutClient({
  children,
  initialSystems,
  initialAlarms,
}: DashboardLayoutClientProps) {
  const [audioMuted, setAudioMuted] = useState(false)

  // Fetch initial mute state from settings
  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((settings) => {
        const enabled = settings.audioEnabled !== 'false'
        if (!enabled) {
          const muteEndTime = settings.muteEndTime ? parseInt(settings.muteEndTime) : 0
          if (!muteEndTime || muteEndTime > Date.now()) {
            setAudioMuted(true)
          }
        }
      })
      .catch(() => {})
  }, [])

  const handleMuteChange = useCallback((muted: boolean) => {
    setAudioMuted(muted)
  }, [])

  return (
    <RealtimeProvider initialSystems={initialSystems} initialAlarms={initialAlarms}>
      <AudioAlertManager audioMuted={audioMuted} />
      <div className="flex h-screen flex-col">
        <HeaderWithStatus audioMuted={audioMuted} onMuteChange={handleMuteChange} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="relative flex-1 overflow-y-auto p-4">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  )
}
