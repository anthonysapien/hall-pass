import { describe, test, expect } from "bun:test"
import { isInspectedCommandSafe } from "./inspectors.ts"
import type { CommandInfo } from "./parser.ts"

function cmd(name: string, ...rest: string[]): CommandInfo {
  return { name, args: [name, ...rest], assigns: [] }
}

describe("isInspectedCommandSafe", () => {
  describe("xargs", () => {
    test("xargs echo → safe", () => {
      expect(isInspectedCommandSafe(cmd("xargs", "echo"))).toBe(true)
    })

    test("xargs grep → safe", () => {
      expect(isInspectedCommandSafe(cmd("xargs", "grep", "-l", "foo"))).toBe(true)
    })

    test("xargs kill → safe", () => {
      expect(isInspectedCommandSafe(cmd("xargs", "kill"))).toBe(true)
    })

    test("xargs rm → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("xargs", "rm"))).toBe(false)
    })

    test("xargs rm -rf → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("xargs", "-I{}", "rm", "-rf", "{}"))).toBe(false)
    })

    test("xargs with -I flag then safe cmd → safe", () => {
      expect(isInspectedCommandSafe(cmd("xargs", "-I{}", "echo", "{}"))).toBe(true)
    })

    test("bare xargs (defaults to echo) → safe", () => {
      expect(isInspectedCommandSafe(cmd("xargs"))).toBe(true)
    })
  })

  describe("nohup", () => {
    test("always unsafe", () => {
      expect(isInspectedCommandSafe(cmd("nohup", "rm", "-rf", "/"))).toBe(false)
    })
  })

  describe("source", () => {
    test("always unsafe", () => {
      expect(isInspectedCommandSafe(cmd("source", "./evil.sh"))).toBe(false)
    })
  })

  describe("find", () => {
    test("find . -name '*.ts' → safe", () => {
      expect(isInspectedCommandSafe(cmd("find", ".", "-name", "*.ts"))).toBe(true)
    })

    test("find . -type f → safe", () => {
      expect(isInspectedCommandSafe(cmd("find", ".", "-type", "f"))).toBe(true)
    })

    test("find . -exec rm {} → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("find", ".", "-exec", "rm", "{}", ";"))).toBe(false)
    })

    test("find . -execdir rm {} → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("find", ".", "-execdir", "rm", "{}", ";"))).toBe(false)
    })

    test("find . -delete → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("find", ".", "-delete"))).toBe(false)
    })
  })

  describe("sed", () => {
    test("sed 's/foo/bar/' file → safe", () => {
      expect(isInspectedCommandSafe(cmd("sed", "s/foo/bar/", "file.txt"))).toBe(true)
    })

    test("sed -n '/pattern/p' file → safe", () => {
      expect(isInspectedCommandSafe(cmd("sed", "-n", "/pattern/p", "file.txt"))).toBe(true)
    })

    test("sed -i 's/foo/bar/' file → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("sed", "-i", "", "s/foo/bar/", "file.txt"))).toBe(false)
    })

    test("sed -i.bak 's/foo/bar/' file → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("sed", "-i.bak", "s/foo/bar/", "file.txt"))).toBe(false)
    })
  })

  describe("awk", () => {
    test("awk '{print $1}' → safe", () => {
      expect(isInspectedCommandSafe(cmd("awk", "{print $1}", "file.txt"))).toBe(true)
    })

    test("awk with system() → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("awk", "BEGIN{system(\"rm -rf /\")}"))).toBe(false)
    })

    test("awk with system () (space) → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("awk", "{system (\"evil\")}"))).toBe(false)
    })
  })

  describe("kill", () => {
    test("kill 12345 → safe", () => {
      expect(isInspectedCommandSafe(cmd("kill", "12345"))).toBe(true)
    })

    test("kill -9 12345 → safe", () => {
      expect(isInspectedCommandSafe(cmd("kill", "-9", "12345"))).toBe(true)
    })

    test("kill -TERM 12345 → safe", () => {
      expect(isInspectedCommandSafe(cmd("kill", "-TERM", "12345"))).toBe(true)
    })

    test("kill -9 1 → unsafe (init)", () => {
      expect(isInspectedCommandSafe(cmd("kill", "-9", "1"))).toBe(false)
    })

    test("kill -9 -1 → unsafe (all processes)", () => {
      expect(isInspectedCommandSafe(cmd("kill", "-9", "-1"))).toBe(false)
    })

    test("kill 1 → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("kill", "1"))).toBe(false)
    })
  })

  describe("chmod", () => {
    test("chmod 644 file → safe", () => {
      expect(isInspectedCommandSafe(cmd("chmod", "644", "file.txt"))).toBe(true)
    })

    test("chmod 755 file → safe", () => {
      expect(isInspectedCommandSafe(cmd("chmod", "755", "script.sh"))).toBe(true)
    })

    test("chmod u+x file → safe", () => {
      expect(isInspectedCommandSafe(cmd("chmod", "u+x", "script.sh"))).toBe(true)
    })

    test("chmod 777 file → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("chmod", "777", "file"))).toBe(false)
    })

    test("chmod u+s file → unsafe (setuid)", () => {
      expect(isInspectedCommandSafe(cmd("chmod", "u+s", "binary"))).toBe(false)
    })

    test("chmod 4755 file → unsafe (setuid)", () => {
      expect(isInspectedCommandSafe(cmd("chmod", "4755", "binary"))).toBe(false)
    })
  })

  describe("docker", () => {
    test("docker ps → safe", () => {
      expect(isInspectedCommandSafe(cmd("docker", "ps"))).toBe(true)
    })

    test("docker logs container → safe", () => {
      expect(isInspectedCommandSafe(cmd("docker", "logs", "my-container"))).toBe(true)
    })

    test("docker build -t app . → safe", () => {
      expect(isInspectedCommandSafe(cmd("docker", "build", "-t", "myapp", "."))).toBe(true)
    })

    test("docker run app → safe", () => {
      expect(isInspectedCommandSafe(cmd("docker", "run", "myapp"))).toBe(true)
    })

    test("docker run --privileged → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("docker", "run", "--privileged", "ubuntu"))).toBe(false)
    })

    test("docker run --pid=host → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("docker", "run", "--pid=host", "ubuntu"))).toBe(false)
    })

    test("docker run -v /:/host → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("docker", "run", "-v", "/:/host", "ubuntu"))).toBe(false)
    })

    test("docker stop container → safe", () => {
      expect(isInspectedCommandSafe(cmd("docker", "stop", "my-container"))).toBe(true)
    })
  })

  describe("node", () => {
    test("node script.js → safe", () => {
      expect(isInspectedCommandSafe(cmd("node", "script.js"))).toBe(true)
    })

    test("node -e 'code' → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("node", "-e", "process.exit(1)"))).toBe(false)
    })

    test("node --eval 'code' → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("node", "--eval", "code"))).toBe(false)
    })

    test("node -p 'expr' → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("node", "-p", "1+1"))).toBe(false)
    })
  })

  describe("python/python3", () => {
    test("python script.py → safe", () => {
      expect(isInspectedCommandSafe(cmd("python", "script.py"))).toBe(true)
    })

    test("python -c 'code' → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("python", "-c", "import os; os.system('evil')"))).toBe(false)
    })

    test("python3 -c 'code' → unsafe", () => {
      expect(isInspectedCommandSafe(cmd("python3", "-c", "code"))).toBe(false)
    })

    test("python3 manage.py runserver → safe", () => {
      expect(isInspectedCommandSafe(cmd("python3", "manage.py", "runserver"))).toBe(true)
    })
  })

  test("unknown command returns false", () => {
    expect(isInspectedCommandSafe(cmd("unknown-tool", "--flag"))).toBe(false)
  })
})
