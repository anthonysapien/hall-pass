/**
 * Commands that are safe to auto-approve in a development context.
 * If a command isn't here, it falls through to the normal permission prompt.
 *
 * IMPORTANT: Commands in this list are auto-approved with NO argument inspection.
 * Do not add commands that can execute arbitrary code via flags (e.g., python -c,
 * node -e) or that proxy other commands (e.g., xargs, nohup, exec).
 */
export const SAFE_COMMANDS = new Set([
  // Version control
  "gh",

  // JS/TS runtimes & package managers (safe as task runners, -c/-e handled by inspection)
  "bun", "npm", "npx",

  // Process management
  "lsof", "sleep",

  // Network
  "curl", "wget",

  // Text processing
  "grep", "egrep", "fgrep", "rg", "sort", "uniq",
  "tr", "cut", "wc", "head", "tail", "tee", "jq",

  // File operations
  "ls", "cat", "cp", "mv", "mkdir", "touch", "diff",

  // File inspection
  "file", "stat", "strings", "realpath", "basename", "dirname",

  // Shell builtins & utilities
  "echo", "printf", "pwd", "which", "whoami", "test", "true", "false",
  "cd", "pushd", "popd", "export", "set", "unset", "read",

  // Scripting (safe subset — no arbitrary code execution)
  "date",

  // Dev tools
  "shfmt",
])

/**
 * Commands that get deeper inspection of their arguments.
 * Not auto-approved — their subcommands/flags are checked for safety.
 */
export const INSPECTED_COMMANDS = new Set([
  "git",
  // Commands that can proxy/execute arbitrary other commands
  "xargs",
  // Commands with dangerous flag variants
  "find", "sed", "awk",
  "kill", "chmod",
  "docker",
  "node", "python", "python3",
  "source",
])

/**
 * Database clients that get deeper inspection.
 * Not auto-approved — their SQL is parsed to check if it's read-only.
 */
export const DB_CLIENTS = new Set([
  "psql",
  "mysql",
  "sqlite3",
])

/**
 * Environment variables that should never be set as command prefixes.
 * These can inject code into otherwise-safe commands.
 */
export const DANGEROUS_ENV_VARS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",  // macOS equivalent
  "DYLD_LIBRARY_PATH",
  "BASH_ENV",
  "ENV",                     // sh equivalent of BASH_ENV
  "PROMPT_COMMAND",
])
