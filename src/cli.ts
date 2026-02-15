#!/usr/bin/env bun

/**
 * hall-pass CLI
 *
 * Subcommands:
 *   init — Generate default config at ~/.config/hall-pass/config.toml
 */

import { initConfig } from "./config.ts"

const command = process.argv[2]

if (command === "init" || !command) {
  const path = await initConfig()
  console.log(`Created default config at ${path}`)
  console.log("Edit this file to customize hall-pass behavior.")
} else {
  console.error(`Unknown command: ${command}`)
  console.error("Usage: hall-pass-init")
  process.exit(1)
}
