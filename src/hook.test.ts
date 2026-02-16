import { describe, test, expect } from "bun:test"

const HOOK_PATH = new URL("./hook.ts", import.meta.url).pathname

interface HookResult {
  exitCode: number
  stdout: string
  stderr: string
}

/** Run the hook with a simulated Claude Code Bash input */
async function runHook(command: string): Promise<HookResult> {
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command } })
  const proc = Bun.spawn(["bun", HOOK_PATH], {
    stdin: new Response(input),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  return { exitCode: proc.exitCode ?? 1, stdout, stderr }
}

/** Run the hook with a Write/Edit tool input */
async function runHookForTool(toolName: string, toolInput: Record<string, unknown>): Promise<HookResult> {
  const input = JSON.stringify({ tool_name: toolName, tool_input: toolInput })
  const proc = Bun.spawn(["bun", HOOK_PATH], {
    stdin: new Response(input),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  return { exitCode: proc.exitCode ?? 1, stdout, stderr }
}

/** Check that the hook allowed (exit 0 + permissionDecision: "allow" on stdout) */
function expectAllow(result: HookResult) {
  expect(result.exitCode).toBe(0)
  const parsed = JSON.parse(result.stdout)
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("allow")
}

/** Check that the hook prompted (exit 1, no allow JSON) */
function expectPrompt(result: HookResult) {
  expect(result.exitCode).toBe(1)
}

/** Check that the hook blocked with a feedback suggestion (exit 2 + stderr) */
function expectBlock(result: HookResult, containsText?: string) {
  expect(result.exitCode).toBe(2)
  expect(result.stderr.length).toBeGreaterThan(0)
  if (containsText) {
    expect(result.stderr).toContain(containsText)
  }
}

describe("hook integration", () => {
  describe("should ALLOW (exit 0 + JSON)", () => {
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
        expectAllow(await runHook(cmd))
      })
    }
  })

  describe("git — should ALLOW safe operations (exit 0 + JSON)", () => {
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
        expectAllow(await runHook(cmd))
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
        expectPrompt(await runHook(cmd))
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
        expectPrompt(await runHook(cmd))
      })
    }
  })

  describe("transparent wrappers — should ALLOW safe wrapped commands", () => {
    const allowed = [
      "nohup bun server/index.ts",
      "nohup bun --env-file=.env.test.local server/index.ts",
      "nice bun server/index.ts",
      "nice -n 10 bun server/index.ts",
      "timeout 30 bun server/index.ts",
      "timeout --signal=TERM 30 bun server/index.ts",
      "nohup nice bun server/index.ts",
      "timeout 30 git status",
    ]

    for (const cmd of allowed) {
      test(cmd, async () => {
        expectAllow(await runHook(cmd))
      })
    }
  })

  describe("transparent wrappers — should PROMPT for unsafe wrapped commands", () => {
    const prompted = [
      "nohup rm -rf /",
      "nice -n 10 rm -rf /",
      "timeout 30 some-unknown-command",
      "nohup unknown-tool --flag",
    ]

    for (const cmd of prompted) {
      test(cmd, async () => {
        expectPrompt(await runHook(cmd))
      })
    }
  })

  test("empty command falls through", async () => {
    expectPrompt(await runHook(""))
  })

  describe("psql — should ALLOW read-only SQL (exit 0 + JSON)", () => {
    const allowed = [
      `psql postgres://user:pass@localhost:5433/db -t -c "SELECT * FROM users"`,
      `psql postgres://user:pass@localhost:5433/db -c "SELECT DISTINCT advertiser_id FROM search_index LIMIT 1" 2>&1`,
      `psql postgres://localhost/db -t -c "SELECT count(*) FROM orders"`,
      `psql -c 'SHOW search_path'`,
      `PGPASSWORD=deepcurrent psql -h localhost -p 5434 -U deepcurrent -d deepcurrent_test -c "\\dt api_keys"`,
      `psql -c "\\d+ users"`,
      `psql -c "\\l"`,
    ]

    for (const cmd of allowed) {
      test(cmd, async () => {
        expectAllow(await runHook(cmd))
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
        expectPrompt(await runHook(cmd))
      })
    }
  })

  describe("mysql — should ALLOW read-only SQL (exit 0 + JSON)", () => {
    const allowed = [
      `mysql -u root -e "SELECT * FROM users"`,
      `mysql mydb -e "SHOW TABLES"`,
      `mysql mydb --execute "SELECT count(*) FROM orders"`,
    ]

    for (const cmd of allowed) {
      test(cmd, async () => {
        expectAllow(await runHook(cmd))
      })
    }
  })

  describe("mysql — should PROMPT for writes (exit 1)", () => {
    const prompted = [
      `mysql mydb -e "DROP TABLE users"`,
      `mysql -e "INSERT INTO users VALUES (1, 'test')"`,
      // Interactive session (no -e flag) — prompt
      `mysql -u root mydb`,
    ]

    for (const cmd of prompted) {
      test(cmd, async () => {
        expectPrompt(await runHook(cmd))
      })
    }
  })

  describe("sqlite3 — should ALLOW read-only SQL (exit 0 + JSON)", () => {
    const allowed = [
      `sqlite3 db.sqlite "SELECT * FROM users"`,
      `sqlite3 -header -column db.sqlite "SELECT count(*) FROM orders"`,
    ]

    for (const cmd of allowed) {
      test(cmd, async () => {
        expectAllow(await runHook(cmd))
      })
    }
  })

  describe("sqlite3 — should PROMPT for writes (exit 1)", () => {
    const prompted = [
      `sqlite3 db.sqlite "DROP TABLE users"`,
      `sqlite3 db.sqlite "INSERT INTO users VALUES (1, 'test')"`,
      // Interactive session (no SQL arg) — prompt
      `sqlite3 db.sqlite`,
    ]

    for (const cmd of prompted) {
      test(cmd, async () => {
        expectPrompt(await runHook(cmd))
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

  test("allow response contains valid JSON with permissionDecision", async () => {
    const result = await runHook("echo hello")
    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse")
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("allow")
    expect(typeof parsed.hookSpecificOutput.permissionDecisionReason).toBe("string")
  })
})

describe("Write/Edit tool integration", () => {
  describe("Write tool", () => {
    test("safe path → allow", async () => {
      expectAllow(await runHookForTool("Write", { file_path: "/tmp/safe-file.ts" }))
    })

    test("no file_path → allow", async () => {
      expectAllow(await runHookForTool("Write", {}))
    })
  })

  describe("Edit tool", () => {
    test("safe path → allow", async () => {
      expectAllow(await runHookForTool("Edit", { file_path: "/tmp/safe-file.ts" }))
    })

    test("no file_path → allow", async () => {
      expectAllow(await runHookForTool("Edit", {}))
    })
  })
})

describe("feedback layer — should BLOCK (exit 2 + stderr suggestion)", () => {
  test("curl | python3 -c with json.loads → block with jq suggestion", async () => {
    const cmd = `curl -s https://api.example.com | python3 -c "import json, sys; print(json.loads(sys.stdin.read())['key'])"`
    expectBlock(await runHook(cmd), "jq")
  })

  test("curl | node -e with JSON.parse → block with jq suggestion", async () => {
    const cmd = `curl -s https://api.example.com | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).key))"`
    expectBlock(await runHook(cmd), "jq")
  })

  test("python3 -c with string .split() → block with shell builtins suggestion", async () => {
    const cmd = `python3 -c "print('a,b,c'.split(',')[0])"`
    expectBlock(await runHook(cmd), "shell builtins")
  })

  test("node -e with .trim() → block with shell builtins suggestion", async () => {
    const cmd = `node -e "console.log(' hello '.trim())"`
    expectBlock(await runHook(cmd), "shell builtins")
  })
})

describe("feedback layer — should NOT block legitimate usage", () => {
  test("python3 script.py → prompt (not block)", async () => {
    const result = await runHook("python3 script.py")
    // Should prompt (inspected command running a script), NOT block
    expect(result.exitCode).not.toBe(2)
  })

  test("node server.js → prompt (not block)", async () => {
    const result = await runHook("node server.js")
    // Should be allowed (no -e flag), NOT blocked
    expect(result.exitCode).not.toBe(2)
  })

  test("curl | jq → allow (already using jq)", async () => {
    const result = await runHook("curl -s https://example.com | jq .data")
    expectAllow(result)
  })
})
