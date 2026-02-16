'use client'

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface DataPoint {
  [key: string]: string | number | null | undefined
}

interface LineConfig {
  dataKey: string
  name: string
  color: string
}

interface LineChartProps {
  data: DataPoint[]
  lines: LineConfig[]
  height?: number | string
  showGrid?: boolean
  showLegend?: boolean
  yDomain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax']
  xDataKey?: string
  xAxisType?: 'category' | 'number'
  xAxisTickFormatter?: (value: number) => string
  connectNulls?: boolean
}

function findNearest(
  data: DataPoint[],
  idx: number,
  key: string,
  xKey: string,
  currentTs: number,
  maxGap: number
): number | null {
  let left = idx - 1
  let right = idx + 1
  let bestVal: number | null = null
  let bestDist = Infinity

  while (left >= 0 || right < data.length) {
    if (left >= 0) {
      const v = data[left][key]
      if (v != null) {
        const dist = Math.abs((data[left][xKey] as number) - currentTs)
        if (dist < bestDist && dist <= maxGap) {
          bestDist = dist
          bestVal = v as number
        }
        left = -1 // found on left, stop searching left
      } else {
        left--
      }
    }
    if (right < data.length) {
      const v = data[right][key]
      if (v != null) {
        const dist = Math.abs((data[right][xKey] as number) - currentTs)
        if (dist < bestDist && dist <= maxGap) {
          bestDist = dist
          bestVal = v as number
        }
        right = data.length // found on right, stop searching right
      } else {
        right++
      }
    }
    if (left < 0 && right >= data.length) break
  }

  return bestVal
}

function makeNearestTooltip(
  data: DataPoint[],
  lines: LineConfig[],
  xDataKey: string,
  labelFormatter?: (v: number) => string,
  maxGapMs = 300_000
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function NearestTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const currentTs = label as number
    const currentPoint = payload[0]?.payload
    if (!currentPoint) return null

    const idx = data.findIndex(d => d[xDataKey] === currentTs)

    return (
      <div style={{
        backgroundColor: '#1c1c1c',
        border: '1px solid #333333',
        borderRadius: '8px',
        padding: '4px 8px',
        fontSize: '12px',
      }}>
        <p style={{ color: '#fafafa', margin: '0 0 2px 0' }}>
          {labelFormatter ? labelFormatter(currentTs) : currentTs}
        </p>
        {lines.map(line => {
          const directValue = currentPoint[line.dataKey]
          if (directValue != null) {
            return (
              <p key={line.dataKey} style={{ color: line.color, margin: '1px 0' }}>
                {line.name}: {directValue}
              </p>
            )
          }
          if (idx < 0) return null
          const nearest = findNearest(data, idx, line.dataKey, xDataKey, currentTs, maxGapMs)
          if (nearest == null) return null
          return (
            <p key={line.dataKey} style={{ color: line.color, margin: '1px 0' }}>
              {line.name}: {nearest}
            </p>
          )
        })}
      </div>
    )
  }
}

export function LineChart({
  data,
  lines,
  height = 300,
  showGrid = true,
  showLegend = true,
  yDomain,
  xDataKey = 'time',
  xAxisType = 'category',
  xAxisTickFormatter,
  connectNulls = true,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height as number | `${number}%`}>
      <RechartsLineChart
        data={data}
        margin={{ top: 5, right: 30, left: 0, bottom: 0 }}
      >
        {showGrid && (
          <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
        )}
        <XAxis
          dataKey={xDataKey}
          type={xAxisType}
          stroke="#a1a1aa"
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
          tickFormatter={xAxisTickFormatter}
          domain={xAxisType === 'number' ? ['dataMin', 'dataMax'] : undefined}
        />
        <YAxis
          width={35}
          stroke="#a1a1aa"
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
          domain={yDomain}
          allowDataOverflow={false}
        />
        <Tooltip
          isAnimationActive={false}
          content={xAxisType === 'number'
            ? makeNearestTooltip(data, lines, xDataKey, xAxisTickFormatter)
            : undefined}
          contentStyle={xAxisType !== 'number' ? {
            backgroundColor: '#1c1c1c',
            border: '1px solid #333333',
            borderRadius: '8px',
            fontSize: '12px',
            padding: '4px 8px',
          } : undefined}
          labelStyle={xAxisType !== 'number' ? { color: '#fafafa', fontSize: '11px' } : undefined}
          itemStyle={xAxisType !== 'number' ? { color: '#a1a1aa', fontSize: '11px' } : undefined}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{ paddingTop: '4px' }}
            formatter={(value) => (
              <span style={{ color: '#a1a1aa' }}>{value}</span>
            )}
          />
        )}
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: line.color }}
            isAnimationActive={false}
            connectNulls={connectNulls}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
