/**
 * Walks a shfmt JSON AST and extracts every command invocation.
 *
 * shfmt represents commands as CallExpr nodes where Args[0] is the
 * command name. The recursive walk finds CallExpr nodes inside pipes,
 * chains (&&/||), loops, conditionals, subshells, and command substitutions.
 */

export interface CommandInfo {
  /** The command name, e.g., "git", "grep" */
  name: string
  /** All arguments as strings, e.g., ["git", "push", "--force", "origin", "main"] */
  args: string[]
}

/**
 * Extract just command names (simple API for basic safelist checking).
 */
export function extractCommands(node: unknown): string[] {
  return extractCommandInfos(node).map((c) => c.name)
}

/**
 * Extract full command info including arguments.
 */
export function extractCommandInfos(node: unknown): CommandInfo[] {
  if (!node || typeof node !== "object") return []

  const n = node as Record<string, unknown>
  const commands: CommandInfo[] = []

  // CallExpr = a command invocation
  if (n.Type === "CallExpr" && Array.isArray(n.Args) && n.Args.length > 0) {
    const args = (n.Args as Array<Record<string, unknown>>).map(extractWordValue).filter(Boolean) as string[]
    if (args.length > 0) {
      const name = args[0].split("/").pop()!
      commands.push({ name, args: [name, ...args.slice(1)] })
    }
  }

  // Recurse into all child values to find nested commands
  for (const value of Object.values(n)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        commands.push(...extractCommandInfos(item))
      }
    } else if (typeof value === "object" && value !== null) {
      commands.push(...extractCommandInfos(value))
    }
  }

  return commands
}

/**
 * Extract the string value from a shfmt Word node.
 * Concatenates all Lit parts (ignores complex expansions).
 */
function extractWordValue(word: Record<string, unknown>): string | null {
  const parts = word?.Parts as Array<Record<string, unknown>> | undefined
  if (!parts) return null

  let result = ""
  for (const part of parts) {
    if (part.Value !== undefined) {
      result += String(part.Value)
    } else if (part.Type === "DblQuoted" || part.Type === "SglQuoted") {
      // Quoted string — recurse into its parts
      const innerParts = part.Parts as Array<Record<string, unknown>> | undefined
      if (innerParts) {
        for (const inner of innerParts) {
          if (inner.Value !== undefined) result += String(inner.Value)
        }
      }
      if (part.Value !== undefined) result += String(part.Value)
    }
  }

  return result || null
}
