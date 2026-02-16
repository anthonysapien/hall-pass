import { describe, test, expect } from "bun:test"
import { evaluateBashCommand, createEvalContext, type EvalContext } from "./evaluate.ts"
import type { CommandInfo } from "./parser.ts"
import type { HallPassConfig } from "./config.ts"

function cmd(name: string, ...rest: string[]): CommandInfo {
  return { name, args: [name, ...rest], assigns: [] }
}

/** Minimal config for unit tests — no path protection, no custom commands. */
const TEST_CONFIG: HallPassConfig = {
  commands: { safe: [], db_clients: [] },
  git: { protected_branches: [] },
  paths: { protected: [], read_only: [], no_delete: [] },
  audit: { enabled: false, path: "" },
  debug: { enabled: false },
}

function makeCtx(pipelineCommands: CommandInfo[] = []): EvalContext {
  return createEvalContext(TEST_CONFIG, pipelineCommands)
}

function expectAllow(cmdInfo: CommandInfo, ctx?: EvalContext) {
  const result = evaluateBashCommand(cmdInfo, ctx ?? makeCtx())
  expect(result.decision).toBe("allow")
}

function expectPrompt(cmdInfo: CommandInfo, ctx?: EvalContext) {
  const result = evaluateBashCommand(cmdInfo, ctx ?? makeCtx())
  expect(result.decision).toBe("prompt")
}

