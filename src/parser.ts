/**
 * Walks a shfmt JSON AST and extracts every command name.
 *
 * shfmt represents commands as CallExpr nodes where Args[0] is the
 * command name. The recursive walk finds CallExpr nodes inside pipes,
 * chains (&&/||), loops, conditionals, subshells, and command substitutions.
 */
export function extractCommands(node: unknown): string[] {
  if (!node || typeof node !== "object") return []

  const n = node as Record<string, unknown>
  const commands: string[] = []

  // CallExpr = a command invocation. Args[0] is the command name.
  if (n.Type === "CallExpr" && Array.isArray(n.Args) && n.Args.length > 0) {
    const firstArg = n.Args[0] as Record<string, unknown>
    const parts = firstArg?.Parts as Array<Record<string, unknown>> | undefined
    if (parts?.[0]?.Value) {
      const cmd = String(parts[0].Value)
      // Strip leading path: /usr/bin/grep -> grep
      commands.push(cmd.split("/").pop()!)
    }
  }

  // Recurse into all child values to find nested commands
  for (const value of Object.values(n)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        commands.push(...extractCommands(item))
      }
    } else if (typeof value === "object" && value !== null) {
      commands.push(...extractCommands(value))
    }
  }

  return commands
}
