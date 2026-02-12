import { prisma } from '@/lib/db'
import { AlarmsClient } from '@/components/alarms/alarms-client'

export const dynamic = 'force-dynamic'

async function getAlarms() {
  const [activeAlarms, acknowledgedAlarms] = await Promise.all([
    prisma.alarm.findMany({
      where: { acknowledged: false, resolvedAt: null },
      include: { system: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.alarm.findMany({
      where: { acknowledged: true },
      include: { system: true },
      orderBy: { acknowledgedAt: 'desc' },
      take: 50,
    }),
  ])
  return { activeAlarms, acknowledgedAlarms }
}

export default async function AlarmsPage() {
  const { activeAlarms, acknowledgedAlarms } = await getAlarms()

  return (
    <AlarmsClient
      initialActiveAlarms={activeAlarms}
      initialAcknowledgedAlarms={acknowledgedAlarms}
    />
  )
}
