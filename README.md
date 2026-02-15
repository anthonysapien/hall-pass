# hall-pass

A [PreToolUse hook](https://code.claude.com/docs/en/hooks-guide) for [Claude Code](https://claude.com/claude-code) that auto-approves safe Bash commands so you stop getting prompted for `grep foo | head -20`.

## The problem

Claude Code's built-in permission system can't match through pipes. `Bash(grep *)` approves `grep -r foo /path` but **not** `grep -r foo /path | head -20`. Every piped command prompts you, and one-off approvals create a bloated settings file that never generalizes.

## How it works

hall-pass uses [shfmt](https://github.com/mvdan/sh) to parse Bash commands into a proper shell AST, then walks the tree to find every command invocation. If every command is in the safelist, it auto-approves. Otherwise, it falls through to the normal permission prompt.

This correctly handles:
- Pipes: `grep foo | head -20`
- Chains: `git add . && git commit -m "msg"`
- Env var prefixes: `TEST_URL=http://localhost:3334 bun test`
- For/while/if loops: `for f in *.ts; do echo "$f"; done`
- Subshells and command substitution: `echo $(whoami)`
- Redirects: `bun run build 2>&1`
- Nested commands: `echo $(cat $(find . -name foo))`

No regex hacks. No substring matching. A real parser.

## Setup

### Prerequisites

- [Bun](https://bun.sh)
- [shfmt](https://github.com/mvdan/sh) (`brew install shfmt`)

### Install

```bash
git clone https://github.com/anthonysapien/hall-pass.git ~/Workspace/hall-pass
cd ~/Workspace/hall-pass
bun install
bun run install-hook
```

This adds the hook to your `~/.claude/settings.json` and sets up non-Bash tool permissions (Read, Edit, Glob, Grep, WebFetch, WebSearch).

### Uninstall

```bash
bun run uninstall-hook
```

### Verify

```bash
bun test
```

## Customizing the safelist

Edit `src/safelist.ts` to add or remove commands:

```typescript
export const SAFE_COMMANDS = new Set([
  "git", "bun", "npm", "grep", "curl", // ...
])
```

If a command isn't in the set, it falls through to the normal Claude Code permission prompt. Nothing is silently denied.

## How the hook decides

```
Command received from Claude Code
        |
        v
  Parse with shfmt --tojson
        |
        v
  Walk AST, find every CallExpr
        |
        v
  All commands in safelist?
       / \
     yes   no
      |     |
   exit 0  exit 1
   (allow) (prompt user)
```

## Project structure

```
src/
  hook.ts       Entry point — reads stdin, runs shfmt, checks safelist
  parser.ts     AST walker — extracts command names from shfmt JSON
  safelist.ts   The one list of safe commands
  install.ts    Registers the hook in ~/.claude/settings.json
  uninstall.ts  Removes the hook
  *.test.ts     Tests
```