describe("evaluateBashCommand", () => {
  describe("xargs", () => {
    test("xargs echo → allow", () => {
      expectAllow(cmd("xargs", "echo"))
    })

    test("xargs grep → allow", () => {
      expectAllow(cmd("xargs", "grep", "-l", "foo"))
    })

    test("xargs kill → allow (kill inspector sees no dangerous PIDs)", () => {
      expectAllow(cmd("xargs", "kill"))
    })

    test("xargs rm → prompt", () => {
      expectPrompt(cmd("xargs", "rm"))
    })

    test("xargs rm -rf → prompt", () => {
      expectPrompt(cmd("xargs", "-I{}", "rm", "-rf", "{}"))
    })

    test("xargs with -I flag then safe cmd → allow", () => {
      expectAllow(cmd("xargs", "-I{}", "echo", "{}"))
    })

    test("bare xargs (defaults to echo) → allow", () => {
      expectAllow(cmd("xargs"))
    })
  })

  describe("source", () => {
    test("always prompts", () => {
      expectPrompt(cmd("source", "./evil.sh"))
    })
  })

  describe("find", () => {
    test("find . -name '*.ts' → allow", () => {
      expectAllow(cmd("find", ".", "-name", "*.ts"))
    })

    test("find . -type f → allow", () => {
      expectAllow(cmd("find", ".", "-type", "f"))
    })

    test("find . -exec grep -l 'pattern' {} \\; → allow (grep is safelisted)", () => {
      expectAllow(cmd("find", ".", "-exec", "grep", "-l", "pattern", "{}", ";"))
    })

    test("find . -exec cat {} + → allow (cat is safelisted)", () => {
      expectAllow(cmd("find", ".", "-exec", "cat", "{}", "+"))
    })

    test("find . -exec rm {} \\; → prompt (rm not safelisted)", () => {
      expectPrompt(cmd("find", ".", "-exec", "rm", "{}", ";"))
    })

    test("find . -exec sed -i 's/a/b/' {} \\; → prompt (sed inspector catches -i)", () => {
      expectPrompt(cmd("find", ".", "-exec", "sed", "-i", "s/a/b/", "{}", ";"))
    })

    test("find . -exec sed 's/a/b/' {} \\; → allow (sed without -i is safe)", () => {
      expectAllow(cmd("find", ".", "-exec", "sed", "s/a/b/", "{}", ";"))
    })

    test("find . -execdir rm {} \\; → prompt (rm not safelisted)", () => {
      expectPrompt(cmd("find", ".", "-execdir", "rm", "{}", ";"))
    })

    test("find . -execdir cat {} \\; → allow (cat is safelisted)", () => {
      expectAllow(cmd("find", ".", "-execdir", "cat", "{}", ";"))
    })

    test("find . -delete → prompt", () => {
      expectPrompt(cmd("find", ".", "-delete"))
    })

    test("find . -ok rm {} \\; → prompt", () => {
      expectPrompt(cmd("find", ".", "-ok", "rm", "{}", ";"))
    })

    test("find . -exec grep -l 'foo' {} \\; -exec wc -l {} \\; → allow (both safelisted)", () => {
      expectAllow(cmd("find", ".", "-exec", "grep", "-l", "foo", "{}", ";", "-exec", "wc", "-l", "{}", ";"))
    })

    test("find . -exec grep 'foo' {} \\; -exec rm {} \\; → prompt (rm not safe)", () => {
      expectPrompt(cmd("find", ".", "-exec", "grep", "foo", "{}", ";", "-exec", "rm", "{}", ";"))
    })
  })

  describe("sed", () => {
    test("sed 's/foo/bar/' file → allow", () => {
      expectAllow(cmd("sed", "s/foo/bar/", "file.txt"))
    })

    test("sed -n '/pattern/p' file → allow", () => {
      expectAllow(cmd("sed", "-n", "/pattern/p", "file.txt"))
    })

    test("sed -i 's/foo/bar/' file → prompt", () => {
      expectPrompt(cmd("sed", "-i", "", "s/foo/bar/", "file.txt"))
    })

    test("sed -i.bak 's/foo/bar/' file → prompt", () => {
      expectPrompt(cmd("sed", "-i.bak", "s/foo/bar/", "file.txt"))
    })
  })

  describe("awk", () => {
    test("awk '{print $1}' → allow", () => {
      expectAllow(cmd("awk", "{print $1}", "file.txt"))
    })

    test("awk with system() → prompt", () => {
      expectPrompt(cmd("awk", "BEGIN{system(\"rm -rf /\")}"))
    })

    test("awk with system () (space) → prompt", () => {
      expectPrompt(cmd("awk", "{system (\"evil\")}"))
    })
  })

  describe("kill", () => {
    test("kill 12345 → allow", () => {
      expectAllow(cmd("kill", "12345"))
    })

    test("kill -9 12345 → allow", () => {
      expectAllow(cmd("kill", "-9", "12345"))
    })

    test("kill -TERM 12345 → allow", () => {
      expectAllow(cmd("kill", "-TERM", "12345"))
    })

    test("kill -9 1 → prompt (init)", () => {
      expectPrompt(cmd("kill", "-9", "1"))
    })

    test("kill -9 -1 → prompt (all processes)", () => {
      expectPrompt(cmd("kill", "-9", "-1"))
    })

    test("kill 1 → prompt", () => {
      expectPrompt(cmd("kill", "1"))
    })
  })

  describe("chmod", () => {
    test("chmod 644 file → allow", () => {
      expectAllow(cmd("chmod", "644", "file.txt"))
    })

    test("chmod 755 file → allow", () => {
      expectAllow(cmd("chmod", "755", "script.sh"))
    })

    test("chmod u+x file → allow", () => {
      expectAllow(cmd("chmod", "u+x", "script.sh"))
    })

    test("chmod 777 file → prompt", () => {
      expectPrompt(cmd("chmod", "777", "file"))
    })

    test("chmod u+s file → prompt (setuid)", () => {
      expectPrompt(cmd("chmod", "u+s", "binary"))
    })

    test("chmod 4755 file → prompt (setuid)", () => {
      expectPrompt(cmd("chmod", "4755", "binary"))
    })
  })

  describe("docker", () => {
    test("docker ps → allow", () => {
      expectAllow(cmd("docker", "ps"))
    })

    test("docker logs container → allow", () => {
      expectAllow(cmd("docker", "logs", "my-container"))
    })

    test("docker build -t app . → allow", () => {
      expectAllow(cmd("docker", "build", "-t", "myapp", "."))
    })

    test("docker run app → allow", () => {
      expectAllow(cmd("docker", "run", "myapp"))
    })

    test("docker run --privileged → prompt", () => {
      expectPrompt(cmd("docker", "run", "--privileged", "ubuntu"))
    })

    test("docker run --pid=host → prompt", () => {
      expectPrompt(cmd("docker", "run", "--pid=host", "ubuntu"))
    })

    test("docker run -v /:/host → prompt", () => {
      expectPrompt(cmd("docker", "run", "-v", "/:/host", "ubuntu"))
    })

    test("docker stop container → allow", () => {
      expectAllow(cmd("docker", "stop", "my-container"))
    })
  })

  describe("node", () => {
    test("node script.js → allow", () => {
      expectAllow(cmd("node", "script.js"))
    })

    test("node -e 'code' → prompt", () => {
      expectPrompt(cmd("node", "-e", "process.exit(1)"))
    })

    test("node --eval 'code' → prompt", () => {
      expectPrompt(cmd("node", "--eval", "code"))
    })

    test("node -p 'expr' → prompt", () => {
      expectPrompt(cmd("node", "-p", "1+1"))
    })
  })

  describe("python/python3", () => {
    test("python script.py → allow", () => {
      expectAllow(cmd("python", "script.py"))
    })

    test("python -c 'code' → prompt", () => {
      expectPrompt(cmd("python", "-c", "import os; os.system('evil')"))
    })

    test("python3 -c 'code' → prompt", () => {
      expectPrompt(cmd("python3", "-c", "code"))
    })

    test("python3 manage.py runserver → allow", () => {
      expectAllow(cmd("python3", "manage.py", "runserver"))
    })
  })

  test("unknown command returns pass (no opinion)", () => {
    const result = evaluateBashCommand(cmd("unknown-tool", "--flag"), makeCtx())
    expect(result.decision).toBe("pass")
  })

  describe("DB clients via evaluateBashCommand", () => {
    test("psql with read-only SQL → allow", () => {
      expectAllow(cmd("psql", "-c", "SELECT * FROM users"))
    })

    test("psql with write SQL → prompt", () => {
      expectPrompt(cmd("psql", "-c", "DROP TABLE users"))
    })

    test("mysql with read-only SQL → allow", () => {
      expectAllow(cmd("mysql", "-e", "SELECT * FROM users"))
    })

    test("mysql interactive session → prompt", () => {
      expectPrompt(cmd("mysql", "-u", "root", "mydb"))
    })

    test("sqlite3 with read-only SQL → allow", () => {
      expectAllow(cmd("sqlite3", "db.sqlite", "SELECT * FROM users"))
    })

    test("sqlite3 with write SQL → prompt", () => {
      expectPrompt(cmd("sqlite3", "db.sqlite", "DROP TABLE users"))
    })
  })

  describe("git via evaluateBashCommand", () => {
    test("git status → allow", () => {
      expectAllow(cmd("git", "status"))
    })

    test("git push --force → prompt", () => {
      expectPrompt(cmd("git", "push", "--force"))
    })

    test("git push origin main → prompt (default protected branch)", () => {
      expectPrompt(cmd("git", "push", "origin", "main"))
    })

    test("git with custom protected branches", () => {
      const config: HallPassConfig = {
        ...TEST_CONFIG,
        git: { protected_branches: ["release"] },
      }
      const ctx = createEvalContext(config, [])
      // "release" is protected, "main" falls back to defaults only when no config branches
      expectPrompt(cmd("git", "push", "origin", "release"), ctx)
    })
  })

  describe("recursive evaluation", () => {
    test("find -exec python3 -c with JSON → feedback (recursive)", () => {
      const c = cmd("find", ".", "-exec", "python3", "-c", "json.loads(data)", "{}", ";")
      const result = evaluateBashCommand(c, makeCtx())
      expect(result.decision).toBe("feedback")
    })

    test("xargs with python3 -c with string ops → feedback (recursive)", () => {
      const c = cmd("xargs", "python3", "-c", "print('a,b,c'.split(',')[0])")
      const result = evaluateBashCommand(c, makeCtx())
      expect(result.decision).toBe("feedback")
    })
  })
})
