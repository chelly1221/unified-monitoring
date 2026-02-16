# 통합알람감시체계 (Unified Alarm Monitoring System)

Real-time monitoring dashboard for radar, transmission, and facility infrastructure. Monitors equipment status, UPS power systems, and environmental sensors with instant alerting via browser audio and physical sirens.

## Features

- **Real-time monitoring** — Live status updates via WebSocket with automatic reconnection
- **Three system types** — Equipment (pattern-based), UPS (multi-metric), Sensor (threshold-based)
- **Alarm management** — Automatic alarm creation/resolution, acknowledgement, severity levels, alarm history log
- **Audio alerts** — Browser-side audio playback for critical alarms with per-system/per-metric configuration
- **Physical siren control** — TCP/UDP siren activation for critical alarms (state-based, survives restarts)
- **Spike filtering** — MAD-based statistical outlier detection for sensor data
- **Custom code parsing** — Sandboxed JavaScript (vm.Script) for non-standard data formats
- **Feature toggles** — Enable/disable monitoring subsystems (temperature, UPS, gate) at runtime
- **Dark mode** — Optimized for 1920x1080 control room displays with no-scroll layout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript |
| Database | SQLite via Prisma ORM |
| UI | shadcn/ui, Radix UI, Tailwind CSS 4 |
| Charts | Recharts 3 |
| Real-time | WebSocket (ws) |
| Runtime | Node.js on DietPi Linux |

## Architecture

```
UDP/TCP Data → Worker Process (src/worker/)
                    ├── Parses data (pattern/delimiter/custom code)
                    ├── Spike filter (sensor, MAD-based)
                    ├── Threshold evaluation (conditions/patterns)
                    ├── Updates SQLite via Prisma
                    ├── Triggers alarms & siren state sync
                    └── Broadcasts via WebSocket (:7778)
                              ↓
                    RealtimeProvider (React Context)
                              ↓
                    Dashboard Components (instant re-render)
                              ↓
                    AudioAlertManager (state-based browser audio)
```

The system runs as two processes:
- **Dashboard** (port 7777) — Next.js web application serving the monitoring UI
- **Worker** (port 7778) — Data collector that listens on UDP/TCP ports, processes incoming data, manages alarms, and broadcasts updates

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
git clone <repository-url>
cd alarm
npm install
```

### Database Setup

```bash
npx prisma migrate deploy    # Apply migrations
npx tsx prisma/seed.ts        # Seed with default systems
```

### Development

```bash
npm run dev           # Dashboard (port 7777)
npm run worker:dev    # Worker with watch mode (separate terminal)
# or
npm run start:all     # Both together
```

### Production Build

```bash
rm -rf .next && npm run build
npm start &           # Dashboard
npm run worker &      # Worker
```

## Production Deployment (systemd)

Service files are provided in `systemd/` for running as system services:

```bash
# Copy service files
sudo cp systemd/alarm-dashboard.service /etc/systemd/system/
sudo cp systemd/alarm-worker.service /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable alarm-dashboard alarm-worker
sudo systemctl start alarm-dashboard alarm-worker

# Check status
sudo systemctl status alarm-dashboard alarm-worker
```

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Dashboard pages
│   │   ├── alarms/               # Alarm log with filtering
│   │   ├── settings/             # Feature toggles, audio, sirens
│   │   ├── systems/              # Equipment CRUD & detail
│   │   ├── ups/                  # UPS CRUD & detail
│   │   └── temperature/          # Sensor monitoring
│   └── api/                      # REST API routes
├── components/
│   ├── realtime/                 # WebSocket-driven live components
│   ├── forms/                    # System configuration forms
│   ├── alarms/                   # Alarm display & filtering
│   ├── charts/                   # Time-series chart wrappers
│   ├── layout/                   # Sidebar, header, dashboard layout
│   └── ui/                       # shadcn/ui primitives
├── hooks/                        # React hooks (WebSocket, viewport)
├── lib/                          # Shared utilities
├── types/                        # TypeScript interfaces
└── worker/                       # Data collector process
    ├── config.ts                 # UDP/TCP port configurations
    ├── db-updater.ts             # Data processing, alarms, spike filter
    ├── index.ts                  # Worker entry point
    ├── siren-trigger.ts          # Physical siren control (state-based)
    ├── tcp-listener.ts           # TCP data listeners with auto-restart
    ├── udp-listener.ts           # UDP data listeners with auto-restart
    └── websocket-server.ts       # WebSocket broadcast server
```

## Monitored Systems

| System | Type | Protocol | Description |
|--------|------|----------|-------------|
| 1레이더, 2레이더 | Equipment | UDP | Radar systems |
| FMS, LCMS | Equipment | UDP | Flight management / monitoring |
| VDL | Equipment | TCP | VHF Data Link |
| MARC | Equipment | UDP | MARC system |
| 전송로 | Equipment | UDP | Transmission line |
| UPS (관제송신/1레이더/2레이더) | UPS | UDP | Uninterruptible power supplies |
| 온습도 | Sensor | UDP | Temperature & humidity |

## API Routes

| Endpoint | Description |
|----------|-------------|
| `GET/POST /api/systems` | List/create systems |
| `GET/PUT/DELETE /api/systems/[id]` | System CRUD |
| `POST /api/systems/test-code` | Test custom parser code |
| `GET /api/alarms` | List active alarms |
| `POST /api/alarms/[id]/acknowledge` | Acknowledge alarm |
| `POST /api/alarms/acknowledge-all` | Acknowledge all alarms |
| `GET /api/metrics/history` | Historical metric data |
| `GET/PUT /api/settings` | Feature toggles & config |
| `GET/POST /api/sirens` | Siren device management |
| `POST /api/sirens/[id]/test` | Test siren activation |

## Configuration

Systems are configured through the web UI at `/systems/new` or `/ups/new`. Each system type has its own configuration:

- **Equipment** — Define normal/critical byte patterns for status detection
- **UPS** — Set delimiter-based parsing with display items, thresholds, and optional custom code
- **Sensor** — Configure threshold conditions (between, gte, lte, eq, neq) with status categories

Port mappings are defined in `src/worker/config.ts`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (port 7777) |
| `npm run build` | Production build |
| `npm start` | Production server (port 7777) |
| `npm run worker` | Production data collector |
| `npm run worker:dev` | Worker with watch mode |
| `npm run start:all` | Dashboard + worker together |
| `npm run db:seed` | Seed database |
| `npm run db:reset` | Reset and reseed database |

## License

Private — All rights reserved.
