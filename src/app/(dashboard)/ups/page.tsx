import { prisma } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CircularGauge } from '@/components/gauges/circular-gauge'
import { MetricDisplay } from '@/components/cards/metric-display'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import type { SystemStatus, TrendDirection } from '@/types'

export const dynamic = 'force-dynamic'

async function getUpsSystems() {
  return prisma.system.findMany({
    where: {
      type: 'ups',
      isActive: true,
    },
    include: {
      metrics: true,
    },
    orderBy: { name: 'asc' },
  })
}

function getStatusColor(status: SystemStatus): string {
  switch (status) {
    case 'normal':
      return 'bg-[#4ade80]'
    case 'warning':
      return 'bg-[#facc15]'
    case 'critical':
      return 'bg-[#f87171]'
    case 'offline':
    default:
      return 'bg-[#a1a1aa]'
  }
}

function getStatusLabel(status: SystemStatus): string {
  switch (status) {
    case 'normal':
      return '정상'
    case 'warning':
      return '주의'
    case 'critical':
      return '경고'
    case 'offline':
    default:
      return '오프라인'
  }
}

function getStatusBadgeClass(status: SystemStatus): string {
  switch (status) {
    case 'normal':
      return 'bg-[#4ade80] text-white hover:bg-[#4ade80]/90'
    case 'warning':
      return 'bg-[#facc15] text-black hover:bg-[#facc15]/90'
    case 'critical':
      return 'bg-[#f87171] text-white hover:bg-[#f87171]/90'
    case 'offline':
    default:
      return ''
  }
}

export default async function UpsPage() {
  const systems = await getUpsSystems()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">UPS</h1>
          <p className="text-sm text-muted-foreground">
            모든 UPS 시스템의 상태를 모니터링합니다.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/systems/new?type=ups">
            <Plus className="mr-1 h-4 w-4" />
            장비 추가
          </Link>
        </Button>
      </div>

      {systems.length === 0 ? (
        <Card>
          <CardContent className="flex h-40 items-center justify-center">
            <p className="text-muted-foreground">등록된 UPS 시스템이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {systems.map((system) => {
            const status = system.status as SystemStatus
            return (
              <Link key={system.id} href={`/systems/${system.id}`}>
                <Card className="transition-all hover:border-accent hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{system.name}</CardTitle>
                      <Badge className={getStatusBadgeClass(status)}>
                        {getStatusLabel(status)}
                      </Badge>
                    </div>
                    {system.port && (
                      <p className="text-sm text-muted-foreground">
                        포트: {system.port} ({system.protocol?.toUpperCase()})
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    {system.metrics.length === 0 ? (
                      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                        메트릭 없음
                      </div>
                    ) : (
                      <div className="flex flex-wrap justify-center gap-4">
                        {system.metrics.slice(0, 3).map((metric) => (
                          <CircularGauge
                            key={metric.id}
                            value={metric.value}
                            min={metric.min ?? 0}
                            max={metric.max ?? 100}
                            unit={metric.unit}
                            label={metric.name}
                            warningThreshold={metric.warningThreshold}
                            criticalThreshold={metric.criticalThreshold}
                            trend={metric.trend as TrendDirection | null}
                            size="sm"
                          />
                        ))}
                      </div>
                    )}
                    {system.metrics.length > 3 && (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {system.metrics.slice(3).map((metric) => (
                          <MetricDisplay
                            key={metric.id}
                            name={metric.name}
                            value={metric.value}
                            unit={metric.unit}
                            trend={metric.trend as TrendDirection | null}
                            warningThreshold={metric.warningThreshold}
                            criticalThreshold={metric.criticalThreshold}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
