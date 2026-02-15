/**
 * SQL statement safety checker.
 *
 * Parses SQL using pgsql-ast-parser and checks if all statements
 * are read-only. Used when the Bash command is a database client
 * like psql.
 *
 * Returns:
 *   "allow"   — all statements are read-only
 *   "prompt"  — contains writes or couldn't parse
 */

import { parse } from "pgsql-ast-parser"

const READ_ONLY_TYPES = new Set([
  "select",
  "with",        // WITH ... SELECT (CTEs)
  "show",
  "values",      // bare VALUES clause
])

/**
 * Extract the SQL string from a psql command's -c argument.
 * Returns null if no -c flag found.
 */
export function extractSqlFromPsql(command: string): string | null {
  // Match -c followed by a quoted or unquoted SQL string
  // psql ... -c "SELECT ..." or psql ... -c 'SELECT ...' or psql ... --command="SELECT ..."
  const patterns = [
    /-c\s+"([^"]+)"/,
    /-c\s+'([^']+)'/,
    /--command="([^"]+)"/,
    /--command='([^']+)'/,
    /-c\s+(\S+)/,  // unquoted single-word (rare but possible)
  ]

  for (const pattern of patterns) {
    const match = command.match(pattern)
    if (match) return match[1]
  }

  return null
}

/**
 * Check if a SQL string contains only read-only statements.
 */
export function isSqlReadOnly(sql: string): boolean {
  const trimmed = sql.trim()
  if (!trimmed) return true

  try {
    const statements = parse(trimmed)
    if (statements.length === 0) return true
    return statements.every((stmt) => READ_ONLY_TYPES.has(stmt.type))
  } catch {
    // Can't parse = can't guarantee safety = prompt
    return false
  }
}
