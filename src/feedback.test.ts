import { describe, test, expect } from "bun:test"
import { checkFeedbackRules } from "./feedback.ts"
import type { CommandInfo } from "./parser.ts"

/** Helper to create a CommandInfo */
function cmd(name: string, args: string[]): CommandInfo {
  return { name, args: [name, ...args], assigns: [] }
}

describe("feedback rules", () => {
  describe("json-parsing rule", () => {
    test("curl | python3 -c with json.loads → blocks", () => {
      const cmds = [
        cmd("curl", ["https://api.example.com/data"]),
        cmd("python3", ["-c", "import json, sys; data = json.loads(sys.stdin.read()); print(data['key'])"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("jq")
      expect(result).toContain("hall-pass")
    })

    test("curl | node -e with JSON.parse → blocks", () => {
      const cmds = [
        cmd("curl", ["-s", "https://api.example.com"]),
        cmd("node", ["-e", "const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.key)"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("jq")
    })

    test("wget | python3 -c with json → blocks", () => {
      const cmds = [
        cmd("wget", ["-qO-", "https://api.example.com"]),
        cmd("python3", ["-c", "import json; print(json.load(open('/dev/stdin')))"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("jq")
    })

    test("standalone python3 -c with JSON.parse (no curl) → still blocks", () => {
      const cmds = [
        cmd("python3", ["-c", "import json; data = json.loads('{\"a\":1}'); print(data)"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("jq")
    })

    test("node --eval with JSON.stringify → blocks", () => {
      const cmds = [
        cmd("node", ["--eval", "console.log(JSON.stringify({a: 1}))"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("jq")
    })

    test("python3 -c without JSON keywords → no match", () => {
      const cmds = [
        cmd("python3", ["-c", "print('hello world')"]),
      ]
      expect(checkFeedbackRules(cmds)).toBeNull()
    })

    test("curl | jq (already correct) → no match", () => {
      const cmds = [
        cmd("curl", ["-s", "https://api.example.com"]),
        cmd("jq", [".data"]),
      ]
      expect(checkFeedbackRules(cmds)).toBeNull()
    })
  })

  describe("inline-code-as-tool rule", () => {
    test("python3 -c with .split() → blocks", () => {
      const cmds = [
        cmd("python3", ["-c", "print('a,b,c'.split(',')[0])"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("shell builtins")
      expect(result).toContain("sed")
    })

    test("node -e with .trim() → blocks", () => {
      const cmds = [
        cmd("node", ["-e", "console.log(' hello '.trim())"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("shell builtins")
    })

    test("python3 -c with .replace() → blocks", () => {
      const cmds = [
        cmd("python3", ["-c", "print('hello world'.replace('world', 'there'))"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("shell builtins")
    })

    test("python3 -c with re.sub → blocks", () => {
      const cmds = [
        cmd("python3", ["-c", "import re; print(re.sub(r'\\d+', 'N', 'abc123'))"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("shell builtins")
    })

    test("python3 -c with JSON code → matches json rule, not string rule", () => {
      // JSON rule takes priority since it's first
      const cmds = [
        cmd("python3", ["-c", "import json; print(json.loads('{\"a\":1}'))"]),
      ]
      const result = checkFeedbackRules(cmds)
      expect(result).toContain("jq")
      expect(result).not.toContain("shell builtins")
    })

    test("node -e with complex logic (no string op keywords) → no match", () => {
      const cmds = [
        cmd("node", ["-e", "const x = 1 + 2; console.log(x)"]),
      ]
      expect(checkFeedbackRules(cmds)).toBeNull()
    })
  })

  describe("should NOT match", () => {
    test("python3 running a script file → no match", () => {
      const cmds = [cmd("python3", ["script.py"])]
      expect(checkFeedbackRules(cmds)).toBeNull()
    })

    test("python3 with -m flag → no match", () => {
      const cmds = [cmd("python3", ["-m", "http.server", "8080"])]
      expect(checkFeedbackRules(cmds)).toBeNull()
    })

    test("node running a script → no match", () => {
      const cmds = [cmd("node", ["server.js"])]
      expect(checkFeedbackRules(cmds)).toBeNull()
    })

    test("safe commands only → no match", () => {
      const cmds = [
        cmd("curl", ["-s", "https://example.com"]),
        cmd("jq", [".data"]),
        cmd("sort", []),
      ]
      expect(checkFeedbackRules(cmds)).toBeNull()
    })

    test("git commands → no match", () => {
      const cmds = [cmd("git", ["status"])]
      expect(checkFeedbackRules(cmds)).toBeNull()
    })

    test("empty command list → no match", () => {
      expect(checkFeedbackRules([])).toBeNull()
    })
  })
})
