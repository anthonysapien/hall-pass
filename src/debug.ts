/**
 * Debug logging for hall-pass.
 *
 * Logs to stderr so it never interferes with exit code communication.
 * Enabled via HALL_PASS_DEBUG=1 env var or config.debug.enabled.
 */

import type { HallPassConfig } from "./config.ts"

export type DebugFn = (label: string, ...data: unknown[]) => void

export function createDebug(config: HallPassConfig): DebugFn {
  const enabled = process.env.HALL_PASS_DEBUG === "1" || config.debug.enabled

  if (!enabled) {
    return () => {}
  }

  return (label: string, ...data: unknown[]) => {
    const payload = data.length === 1 ? data[0] : data.length > 0 ? data : undefined
    if (payload !== undefined) {
      process.stderr.write(`[hall-pass] ${label}: ${JSON.stringify(payload)}\n`)
    } else {
      process.stderr.write(`[hall-pass] ${label}\n`)
    }
  }
}
