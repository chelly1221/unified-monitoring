'use client'

import {
  LayoutDashboard,
  AlertTriangle,
  Thermometer,
  ChevronLeft,
  ChevronRight,
  BatteryCharging
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRealtime } from '@/components/realtime/realtime-provider'

const navItems = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/temperature', label: '온습도', icon: Thermometer },
  { href: '/ups', label: 'UPS', icon: BatteryCharging },
  { href: '/alarms', label: '알람 로그', icon: AlertTriangle },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(true)
  const { alarms } = useRealtime()
  const alarmCount = alarms.filter(a => !a.acknowledged && !a.resolvedAt).length

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-48'
      )}
    >
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

          const showBadge = item.href === '/alarms' && alarmCount > 0

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors relative',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <div className="relative shrink-0">
                <Icon className="h-5 w-5" />
                {showBadge && collapsed && (
                  <Badge
                    variant="destructive"
                    className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full p-0 text-[10px]"
                  >
                    {alarmCount > 9 ? '9+' : alarmCount}
                  </Badge>
                )}
              </div>
              {!collapsed && (
                <>
                  <span>{item.label}</span>
                  {showBadge && (
                    <Badge variant="destructive" className="ml-auto text-xs">
                      {alarmCount > 99 ? '99+' : alarmCount}
                    </Badge>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  )
}
