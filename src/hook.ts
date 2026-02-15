#!/usr/bin/env bun

/**
 * hall-pass: PreToolUse hook for Claude Code
 *
 * Routes by tool type:
 *   - Bash: safelist/git/sql/path checking with shfmt AST parsing
 *   - Write/Edit: file path protection
 *
 * Decision protocol:
 *   Exit 0 + JSON { permissionDecision: "allow" } = auto-approve (skip prompt)
 *   Exit 0 + JSON { permissionDecision: "deny" } = block
 *   Exit 2 = block (stderr sent to Claude)
 *   Exit 1 = no opinion (fall through to normal permission prompt)
 */

// Diagnostic log — always writes to /tmp so we can debug hook failures
const DIAG = "/tmp/hall-pass-diag.log"
function diag(msg: string) {
  try { require("fs").appendFileSync(DIAG, `${new Date().toISOString()} ${msg}\n`) } catch {}
}

/** Output a permissionDecision JSON to stdout and exit. */
function allow(reason: string): never {
  diag(`ALLOW ${reason}`)
  const output = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: reason,
    },
  })
  process.stdout.write(output)
  process.exit(0)
}

/** Exit with no opinion — falls through to normal permission prompt. */
function prompt(reason: string): never {
  diag(`PROMPT ${reason}`)
  process.exit(1)
}

import { SAFE_COMMANDS, DB_CLIENTS, INSPECTED_COMMANDS } from "./safelist.ts"
import { extractCommandInfos } from "./parser.ts"
import { extractSqlFromPsql, isSqlReadOnly } from "./sql.ts"
import { isGitCommandSafe } from "./git.ts"
import { loadConfig } from "./config.ts"
import { createDebug } from "./debug.ts"
import { createAudit } from "./audit.ts"
import { checkFilePath, checkCommandPaths } from "./paths.ts"

// -- Read hook input from stdin --

diag("start")
let toolName: string
let toolInput: Record<string, unknown>
try {
  const input = await Bun.stdin.text()
  const parsed = JSON.parse(input)
  toolName = parsed?.tool_name ?? ""
  toolInput = parsed?.tool_input ?? {}
} catch (e) {
  diag(`stdin-error: ${e}`)
  process.exit(1)
}

const command = (toolInput.command as string) ?? ""
diag(`tool=${toolName} cmd=${command.slice(0, 80)}`)

// -- Load config + initialize debug/audit --

const config = await loadConfig()

// Build dynamic sets from config
const safeCommands = new Set([...SAFE_COMMANDS, ...config.commands.safe])
const dbClients = new Set([...DB_CLIENTS, ...config.commands.db_clients])
const protectedBranches = config.git.protected_branches.length > 0
  ? new Set(config.git.protected_branches)
  : undefined // use built-in defaults

const debug = createDebug(config)
const audit = createAudit(config)

debug("input", { toolName, toolInput })

// -- Route by tool type --

if (toolName === "Write" || toolName === "Edit") {
  const filePath = toolInput.file_path as string
  if (!filePath) {
    debug("write/edit", "no file_path, allowing")
    allow("write/edit no path")
  }

  debug("write/edit", { filePath })
  const decision = checkFilePath(filePath, "write", config)
  debug("path-check", decision)

  if (!decision.allowed) {
    audit.log({ tool: toolName, input: filePath, decision: "prompt", reason: decision.reason, layer: "paths" })
    prompt(`path-blocked: ${decision.reason}`)
  }

  audit.log({ tool: toolName, input: filePath, decision: "allow", reason: "no path match", layer: "paths" })
  allow("write/edit allowed")
}

// -- Bash path --

if (!command) {
  debug("bash", "empty command")
  prompt("empty command")
}

debug("bash", { command })

// -- Parse with shfmt --

const proc = Bun.spawn(["shfmt", "--tojson"], {
  stdin: new Response(command),
  stdout: "pipe",
  stderr: "pipe",
})

const stdout = await new Response(proc.stdout).text()
await proc.exited

if (proc.exitCode !== 0) {
  debug("shfmt", "parse failed")
  prompt("shfmt failed")
}

let ast: unknown
try {
  ast = JSON.parse(stdout)
} catch {
  debug("shfmt", "JSON parse failed")
  prompt("shfmt json failed")
}

// -- Check every command in the AST --

const commandInfos = extractCommandInfos(ast)
debug("commands", commandInfos.map(c => c.name))

// No commands found (e.g., bare variable assignment) — safe
if (commandInfos.length === 0) {
  audit.log({ tool: "Bash", input: command, decision: "allow", reason: "no commands", layer: "safelist" })
  allow("no commands (variable assignment)")
}

for (const cmdInfo of commandInfos) {
  const { name, args } = cmdInfo

  // Path checking runs FIRST — even safe commands shouldn't touch protected files
  const pathDecision = checkCommandPaths(cmdInfo, config)
  if (!pathDecision.allowed) {
    debug("path-block", { name, reason: pathDecision.reason })
    audit.log({ tool: "Bash", input: command, decision: "prompt", reason: pathDecision.reason, layer: "paths" })
    prompt(`path-blocked: ${name} ${pathDecision.reason}`)
  }

  if (safeCommands.has(name)) {
    debug("safelist", { name, decision: "allow" })
    continue
  }

  // Commands that get deeper argument inspection
  if (INSPECTED_COMMANDS.has(name)) {
    if (name === "git") {
      const safe = isGitCommandSafe(args.join(" "), protectedBranches)
      debug("git", { args: args.join(" "), safe })
      if (safe) continue
    }
    audit.log({ tool: "Bash", input: command, decision: "prompt", reason: `inspected command: ${name}`, layer: "git" })
    prompt(`inspected: ${name}`)
  }

  // DB clients get SQL-level inspection
  if (dbClients.has(name)) {
    const sql = extractSqlFromPsql(command)
    const readOnly = sql ? isSqlReadOnly(sql) : false
    debug("sql", { name, sql, readOnly })
    if (sql && readOnly) continue
    audit.log({ tool: "Bash", input: command, decision: "prompt", reason: `db client: ${name}`, layer: "sql" })
    prompt(`db: ${name}`)
  }

  // Unknown command — prompt
  debug("unknown", { name, decision: "prompt" })
  audit.log({ tool: "Bash", input: command, decision: "prompt", reason: `unknown command: ${name}`, layer: "unknown" })
  prompt(`unknown: ${name}`)
}

audit.log({ tool: "Bash", input: command, decision: "allow", reason: "all commands safe", layer: "safelist" })
allow("all commands safe")
