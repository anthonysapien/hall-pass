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
    ]

    for (const cmd of allowed) {
      test(cmd, async () => {
        expect(await runHook(cmd)).toBe(0)
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
