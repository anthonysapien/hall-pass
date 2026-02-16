/**
 * Argument inspectors for commands that need deeper safety checking.
 *
 * Each inspector takes a parsed CommandInfo and returns true if the
 * command is safe to auto-approve. Returns false to prompt.
 */

import type { CommandInfo } from "./parser.ts"
import { SAFE_COMMANDS } from "./safelist.ts"
import { isGitCommandSafe } from "./git.ts"

/**
 * Check if a command is safe based on its name and arguments.
 * Walks the same decision tree as the main hook loop:
 *   1. SAFE_COMMANDS → auto-approve
 *   2. Inspectors → delegate (which may recurse for find -exec, xargs, etc.)
 *   3. Unknown → prompt
 */
export function isCommandSafe(cmdInfo: CommandInfo): boolean {
  const { name, args } = cmdInfo
  if (SAFE_COMMANDS.has(name)) return true
  const inspector = INSPECTORS[name]
  if (inspector) return inspector(args)
  return false
}

type Inspector = (args: string[]) => boolean

const INSPECTORS: Record<string, Inspector> = {
  // -- Version control --

  git: (args) => isGitCommandSafe(args),

  // -- Commands that proxy other commands --

  xargs: (args) => {
    // xargs [flags] command [initial-args...]
    // Extract the sub-command and its visible args, evaluate recursively
    for (let i = 1; i < args.length; i++) {
      const arg = args[i]
      // Skip xargs flags and their values
      if (arg === "-I" || arg === "-L" || arg === "-n" || arg === "-P" ||
          arg === "-d" || arg === "-s" || arg === "-a" || arg === "-R") {
        i++ // skip value
        continue
      }
      if (arg.startsWith("-")) continue
      // Everything from here is the sub-command + its args
      const subArgs = args.slice(i)
      return isCommandSafe({ name: subArgs[0], args: subArgs, assigns: [] })
    }
    // No command specified — xargs defaults to echo, which is safe
    return true
  },

  source: (_args) => {
    // source/. executes arbitrary scripts — always prompt
    return false
  },

  // -- Commands with dangerous flag variants --

  find: (args) => {
    // find is safe UNLESS it uses -exec, -execdir, -delete, or -ok
    // For -exec/-execdir, extract the sub-command and evaluate recursively
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      // -delete and -ok always prompt (no sub-command to inspect)
      if (arg === "-delete" || arg === "-ok") return false

      if (arg === "-exec" || arg === "-execdir") {
        // Extract sub-command: everything from next arg up to ; or +
        const subArgs: string[] = []
        for (let j = i + 1; j < args.length; j++) {
          if (args[j] === ";" || args[j] === "+") {
            i = j // skip past terminator
            break
          }
          subArgs.push(args[j])
        }
        if (subArgs.length === 0) return false
        if (!isCommandSafe({ name: subArgs[0], args: subArgs, assigns: [] })) return false
      }
    }
    return true
  },

  sed: (args) => {
    // sed is safe UNLESS it uses -i (in-place editing)
    for (const arg of args) {
      if (arg === "-i" || arg.startsWith("-i")) return false
    }
    return true
  },

  awk: (args) => {
    // awk is safe UNLESS the script contains system() or getline
    for (const arg of args) {
      if (arg.startsWith("-")) continue
      // Check the awk program text for dangerous functions
      if (arg.includes("system(") || arg.includes("system (")) return false
      if (arg.includes("| getline") || arg.includes("|getline")) return false
    }
    return true
  },

  kill: (args) => {
    // kill [-signal] pid...
    // Dangerous targets: PID 1 (init) or -1 (all processes)
    // First non-kill arg that matches -SIGNAL pattern is the signal, rest are PIDs
    let signalSeen = false
    for (let i = 1; i < args.length; i++) {
      const arg = args[i]
      // -s SIGNAL (two-arg form)
      if (arg === "-s") { i++; signalSeen = true; continue }
      // -l/--list = just listing signals, safe
      if (arg === "-l" || arg === "--list") continue
      // First -NUM or -SIGNAME is the signal (only first one)
      if (!signalSeen && (/^-\d+$/.test(arg) || /^-[A-Z]+$/.test(arg))) {
        signalSeen = true
        continue
      }
      // Everything else is a PID — check for dangerous ones
      if (arg === "1" || arg === "-1") return false
    }
    return true
  },

  chmod: (args) => {
    // chmod is safe for normal mode changes, dangerous for setuid/setgid or world-writable
    for (let i = 1; i < args.length; i++) {
      const arg = args[i]
      if (arg.startsWith("-")) continue
      // Numeric modes: check for setuid (4xxx), setgid (2xxx), sticky (1xxx), world-writable (xx7, xx6, xx2)
      if (/^\d{3,4}$/.test(arg)) {
        const mode = arg.length === 4 ? arg : "0" + arg
        const special = parseInt(mode[0])
        const other = parseInt(mode[3])
        if (special > 0) return false      // setuid/setgid/sticky
        if (other >= 6) return false        // world-writable
      }
      // Symbolic: u+s, g+s, o+w, a+w
      if (/[+]s/.test(arg)) return false    // setuid/setgid
      if (/[oa][+]w/.test(arg)) return false // world-writable
      if (arg === "777" || arg === "666") return false
    }
    return true
  },

  docker: (args) => {
    // docker is safe for inspection commands, dangerous for run/exec with risky flags
    if (args.length < 2) return true
    const subcmd = args[1]

    // Safe docker subcommands (read-only / inspection)
    const safeSubcmds = new Set([
      "ps", "images", "logs", "inspect", "stats", "top",
      "version", "info", "network", "volume", "system",
      "build", "pull", "tag", "login", "logout",
      "compose", "container", "image",
    ])
    if (safeSubcmds.has(subcmd)) return true

    // docker run/exec — check for dangerous flags
    if (subcmd === "run" || subcmd === "exec") {
      for (const arg of args) {
        if (arg === "--privileged") return false
        if (arg === "--pid=host" || arg === "--net=host" || arg === "--network=host") return false
        // -v /:/host mounts root filesystem
        if (arg.startsWith("-v") || arg.startsWith("--volume")) {
          const vol = arg.includes("=") ? arg.split("=")[1] : args[args.indexOf(arg) + 1]
          if (vol && vol.startsWith("/:/")) return false
        }
      }
      return true
    }

    // docker stop/rm/rmi — fine
    if (subcmd === "stop" || subcmd === "rm" || subcmd === "rmi" || subcmd === "restart") return true

    return false
  },

  node: (args) => {
    // node is safe as a script runner, dangerous with -e/--eval/-p/--print (inline code)
    for (const arg of args) {
      if (arg === "-e" || arg === "--eval" || arg === "-p" || arg === "--print") return false
    }
    return true
  },

  python: (args) => {
    // python is safe as a script runner, dangerous with -c (inline code)
    for (const arg of args) {
      if (arg === "-c") return false
    }
    return true
  },

  python3: (args) => {
    // Same as python
    for (const arg of args) {
      if (arg === "-c") return false
    }
    return true
  },
}

