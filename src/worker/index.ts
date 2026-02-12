// Main entry point for the data collector worker

import { startUdpListeners, stopUdpListeners } from './udp-listener'
import { startTcpListeners, stopTcpListeners } from './tcp-listener'
import { closeDatabase, startOfflineDetection, startHistoryCleanup } from './db-updater'
import { startWebSocketServer, stopWebSocketServer } from './websocket-server'
import { resetSirens, syncSirenState } from './siren-trigger'
import { UDP_PORTS, TCP_PORTS } from './config'

console.log('='.repeat(60))
console.log('통합알람감시체계 - Data Collector Worker')
console.log('='.repeat(60))

// Display configuration
console.log('\nConfigured UDP ports:')
for (const [port, config] of Object.entries(UDP_PORTS)) {
  console.log(`  ${port}: ${config.system} (${config.type})`)
}

console.log('\nConfigured TCP ports:')
for (const [port, config] of Object.entries(TCP_PORTS)) {
  console.log(`  ${port}: ${config.system} (${config.type})`)
}

console.log('\n' + '-'.repeat(60))
console.log('Starting listeners...\n')

// Start all listeners
startUdpListeners()
startTcpListeners()

// Start WebSocket server for real-time frontend updates
startWebSocketServer()

// Start offline detection (checks systems every 10s, marks offline after 30s)
startOfflineDetection()

// Start metric history cleanup (25h retention, runs every hour)
startHistoryCleanup()

// Sync siren state on startup (activate if unresolved critical alarms exist)
syncSirenState()

console.log('\n' + '-'.repeat(60))
console.log('Worker is running. Press Ctrl+C to stop.\n')

// Graceful shutdown handler
async function shutdown(): Promise<void> {
  console.log('\nShutting down...')

  await resetSirens()
  stopUdpListeners()
  stopTcpListeners()
  stopWebSocketServer()
  await closeDatabase()

  console.log('Worker stopped.')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Keep the process running
process.stdin.resume()
