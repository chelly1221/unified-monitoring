# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

통합알람감시체계 - A real-time monitoring dashboard for radar and transmission facilities. Built with Next.js 14+ (App Router), TypeScript, SQLite/Prisma, shadcn/ui, and WebSocket for real-time updates.

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
                    ├── Updates SQLite via Prisma
                    └── Broadcasts via WebSocket (port 7778)
                              ↓
                    RealtimeProvider (React Context)
                              ↓
                    Dashboard Components (instant re-render)
```

**Key data flow:**
- Worker listens on UDP/TCP ports defined in `src/worker/config.ts`
- Parses incoming data (20-byte buffers or UTF-8)
- Updates database and broadcasts via WebSocket
- Frontend receives updates through `useWebSocket` hook and `RealtimeProvider` context

## Code Style

- Korean for UI labels and domain-specific terms
- English for code identifiers and comments
- TypeScript strict mode
- Components in PascalCase, utilities in camelCase

## Design Constraints

- **Target resolution:** 1920x1080
- **NO SCROLLING** - all pages must fit within viewport
- **Dark mode only** - see color system below
- Status colors: 🟢 `#22c55e` (normal) | 🟡 `#eab308` (warning) | 🔴 `#ef4444` (critical) | ⚫ `#71717a` (offline)

## Database Schema (Prisma)

Core models: `System`, `Metric`, `Alarm`, `AlarmLog`, `Setting`

- Systems have multiple metrics and alarms (cascade delete)
- System types: `'equipment' | 'ups' | 'sensor'`
- System status: `'normal' | 'warning' | 'critical' | 'offline'`

## WebSocket Message Types

```typescript
type: 'metric' | 'alarm' | 'system' | 'delete' | 'ping'
```

## Monitored Systems

1레이더, 2레이더, UPS (관제송신/1레이더/2레이더), FMS, LCMS, VDL, MARC, 온습도, 전송로

## Reference

Original Node-RED flows: `/mnt/dietpi_userdata/node-red/flows.json`
