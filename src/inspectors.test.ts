import { describe, test, expect } from "bun:test"
import { isCommandSafe } from "./inspectors.ts"
import type { CommandInfo } from "./parser.ts"

function cmd(name: string, ...rest: string[]): CommandInfo {
  return { name, args: [name, ...rest], assigns: [] }
}

describe("isCommandSafe", () => {
  describe("xargs", () => {
    test("xargs echo → safe", () => {
      expect(isCommandSafe(cmd("xargs", "echo"))).toBe(true)
    })

    test("xargs grep → safe", () => {
      expect(isCommandSafe(cmd("xargs", "grep", "-l", "foo"))).toBe(true)
    })

    test("xargs kill → safe (kill inspector sees no dangerous PIDs)", () => {
      expect(isCommandSafe(cmd("xargs", "kill"))).toBe(true)
    })

    test("xargs rm → unsafe", () => {
      expect(isCommandSafe(cmd("xargs", "rm"))).toBe(false)
    })

    test("xargs rm -rf → unsafe", () => {
      expect(isCommandSafe(cmd("xargs", "-I{}", "rm", "-rf", "{}"))).toBe(false)
    })

    test("xargs with -I flag then safe cmd → safe", () => {
      expect(isCommandSafe(cmd("xargs", "-I{}", "echo", "{}"))).toBe(true)
    })

    test("bare xargs (defaults to echo) → safe", () => {
      expect(isCommandSafe(cmd("xargs"))).toBe(true)
    })
  })

  describe("source", () => {
    test("always unsafe", () => {
      expect(isCommandSafe(cmd("source", "./evil.sh"))).toBe(false)
    })
  })

  describe("find", () => {
    test("find . -name '*.ts' → safe", () => {
      expect(isCommandSafe(cmd("find", ".", "-name", "*.ts"))).toBe(true)
    })

    test("find . -type f → safe", () => {
      expect(isCommandSafe(cmd("find", ".", "-type", "f"))).toBe(true)
    })

    test("find . -exec grep -l 'pattern' {} \\; → safe (grep is safelisted)", () => {
      expect(isCommandSafe(cmd("find", ".", "-exec", "grep", "-l", "pattern", "{}", ";"))).toBe(true)
    })

    test("find . -exec cat {} + → safe (cat is safelisted)", () => {
      expect(isCommandSafe(cmd("find", ".", "-exec", "cat", "{}", "+"))).toBe(true)
    })

    test("find . -exec rm {} \\; → unsafe (rm not safelisted)", () => {
      expect(isCommandSafe(cmd("find", ".", "-exec", "rm", "{}", ";"))).toBe(false)
    })

    test("find . -exec sed -i 's/a/b/' {} \\; → unsafe (sed inspector catches -i)", () => {
      expect(isCommandSafe(cmd("find", ".", "-exec", "sed", "-i", "s/a/b/", "{}", ";"))).toBe(false)
    })

    test("find . -exec sed 's/a/b/' {} \\; → safe (sed without -i is safe)", () => {
      expect(isCommandSafe(cmd("find", ".", "-exec", "sed", "s/a/b/", "{}", ";"))).toBe(true)
    })

    test("find . -execdir rm {} \\; → unsafe (rm not safelisted)", () => {
      expect(isCommandSafe(cmd("find", ".", "-execdir", "rm", "{}", ";"))).toBe(false)
    })

    test("find . -execdir cat {} \\; → safe (cat is safelisted)", () => {
      expect(isCommandSafe(cmd("find", ".", "-execdir", "cat", "{}", ";"))).toBe(true)
    })

    test("find . -delete → unsafe", () => {
      expect(isCommandSafe(cmd("find", ".", "-delete"))).toBe(false)
    })

    test("find . -ok rm {} \\; → unsafe", () => {
      expect(isCommandSafe(cmd("find", ".", "-ok", "rm", "{}", ";"))).toBe(false)
    })

    test("find . -exec grep -l 'foo' {} \\; -exec wc -l {} \\; → safe (both safelisted)", () => {
      expect(isCommandSafe(cmd("find", ".", "-exec", "grep", "-l", "foo", "{}", ";", "-exec", "wc", "-l", "{}", ";"))).toBe(true)
    })

    test("find . -exec grep 'foo' {} \\; -exec rm {} \\; → unsafe (rm not safe)", () => {
      expect(isCommandSafe(cmd("find", ".", "-exec", "grep", "foo", "{}", ";", "-exec", "rm", "{}", ";"))).toBe(false)
    })
  })

  describe("sed", () => {
    test("sed 's/foo/bar/' file → safe", () => {
      expect(isCommandSafe(cmd("sed", "s/foo/bar/", "file.txt"))).toBe(true)
    })

    test("sed -n '/pattern/p' file → safe", () => {
      expect(isCommandSafe(cmd("sed", "-n", "/pattern/p", "file.txt"))).toBe(true)
    })

    test("sed -i 's/foo/bar/' file → unsafe", () => {
      expect(isCommandSafe(cmd("sed", "-i", "", "s/foo/bar/", "file.txt"))).toBe(false)
    })

    test("sed -i.bak 's/foo/bar/' file → unsafe", () => {
      expect(isCommandSafe(cmd("sed", "-i.bak", "s/foo/bar/", "file.txt"))).toBe(false)
    })
  })

  describe("awk", () => {
    test("awk '{print $1}' → safe", () => {
      expect(isCommandSafe(cmd("awk", "{print $1}", "file.txt"))).toBe(true)
    })

    test("awk with system() → unsafe", () => {
      expect(isCommandSafe(cmd("awk", "BEGIN{system(\"rm -rf /\")}"))).toBe(false)
    })

    test("awk with system () (space) → unsafe", () => {
      expect(isCommandSafe(cmd("awk", "{system (\"evil\")}"))).toBe(false)
    })
  })

  describe("kill", () => {
    test("kill 12345 → safe", () => {
      expect(isCommandSafe(cmd("kill", "12345"))).toBe(true)
    })

    test("kill -9 12345 → safe", () => {
      expect(isCommandSafe(cmd("kill", "-9", "12345"))).toBe(true)
    })

    test("kill -TERM 12345 → safe", () => {
      expect(isCommandSafe(cmd("kill", "-TERM", "12345"))).toBe(true)
    })

    test("kill -9 1 → unsafe (init)", () => {
      expect(isCommandSafe(cmd("kill", "-9", "1"))).toBe(false)
    })

    test("kill -9 -1 → unsafe (all processes)", () => {
      expect(isCommandSafe(cmd("kill", "-9", "-1"))).toBe(false)
    })

    test("kill 1 → unsafe", () => {
      expect(isCommandSafe(cmd("kill", "1"))).toBe(false)
    })
  })

  describe("chmod", () => {
    test("chmod 644 file → safe", () => {
      expect(isCommandSafe(cmd("chmod", "644", "file.txt"))).toBe(true)
    })

    test("chmod 755 file → safe", () => {
      expect(isCommandSafe(cmd("chmod", "755", "script.sh"))).toBe(true)
    })

    test("chmod u+x file → safe", () => {
      expect(isCommandSafe(cmd("chmod", "u+x", "script.sh"))).toBe(true)
    })

    test("chmod 777 file → unsafe", () => {
      expect(isCommandSafe(cmd("chmod", "777", "file"))).toBe(false)
    })

    test("chmod u+s file → unsafe (setuid)", () => {
      expect(isCommandSafe(cmd("chmod", "u+s", "binary"))).toBe(false)
    })

    test("chmod 4755 file → unsafe (setuid)", () => {
      expect(isCommandSafe(cmd("chmod", "4755", "binary"))).toBe(false)
    })
  })

  describe("docker", () => {
    test("docker ps → safe", () => {
      expect(isCommandSafe(cmd("docker", "ps"))).toBe(true)
    })

    test("docker logs container → safe", () => {
      expect(isCommandSafe(cmd("docker", "logs", "my-container"))).toBe(true)
    })

    test("docker build -t app . → safe", () => {
      expect(isCommandSafe(cmd("docker", "build", "-t", "myapp", "."))).toBe(true)
    })

    test("docker run app → safe", () => {
      expect(isCommandSafe(cmd("docker", "run", "myapp"))).toBe(true)
    })

    test("docker run --privileged → unsafe", () => {
      expect(isCommandSafe(cmd("docker", "run", "--privileged", "ubuntu"))).toBe(false)
    })

    test("docker run --pid=host → unsafe", () => {
      expect(isCommandSafe(cmd("docker", "run", "--pid=host", "ubuntu"))).toBe(false)
    })

    test("docker run -v /:/host → unsafe", () => {
      expect(isCommandSafe(cmd("docker", "run", "-v", "/:/host", "ubuntu"))).toBe(false)
    })

    test("docker stop container → safe", () => {
      expect(isCommandSafe(cmd("docker", "stop", "my-container"))).toBe(true)
    })
  })

  describe("node", () => {
    test("node script.js → safe", () => {
      expect(isCommandSafe(cmd("node", "script.js"))).toBe(true)
    })

    test("node -e 'code' → unsafe", () => {
      expect(isCommandSafe(cmd("node", "-e", "process.exit(1)"))).toBe(false)
    })

    test("node --eval 'code' → unsafe", () => {
      expect(isCommandSafe(cmd("node", "--eval", "code"))).toBe(false)
    })

    test("node -p 'expr' → unsafe", () => {
      expect(isCommandSafe(cmd("node", "-p", "1+1"))).toBe(false)
    })
  })

  describe("python/python3", () => {
    test("python script.py → safe", () => {
      expect(isCommandSafe(cmd("python", "script.py"))).toBe(true)
    })

    test("python -c 'code' → unsafe", () => {
      expect(isCommandSafe(cmd("python", "-c", "import os; os.system('evil')"))).toBe(false)
    })

    test("python3 -c 'code' → unsafe", () => {
      expect(isCommandSafe(cmd("python3", "-c", "code"))).toBe(false)
    })

    test("python3 manage.py runserver → safe", () => {
      expect(isCommandSafe(cmd("python3", "manage.py", "runserver"))).toBe(true)
    })
  })

  test("unknown command returns false", () => {
    expect(isCommandSafe(cmd("unknown-tool", "--flag"))).toBe(false)
  })
})
