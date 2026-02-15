#!/usr/bin/env bun

/**
 * hall-pass uninstall
 *
 * Removes the PreToolUse hook from Claude Code's settings.
 * Does not remove non-Bash tool permissions (you probably still want those).
 */

import { resolve } from "path"
import { homedir } from "os"

const SETTINGS_PATH = resolve(homedir(), ".claude", "settings.json")

const settingsFile = Bun.file(SETTINGS_PATH)

if (!(await settingsFile.exists())) {
  console.log("No settings file found at", SETTINGS_PATH)
  process.exit(0)
}

let settings: Record<string, unknown>
try {
  settings = await settingsFile.json()
} catch {
  console.error("Could not parse", SETTINGS_PATH)
  process.exit(1)
}

const hooks = settings.hooks as Record<string, unknown[]> | undefined
if (!hooks?.PreToolUse) {
  console.log("No PreToolUse hooks found. Nothing to remove.")
  process.exit(0)
}

const before = hooks.PreToolUse.length
hooks.PreToolUse = hooks.PreToolUse.filter((entry) => {
  const e = entry as Record<string, unknown>
  const entryHooks = e.hooks as Array<Record<string, unknown>> | undefined
  return !entryHooks?.some((h) => (h.command as string)?.includes("hall-pass"))
})

if (hooks.PreToolUse.length === before) {
  console.log("hall-pass hook not found in settings. Nothing to remove.")
  process.exit(0)
}

// Clean up empty hooks object
if (hooks.PreToolUse.length === 0) delete hooks.PreToolUse
if (Object.keys(hooks).length === 0) delete settings.hooks

await Bun.write(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n")
console.log("Removed hall-pass hook from", SETTINGS_PATH)
console.log("Restart Claude Code sessions to pick up the change.")
