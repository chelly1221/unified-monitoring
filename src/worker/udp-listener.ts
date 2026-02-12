// UDP socket listeners for data collection

import * as dgram from 'dgram'
import { UDP_PORTS, PortConfig } from './config'
import { parseBuffer } from './parser'
import { updateMetric, processAlarm } from './db-updater'
import { broadcastRawData } from './websocket-server'

const sockets: dgram.Socket[] = []

/**
 * Start UDP listeners for all configured ports
 */
export function startUdpListeners(): void {
  for (const [portStr, config] of Object.entries(UDP_PORTS)) {
    const port = Number(portStr)
    startUdpListener(port, config)
  }
}

/**
 * Start a single UDP listener on the specified port
 */
function startUdpListener(port: number, config: PortConfig): void {
  const socket = dgram.createSocket('udp4')

  socket.on('message', async (msg, rinfo) => {
    console.log(`[UDP:${port}] Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`)

    const data = parseBuffer(msg, config)

    // Broadcast raw data for preview in config UI
    broadcastRawData(port, data.value)

    // Route to appropriate handler based on type
    if (config.type === 'alarm') {
      await processAlarm(config, data)
    } else {
      await updateMetric(config, data, port, 'udp')
    }
  })

  socket.on('error', (err) => {
    console.error(`[UDP:${port}] Error:`, err.message)
    socket.close()
  })

  socket.on('listening', () => {
    const address = socket.address()
    console.log(`[UDP:${port}] Listening on ${address.address}:${address.port} for ${config.system}`)
  })

  socket.bind(port)
  sockets.push(socket)
}

/**
 * Stop all UDP listeners
 */
export function stopUdpListeners(): void {
  for (const socket of sockets) {
    try {
      socket.close()
    } catch {
      // Socket may already be closed due to error
    }
  }
  sockets.length = 0
  console.log('[UDP] All listeners stopped')
}
