#!/usr/bin/env bun

/**
 * hall-pass: PreToolUse hook for Claude Code
 *
 * Auto-approves Bash commands where every invoked program is in the safelist.
 * Uses shfmt to parse commands into a proper shell AST, then walks the tree
 * to find every CallExpr (command invocation).
 *
 * This correctly handles pipes, &&/||, for/while/if, subshells, command
 * substitution, env var prefixes, redirects, and quoting — because shfmt
 * is a real shell parser, not a regex hack.
 *
 * Exit codes:
 *   0 = allow (every command is in the safelist)
 *   1 = no opinion (unknown command, fall through to permission prompt)
 */

import { SAFE_COMMANDS, DB_CLIENTS } from "./safelist.ts"
import { extractCommands } from "./parser.ts"
import { extractSqlFromPsql, isSqlReadOnly } from "./sql.ts"

// -- Read hook input from stdin --

let command: string
try {
  const input = await Bun.stdin.text()
  command = JSON.parse(input)?.tool_input?.command ?? ""
} catch {
  process.exit(1)
}

if (!command) process.exit(1)

// -- Parse with shfmt --

const proc = Bun.spawn(["shfmt", "--tojson"], {
  stdin: new Response(command),
  stdout: "pipe",
  stderr: "pipe",
})

const stdout = await new Response(proc.stdout).text()
await proc.exited

if (proc.exitCode !== 0) {
  process.exit(1)
}

let ast: unknown
try {
  ast = JSON.parse(stdout)
} catch {
  process.exit(1)
}

// -- Check every command in the AST against the safelist --

const commands = extractCommands(ast)

// No commands found (e.g., bare variable assignment) — safe
if (commands.length === 0) {
  process.exit(0)
}

for (const cmd of commands) {
  if (SAFE_COMMANDS.has(cmd)) continue

  // DB clients get deeper inspection — parse the SQL
  if (DB_CLIENTS.has(cmd)) {
    const sql = extractSqlFromPsql(command)
    if (sql && isSqlReadOnly(sql)) continue
    // No -c flag (interactive session) or write SQL — prompt
    process.exit(1)
  }

  // Unknown command — prompt
  process.exit(1)
}

process.exit(0)
