# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

통합알람감시체계 (Unified Alarm Monitoring System) - A real-time monitoring dashboard for radar and transmission facilities. Built with Next.js 16 (App Router), TypeScript, SQLite/Prisma, shadcn/ui, Recharts, and WebSocket for real-time updates.

Supports three system types:
- **Equipment** (`equipment`): Radar, FMS, LCMS, VDL, MARC, 전송로 — pattern-based status detection
- **UPS** (`ups`): UPS units — delimiter/custom-code parsing with multi-metric monitoring (voltage, current, frequency, battery, load)
- **Sensor** (`sensor`): 온습도 — condition-based thresholds with per-item audio alerts and spike filtering

**Ports:** Dashboard on 7777, WebSocket on 7778

## Essential Commands

```bash
# Build and run (ALWAYS use production build)
kill -9 $(ss -tlnp | grep 7777 | grep -oP 'pid=\K\d+') 2>/dev/null || true
rm -rf .next && npm run build
npm start &

# Database
npx tsx prisma/seed.ts           # Seed database
npx prisma migrate reset --force # Reset and reseed

# Worker (data collector)
npm run worker                   # Production
npm run worker:dev               # Development with watch
npm run start:all                # Dashboard + Worker together
```

**After code changes:** ALWAYS kill the running process and do a clean rebuild:
```bash
kill -9 $(ss -tlnp | grep 7777 | grep -oP 'pid=\K\d+') 2>/dev/null || true
rm -rf .next && npm run build
npm start &
```
Tell users to hard-refresh browser (Ctrl+Shift+R) to avoid stale JS chunk errors.

## Architecture

```
UDP/TCP Data → Worker Process (src/worker/)
                    ├── Parses data (pattern/delimiter/custom code)
                    ├── Spike filter (sensor, MAD-based)
                    ├── Threshold evaluation (conditions/patterns)
                    ├── Updates SQLite via Prisma
                    ├── Triggers alarms & siren state sync
                    └── Broadcasts via WebSocket (port 7778)
                              ↓
                    RealtimeProvider (React Context)
                              ↓
                    Dashboard Components (instant re-render)
                              ↓
                    AudioAlertManager (state-based browser audio)
```

**Worker startup sequence** (`src/worker/index.ts`):
1. Start UDP/TCP listeners
2. Start WebSocket server (port 7778)
3. Start offline detection (10s interval, 30s timeout)
4. Start history cleanup (25h retention, hourly)
5. Sync siren state (activate if unresolved critical alarms exist)
6. Sync offline alarms (create alarms for already-offline systems)

**Graceful shutdown:** Resets sirens → stops listeners → stops WebSocket → closes DB

**Key data flow:**
- Worker listens on UDP/TCP ports defined in `src/worker/config.ts`
- Parses incoming data: 20-byte buffers (equipment), delimiter-based (UPS/sensor), or custom JS code
- Evaluates thresholds, creates/resolves alarms, updates database
- Broadcasts changes via WebSocket to all connected frontends
- Frontend receives updates through `RealtimeProvider` context

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Dashboard pages
│   │   ├── alarms/               # Alarm log with filtering
│   │   ├── settings/             # Feature toggles, audio, sirens
│   │   ├── systems/              # Equipment CRUD & detail
│   │   │   ├── [id]/             # System detail/edit
│   │   │   └── new/              # Create system
│   │   └── ups/                  # UPS CRUD & detail
│   │       ├── [id]/             # UPS detail/edit
│   │       └── new/              # Create UPS
│   └── api/                      # API routes
│       ├── settings/             # GET/PUT settings
│       ├── systems/              # CRUD systems
│       │   ├── [id]/             # System by ID
│       │   └── test-code/        # Custom code testing endpoint
│       └── ...
├── components/
│   ├── alarms/                   # Alarm display & filtering
│   ├── cards/                    # Dashboard cards (alarm, health-check)
│   ├── charts/                   # Recharts line chart wrapper
│   ├── forms/                    # System/UPS/sensor config forms
│   ├── layout/                   # Sidebar, header, dashboard layout
│   ├── realtime/                 # Real-time components
│   │   ├── audio-alert-manager   # State-based browser audio alerts
│   │   ├── realtime-dashboard    # Equipment status grid
│   │   ├── realtime-provider     # WebSocket context provider
│   │   ├── realtime-temperature  # Sensor monitoring panel
│   │   ├── realtime-ups          # UPS monitoring with 6-chart grid
│   │   ├── sensor-alarm-effects  # Sensor alarm visual effects
│   │   └── temperature-history   # Sensor chart history
│   ├── settings/                 # Feature toggle card
│   └── ui/                       # shadcn/ui primitives
├── hooks/
│   └── useCompactScreen.ts       # Viewport height detection
├── lib/
│   ├── chart-utils.ts            # Forward-fill, gap markers for time-series
│   ├── custom-code-executor.ts   # API-side custom code testing (vm.Script)
│   ├── system-display-utils.ts   # Status badge colors/labels
│   ├── threshold-evaluator.ts    # Condition-based threshold logic
│   └── ws-notify.ts              # Client-side WebSocket helpers
├── types/
│   └── index.ts                  # All TypeScript types & interfaces
└── worker/
    ├── config.ts                 # UDP/TCP port configurations
    ├── custom-code-executor.ts   # Worker-side custom code (vm.Script with caching)
    ├── db-updater.ts             # Data processing, spike filter, alarm logic
    ├── index.ts                  # Worker entry point
    ├── siren-trigger.ts          # Physical siren TCP/UDP control (state-based)
    ├── tcp-listener.ts           # TCP data listeners
    ├── udp-listener.ts           # UDP data listeners
    └── websocket-server.ts       # WebSocket broadcast server
