#!/usr/bin/env bun

/**
 * hall-pass install
 *
 * Sets up the PreToolUse hook in Claude Code's settings:
 * 1. Checks that shfmt is installed
 * 2. Adds hook registrations for Bash, Write, and Edit tools
 * 3. Adds non-Bash tool permissions (Read, Edit, Glob, Grep, WebFetch, WebSearch)
 */

import { resolve } from "path"
import { homedir } from "os"

const HOOK_PATH = resolve(import.meta.dir, "hook.ts")
const SETTINGS_PATH = resolve(homedir(), ".claude", "settings.json")
const HOOK_COMMAND = `bun ${HOOK_PATH}`

const NON_BASH_TOOLS = ["Read", "Edit", "Glob", "Grep", "WebFetch", "WebSearch"]
const HOOK_MATCHERS = ["Bash", "Write", "Edit"]

// -- Check shfmt --

const shfmt = Bun.spawnSync(["which", "shfmt"])
if (shfmt.exitCode !== 0) {
  console.error("shfmt is required but not installed.")
  console.error("  brew install shfmt    (macOS)")
  console.error("  go install mvdan.cc/sh/v3/cmd/shfmt@latest    (Go)")
  console.error("  snap install shfmt    (Linux)")
  process.exit(1)
}
console.log("shfmt found:", shfmt.stdout.toString().trim())

// -- Read or create settings.json --

let settings: Record<string, unknown> = {}
const settingsFile = Bun.file(SETTINGS_PATH)

if (await settingsFile.exists()) {
  try {
    settings = await settingsFile.json()
    console.log("Found existing settings:", SETTINGS_PATH)
  } catch {
    console.error("Could not parse", SETTINGS_PATH)
    process.exit(1)
  }
} else {
  // Ensure ~/.claude/ directory exists
  const dir = resolve(homedir(), ".claude")
  await Bun.spawn(["mkdir", "-p", dir]).exited
  console.log("Creating new settings:", SETTINGS_PATH)
}

// -- Add non-Bash tool permissions --

const permissions = (settings.permissions ?? {}) as Record<string, unknown>
const allow = new Set(permissions.allow as string[] ?? [])

for (const tool of NON_BASH_TOOLS) {
  allow.add(tool)
}

permissions.allow = [...allow]
settings.permissions = permissions

// -- Add hook registrations for Bash, Write, and Edit --

const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>
const preToolUse = (hooks.PreToolUse ?? []) as Array<Record<string, unknown>>

for (const matcher of HOOK_MATCHERS) {
  // Check if hall-pass is already registered for this matcher
  const existing = preToolUse.find((entry) => {
    if (entry.matcher !== matcher) return false
    const entryHooks = entry.hooks as Array<Record<string, unknown>> | undefined
    return entryHooks?.some((h) => {
      const cmd = h.command as string | undefined
      return cmd?.includes("hall-pass")
    })
  })

  if (existing) {
    // Update the command path in case the project moved
    const entryHooks = existing.hooks as Array<Record<string, unknown>>
    const hookEntry = entryHooks.find((h) => (h.command as string)?.includes("hall-pass"))
    if (hookEntry) hookEntry.command = HOOK_COMMAND
    console.log(`Updated existing hall-pass hook for ${matcher}`)
  } else {
    preToolUse.push({
      matcher,
      hooks: [{ type: "command", command: HOOK_COMMAND }],
    })
    console.log(`Added hall-pass hook for ${matcher}`)
  }
}

hooks.PreToolUse = preToolUse
settings.hooks = hooks

// -- Optionally generate config --

if (process.argv.includes("--init")) {
  const { initConfig } = await import("./config.ts")
  const configPath = await initConfig()
  console.log("Created default config at", configPath)
}

// -- Write settings --

await Bun.write(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n")
console.log("Wrote settings to", SETTINGS_PATH)
console.log("\nDone. Restart Claude Code sessions to pick up the new settings.")
