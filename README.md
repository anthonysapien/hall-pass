# hall-pass

A [PreToolUse hook](https://code.claude.com/docs/en/hooks-guide) for [Claude Code](https://claude.com/claude-code) that auto-approves safe Bash commands so you stop getting prompted for `grep foo | head -20`.

## The problem

Claude Code's built-in permission system can't match through pipes. `Bash(grep *)` approves `grep -r foo /path` but **not** `grep -r foo /path | head -20`. Every piped command prompts you, and one-off approvals create a bloated settings file that never generalizes.

## How it works

hall-pass has three layers of inspection, each using a real parser — not regex.

### Layer 1: Bash commands

Uses [shfmt](https://github.com/mvdan/sh) to parse commands into a proper shell AST, then walks the tree to find every command invocation. If every command is in the safelist, it auto-approves.

This correctly handles:
- Pipes: `grep foo | head -20`
- Chains: `git add . && git commit -m "msg"`
- Env var prefixes: `TEST_URL=http://localhost:3334 bun test`
- For/while/if loops: `for f in *.ts; do echo "$f"; done`
- Subshells and command substitution: `echo $(whoami)`
- Redirects: `bun run build 2>&1`
- Nested commands: `echo $(cat $(find . -name foo))`

### Layer 2: Git safety

Git commands get deeper inspection of subcommands and flags. Safe operations are auto-approved; destructive ones prompt.

| Auto-approved | Prompts |
|---|---|
| `git status`, `log`, `diff`, `show`, `branch` | `git push --force`, `push -f` |
| `git add`, `commit`, `stash`, `fetch`, `pull` | `git reset --hard` |
| `git push` (feature branches) | `git clean -f` |
| `git checkout <branch>`, `switch` | `git checkout .`, `restore .` |
| `git merge`, `cherry-pick`, `revert` | `git branch -D` |
| | `git push origin main` (protected branches) |

### Layer 3: SQL safety

Database clients (`psql`, `mysql`, `sqlite3`) get SQL-level inspection using [pgsql-ast-parser](https://github.com/oguimbal/pgsql-ast-parser). Read-only queries are auto-approved; writes prompt.

| Auto-approved | Prompts |
|---|---|
| `psql -c "SELECT * FROM users"` | `psql -c "DROP TABLE users"` |
| `psql -c "SHOW search_path"` | `psql -c "DELETE FROM users"` |
| `psql -c "WITH cte AS (...) SELECT ..."` | `psql -c "INSERT INTO ..."` |
| | `psql` (interactive session, no `-c`) |

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

## Customizing

### Bash safelist

Edit `src/safelist.ts` to add or remove commands:

```typescript
export const SAFE_COMMANDS = new Set([
  "bun", "npm", "grep", "curl", // ...
])
```

If a command isn't in the set, it falls through to the normal Claude Code permission prompt. Nothing is silently denied.

### Git protected branches

Edit `src/git.ts` to change which branches require a prompt before push:

```typescript
const PROTECTED_BRANCHES = new Set([
  "main", "master", "staging", "production", "prod",
])
```

## How the hook decides

```
Command from Claude Code
         |
         v
   Parse with shfmt
         |
         v
   For each command invocation:
         |
         +-- In SAFE_COMMANDS? --> allow
         |
         +-- git? --> inspect subcommand + flags
         |            safe op? --> allow
         |            destructive? --> prompt
         |
         +-- psql/mysql/sqlite3? --> parse SQL
         |            read-only? --> allow
         |            write? --> prompt
         |
         +-- unknown --> prompt
```

## Project structure

```
src/
  hook.ts        Entry point — reads stdin, runs shfmt, checks safelist
  parser.ts      AST walker — extracts command names from shfmt JSON
  safelist.ts    Safe commands, inspected commands, DB clients
  git.ts         Git subcommand + flag safety checker
  sql.ts         SQL statement read-only checker
  install.ts     Registers the hook in ~/.claude/settings.json
  uninstall.ts   Removes the hook
  *.test.ts      Tests (160+)
```