```

## Code Style

- Korean for UI labels and domain-specific terms
- English for code identifiers and comments
- TypeScript strict mode
- Components in PascalCase, utilities in camelCase

## Design Constraints

- **Target resolution:** 1920x1080
- **NO SCROLLING** - all pages must fit within viewport
- **Dark mode only**
- Status colors: 🟢 `#22c55e` (normal) | 🟡 `#eab308` (warning) | 🔴 `#ef4444` (critical) | ⚫ `#71717a` (offline)

## Database Schema (Prisma)

Core models: `System`, `Metric`, `MetricHistory`, `Alarm`, `AlarmLog`, `Setting`, `Siren`

**System** — monitored equipment/UPS/sensor
- `type`: `'equipment' | 'ups' | 'sensor'`
- `status`: `'normal' | 'warning' | 'critical' | 'offline'`
- `isEnabled`: user toggle for enable/disable
- `config`: JSON — `EquipmentConfig` or `MetricsConfig` (see types)
- `audioConfig`: JSON — `{ type: 'file'|'none', fileName? }`
- `port`/`protocol`: UDP/TCP listener config

**Metric** → System (cascade delete), has MetricHistory
**MetricHistory** — time-series data (indexed on metricId+recordedAt, 25h retention)
**Alarm** → System (cascade delete) — active alarms with acknowledgement tracking
**AlarmLog** — permanent alarm history
**Setting** — key-value config store (audio, feature toggles, mute timers)
**Siren** — physical siren devices (ip, port, protocol, messageOn/Off, location)

## Type System (src/types/index.ts)

**Config types:**
- `EquipmentConfig`: `{ normalPatterns, criticalPatterns, matchMode: 'exact' }`
- `MetricsConfig`: `{ delimiter, displayItems, customCode? }`
- `DisplayItem`: per-metric config with `chartGroup`, `conditions`, `audioConfig`, `dataMatchConditions`

**Threshold conditions** (sensor):
- Operators: `between | gte | lte | eq | neq`
- Status categories: `normal | critical | coldCritical | dryCritical | humidCritical`
- Priority: critical variants > normal; OR logic within same status

**Data match conditions** (sensor): `contains | startsWith | endsWith | equals | regex`

## WebSocket Message Types

```typescript
type: 'metric' | 'alarm' | 'alarm-resolved' | 'system' | 'init' | 'ping' | 'delete' | 'raw' | 'siren-sync' | 'settings'
```

- `metric`: Real-time metric value update
- `alarm` / `alarm-resolved`: Alarm lifecycle (supports bulk with `alarmIds[]`)
- `system`: System status change
- `raw`: Raw data preview for configuration UI
- `siren-sync`: Trigger worker to re-evaluate siren state
- `settings`: Audio/feature toggle sync across browser tabs
- `delete`: System deletion notification

## Key Subsystems

### Siren System (state-based)
- `syncSirenState()` checks DB for unresolved+unacknowledged critical alarms → activates/deactivates sirens
- Called at: worker startup, alarm creation, alarm resolution, acknowledgement, mute toggle
- `activateSirens()` / `deactivateSirens()` are pure TCP/UDP senders
- Respects `audioEnabled` and `muteEndTime` settings

### Audio Alert Manager (browser-side)
- State-based: plays while unresolved+unacknowledged critical alarms exist for the system
- Per-item audio for sensor/UPS (checks current metric values against thresholds)
- System-level fallback audio for UPS
- Loop playback until alarm resolved or acknowledged

### Custom Code Executor
- Users write JS parsers for non-standard data formats (e.g., apcupsd multi-line output)
- Sandboxed via `vm.Script` with 500ms timeout
- Per-system script caching (auto-invalidates on code change)
- Test endpoint: `POST /api/systems/test-code`

### Spike Filter (sensor only)
- Modified Z-score using Median Absolute Deviation (MAD)
- Buffer: 20 values, warmup: 5 values, Z-threshold: 3.5
- Fallback: range-based detection (30% of min-max) when MAD ≈ 0

### Feature Toggles
- `temperatureEnabled`, `upsEnabled`, `gateEnabled`
- Stored in Setting table, synced via WebSocket

## Monitored Systems

1레이더, 2레이더, UPS (관제송신/1레이더/2레이더), FMS, LCMS, VDL, MARC, 온습도, 전송로

## Reference

Original Node-RED flows: `/mnt/dietpi_userdata/node-red/flows.json`
