/**
 * Commands that are safe to auto-approve in a development context.
 * If a command isn't here, it falls through to the normal permission prompt.
 *
 * To add a command: just add it to the appropriate category below.
 */
export const SAFE_COMMANDS = new Set([
  // Version control
  "git", "gh",

  // JS/TS runtimes & package managers
  "bun", "npm", "npx", "node",

  // Process management
  "nohup", "kill", "lsof", "sleep", "timeout",

  // Network
  "curl", "wget",

  // Text processing
  "grep", "egrep", "fgrep", "rg", "sed", "awk", "sort", "uniq",
  "tr", "cut", "wc", "head", "tail", "tee", "jq",

  // File operations
  "ls", "cat", "cp", "mv", "mkdir", "touch", "chmod", "diff", "find",

  // File inspection
  "file", "stat", "strings", "realpath", "basename", "dirname",

  // Shell builtins & utilities
  "echo", "printf", "pwd", "which", "whoami", "test", "true", "false",
  "cd", "pushd", "popd", "export", "set", "unset", "read", "source",

  // Containers
  "docker",

  // Scripting
  "python3", "python", "xargs", "date",
])
