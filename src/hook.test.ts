import { describe, test, expect } from "bun:test"

const HOOK_PATH = new URL("./hook.ts", import.meta.url).pathname

/** Run the hook with a simulated Claude Code input and return the exit code */
async function runHook(command: string): Promise<number> {
  const input = JSON.stringify({ tool_input: { command } })
  const proc = Bun.spawn(["bun", HOOK_PATH], {
    stdin: new Response(input),
    stdout: "pipe",
    stderr: "pipe",
  })
  await proc.exited
  return proc.exitCode ?? 1
}

describe("hook integration", () => {
  describe("should ALLOW (exit 0)", () => {
    const allowed = [
      "git status",
      "git add . && git commit -m 'msg' && git push",
      "grep -r foo /path | head -20",
      "TEST_URL=http://localhost:3334 bun test server/",
      "lsof -ti :3334 | xargs kill",
      "for f in *.ts; do echo $f; done",
      "curl https://example.com | jq .data | sort | head -5",
      "bun run db:generate search-index 2>&1",
      "FOO=bar",
      "docker ps --format '{{.Names}}'",
      "git log --oneline -5 | cat",
      "find . -name '*.ts' | wc -l",
      "echo hello && echo world || echo fallback",
      "lsof -i :3334 | grep LISTEN 2>/dev/null",
      "TEST_BASE_URL=http://localhost:3333 bun test server/tests/search.test.ts 2>&1",
    ]

    for (const cmd of allowed) {
      test(cmd, async () => {
        expect(await runHook(cmd)).toBe(0)
      })
    }
  })

  describe("git — should ALLOW safe operations (exit 0)", () => {
    const allowed = [
      "git status",
      "git log --oneline -5",
      "git diff --stat",
      "git add . && git commit -m 'msg' && git push",
      "git log --oneline -5 | cat",
      "git fetch && git pull",
      "git stash && git checkout main && git stash pop",
      "git -C /some/path status",
      "git branch -a",
      "git push -u origin feat/search",
    ]

    for (const cmd of allowed) {
      test(cmd, async () => {
        expect(await runHook(cmd)).toBe(0)
      })
    }
  })

  describe("git — should PROMPT for destructive ops (exit 1)", () => {
    const prompted = [
      "git push --force",
      "git push -f origin feat/search",
      "git reset --hard",
      "git reset --hard HEAD~3",
      "git clean -f",
      "git checkout .",
      "git restore .",
      "git branch -D feat/old",
      "git push origin main",
      "git stash drop",
      "git stash clear",
    ]

    for (const cmd of prompted) {
      test(cmd, async () => {
        expect(await runHook(cmd)).toBe(1)
      })
    }
  })

  describe("should PROMPT (exit 1)", () => {
    const prompted = [
      "rm -rf /",
      "sudo apt install foo",
      "dd if=/dev/zero of=disk.img",
      "some-unknown-command --flag",
      "echo $(rm -rf /)",
      "git add . && unknown-cmd",
      "safe-looking | rm -rf /tmp",
    ]

    for (const cmd of prompted) {
      test(cmd, async () => {
        expect(await runHook(cmd)).toBe(1)
      })
    }
  })

  test("empty command falls through", async () => {
    expect(await runHook("")).toBe(1)
  })

  describe("psql — should ALLOW read-only SQL (exit 0)", () => {
    const allowed = [
      `psql postgres://user:pass@localhost:5433/db -t -c "SELECT * FROM users"`,
      `psql postgres://user:pass@localhost:5433/db -c "SELECT DISTINCT advertiser_id FROM search_index LIMIT 1" 2>&1`,
      `psql postgres://localhost/db -t -c "SELECT count(*) FROM orders"`,
      `psql -c 'SHOW search_path'`,
    ]

    for (const cmd of allowed) {
      test(cmd, async () => {
        expect(await runHook(cmd)).toBe(0)
      })
    }
  })

  describe("psql — should PROMPT for writes (exit 1)", () => {
    const prompted = [
      `psql postgres://localhost/db -c "DROP TABLE users"`,
      `psql -c "INSERT INTO users VALUES (1, 'test')"`,
      `psql -c "DELETE FROM users WHERE id = 1"`,
      `psql -c "UPDATE users SET name = 'test'"`,
      `psql -c "TRUNCATE users"`,
      `psql -c "SELECT 1; DROP TABLE users"`,
      // Interactive session (no -c flag) — prompt
      `psql postgres://localhost/db`,
    ]

    for (const cmd of prompted) {
      test(cmd, async () => {
        expect(await runHook(cmd)).toBe(1)
      })
    }
  })

  test("invalid JSON input falls through", async () => {
    const proc = Bun.spawn(["bun", HOOK_PATH], {
      stdin: new Response("not json"),
      stdout: "pipe",
      stderr: "pipe",
    })
    await proc.exited
    expect(proc.exitCode).toBe(1)
  })
})
