/**
 * Git command safety checker.
 *
 * Parses git commands and checks whether they're safe to auto-approve.
 * Read-only commands and safe local writes are allowed.
 * Destructive operations that can lose work are flagged.
 *
 * Returns true if the git command is safe to auto-approve.
 */

/**
 * Git subcommands that are always safe (read-only or easily reversible).
 */
const SAFE_SUBCOMMANDS = new Set([
  // Read-only
  "status", "log", "diff", "show", "branch", "tag", "remote",
  "describe", "rev-parse", "rev-list", "ls-files", "ls-tree",
  "cat-file", "reflog", "shortlog", "blame", "bisect",
  "name-rev", "cherry", "count-objects", "fsck", "verify-pack",
  "whatchanged", "config",

  // Safe local writes
  "add", "commit", "stash", "fetch", "pull", "merge",
  "cherry-pick", "revert", "notes", "worktree",

  // Branch/navigation (without destructive flags)
  "checkout", "switch", "restore",

  // Maintenance
  "gc", "prune", "repack",
])

/**
 * Git subcommands that are safe ONLY on non-protected branches.
 */
const BRANCH_GATED_SUBCOMMANDS = new Set([
  "push",
  "rebase",
])

/**
 * Branches that should always prompt before push/rebase.
 */
const PROTECTED_BRANCHES = new Set([
  "main", "master", "staging", "production", "prod",
])

/**
 * Flags that make otherwise-safe commands destructive.
 */
const DESTRUCTIVE_FLAGS: Record<string, Set<string>> = {
  push: new Set(["--force", "-f", "--force-with-lease", "--force-if-includes"]),
  reset: new Set(["--hard"]),
  checkout: new Set(["."]),     // git checkout . = discard all changes
  restore: new Set(["."]),      // git restore . = discard all changes
  clean: new Set(["-f", "-fd", "-fx", "-fxd", "-fdx", "-ff"]),
  branch: new Set(["-D", "--force", "-d"]),  // -d is less destructive but still deletes
  stash: new Set(["drop", "clear"]),
}

/**
 * Subcommands that are always destructive — never auto-approve.
 */
const ALWAYS_DESTRUCTIVE = new Set([
  "reset",   // even soft reset can be surprising
  "clean",   // deletes untracked files
])

/**
 * Extract the git subcommand and flags from a full git command string.
 * Handles: git -C /path subcommand --flags args
 */
function parseGitCommand(args: string[]): { subcommand: string; flags: string[]; rest: string[] } {
  const remaining = [...args]

  // Skip git-level flags before the subcommand
  // These are flags that go between "git" and the subcommand
  while (remaining.length > 0) {
    const arg = remaining[0]
    if (arg === "-C" || arg === "-c" || arg === "--git-dir" || arg === "--work-tree") {
      remaining.shift() // the flag
      remaining.shift() // its value
    } else if (arg.startsWith("-")) {
      remaining.shift() // other git-level flags like --no-pager
    } else {
      break
    }
  }

  const subcommand = remaining.shift() ?? ""
  const flags: string[] = []
  const rest: string[] = []

  for (const arg of remaining) {
    if (arg.startsWith("-")) {
      flags.push(arg)
    } else {
      rest.push(arg)
    }
  }

  return { subcommand, flags, rest }
}

/**
 * Check if a git command is safe to auto-approve.
 * Takes the raw command string (everything after "git").
 */
export function isGitCommandSafe(fullCommand: string): boolean {
  // Tokenize roughly — split on whitespace, respecting quotes
  const args = tokenize(fullCommand)

  // Remove "git" if it's the first token
  if (args[0] === "git") args.shift()

  const { subcommand, flags, rest } = parseGitCommand(args)

  if (!subcommand) return true // bare "git" — safe (just shows help)

  // Always destructive — prompt no matter what
  if (ALWAYS_DESTRUCTIVE.has(subcommand)) return false

  // Check for destructive flags on otherwise-safe commands
  const dangerousFlags = DESTRUCTIVE_FLAGS[subcommand]
  if (dangerousFlags) {
    for (const flag of flags) {
      if (dangerousFlags.has(flag)) return false
    }
    // Also check rest args for things like "git checkout ."
    for (const arg of rest) {
      if (dangerousFlags.has(arg)) return false
    }
  }

  // Branch-gated commands: check which branch
  if (BRANCH_GATED_SUBCOMMANDS.has(subcommand)) {
    // Check if pushing to a protected branch
    // git push origin main, git push origin HEAD:main
    for (const arg of rest) {
      const target = arg.includes(":") ? arg.split(":").pop()! : arg
      if (PROTECTED_BRANCHES.has(target)) return false
    }
    // git push with no branch specified — check for force flags only
    // (already checked above), otherwise allow
    return true
  }

  // Known safe subcommands
  if (SAFE_SUBCOMMANDS.has(subcommand)) return true

  // Unknown subcommand — prompt
  return false
}

/**
 * Simple shell-aware tokenizer for git arguments.
 * Handles single and double quotes.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble
    } else if (ch === " " && !inSingle && !inDouble) {
      if (current) tokens.push(current)
      current = ""
    } else {
      current += ch
    }
  }

  if (current) tokens.push(current)
  return tokens
}
