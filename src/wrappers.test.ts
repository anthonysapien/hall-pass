import { describe, test, expect } from "bun:test"
import { unwrapCommand } from "./wrappers.ts"
import type { CommandInfo } from "./parser.ts"

function cmd(name: string, ...rest: string[]): CommandInfo {
  return { name, args: [name, ...rest], assigns: [] }
}

function cmdWithAssigns(name: string, assigns: { name: string; value: string }[], ...rest: string[]): CommandInfo {
  return { name, args: [name, ...rest], assigns }
}

describe("unwrapCommand", () => {
  describe("nohup", () => {
    test("nohup bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("nohup", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("nohup with env-file flag", () => {
      const result = unwrapCommand(cmd("nohup", "bun", "--env-file=.env.test", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "--env-file=.env.test", "server.ts"])
    })

    test("bare nohup (no inner command) → returns as-is", () => {
      const input = cmd("nohup")
      const result = unwrapCommand(input)
      expect(result).toBe(input)
    })

    test("preserves env var assigns", () => {
      const input = cmdWithAssigns("nohup", [{ name: "FOO", value: "bar" }], "bun", "server.ts")
      const result = unwrapCommand(input)
      expect(result.name).toBe("bun")
      expect(result.assigns).toEqual([{ name: "FOO", value: "bar" }])
    })
  })

  describe("nice", () => {
    test("nice bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("nice", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("nice -n 10 bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("nice", "-n", "10", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("nice -n10 bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("nice", "-n10", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("nice --adjustment=10 bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("nice", "--adjustment=10", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("nice --adjustment 10 bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("nice", "--adjustment", "10", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("nice -10 bun server.ts → bun server.ts (BSD form)", () => {
      const result = unwrapCommand(cmd("nice", "-10", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("bare nice → returns as-is", () => {
      const input = cmd("nice")
      expect(unwrapCommand(input)).toBe(input)
    })

    test("nice -n 10 (no inner command) → returns as-is", () => {
      const input = cmd("nice", "-n", "10")
      expect(unwrapCommand(input)).toBe(input)
    })
  })

  describe("timeout", () => {
    test("timeout 30 bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("timeout", "30", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("timeout 5s bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("timeout", "5s", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("timeout --signal=TERM 30 bun server.ts", () => {
      const result = unwrapCommand(cmd("timeout", "--signal=TERM", "30", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("timeout -s KILL 30 bun server.ts", () => {
      const result = unwrapCommand(cmd("timeout", "-s", "KILL", "30", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("timeout --kill-after=5s 30 bun server.ts", () => {
      const result = unwrapCommand(cmd("timeout", "--kill-after=5s", "30", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("timeout -k 5s 30 bun server.ts", () => {
      const result = unwrapCommand(cmd("timeout", "-k", "5s", "30", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("timeout --preserve-status --foreground 30 bun server.ts", () => {
      const result = unwrapCommand(cmd("timeout", "--preserve-status", "--foreground", "30", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("bare timeout 30 (no inner command) → returns as-is", () => {
      const input = cmd("timeout", "30")
      expect(unwrapCommand(input)).toBe(input)
    })
  })

  describe("nesting", () => {
    test("nohup nice bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("nohup", "nice", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("nohup nice -n 10 bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("nohup", "nice", "-n", "10", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })

    test("nice -n 5 timeout 30 bun server.ts → bun server.ts", () => {
      const result = unwrapCommand(cmd("nice", "-n", "5", "timeout", "30", "bun", "server.ts"))
      expect(result.name).toBe("bun")
      expect(result.args).toEqual(["bun", "server.ts"])
    })
  })

  describe("non-wrappers pass through", () => {
    test("bun server.ts → unchanged", () => {
      const input = cmd("bun", "server.ts")
      expect(unwrapCommand(input)).toBe(input)
    })

    test("git status → unchanged", () => {
      const input = cmd("git", "status")
      expect(unwrapCommand(input)).toBe(input)
    })

    test("rm -rf / → unchanged", () => {
      const input = cmd("rm", "-rf", "/")
      expect(unwrapCommand(input)).toBe(input)
    })
  })
})
