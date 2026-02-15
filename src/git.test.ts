import { describe, test, expect } from "bun:test"
import { isGitCommandSafe } from "./git.ts"

describe("isGitCommandSafe", () => {
  describe("read-only commands — should be safe", () => {
    const safe = [
      "git status",
      "git log --oneline -5",
      "git diff",
      "git diff --stat",
      "git diff HEAD~3",
      "git show HEAD",
      "git branch",
      "git branch -a",
      "git remote -v",
      "git rev-parse HEAD",
      "git log --oneline --all -- docs/",
      "git shortlog -sn",
      "git blame src/hook.ts",
      "git describe --tags",
      "git ls-files",
      "git cat-file -p HEAD",
      "git reflog",
      "git config user.email",
    ]

    for (const cmd of safe) {
      test(cmd, () => expect(isGitCommandSafe(cmd)).toBe(true))
    }
  })

  describe("safe local writes — should be safe", () => {
    const safe = [
      "git add .",
      "git add -A",
      "git add src/hook.ts src/parser.ts",
      "git commit -m 'feat: add feature'",
      'git commit -m "fix: something"',
      "git stash",
      "git stash pop",
      "git stash list",
      "git fetch",
      "git fetch origin",
      "git pull",
      "git pull --rebase",
      "git merge feature-branch",
      "git cherry-pick abc123",
      "git revert abc123",
    ]

    for (const cmd of safe) {
      test(cmd, () => expect(isGitCommandSafe(cmd)).toBe(true))
    }
  })

  describe("push/rebase on feature branches — should be safe", () => {
    const safe = [
      "git push",
      "git push origin",
      "git push origin feat/search",
      "git push -u origin feat/search",
      "git push origin HEAD",
      "git rebase feat/other",
    ]

    for (const cmd of safe) {
      test(cmd, () => expect(isGitCommandSafe(cmd)).toBe(true))
    }
  })

  describe("push to protected branches — should prompt", () => {
    const dangerous = [
      "git push origin main",
      "git push origin master",
      "git push origin staging",
      "git push origin production",
      "git push origin HEAD:main",
    ]

    for (const cmd of dangerous) {
      test(cmd, () => expect(isGitCommandSafe(cmd)).toBe(false))
    }
  })

  describe("destructive operations — should prompt", () => {
    const dangerous = [
      // Force push
      "git push --force",
      "git push -f origin feat/search",
      "git push --force-with-lease",
      // Reset
      "git reset --hard",
      "git reset --hard HEAD~3",
      "git reset --hard origin/main",
      // Clean
      "git clean -f",
      "git clean -fd",
      // Discard all changes
      "git checkout .",
      "git restore .",
      // Delete branch
      "git branch -D feat/old",
      "git branch -d feat/old",
      // Stash destruction
      "git stash drop",
      "git stash clear",
    ]

    for (const cmd of dangerous) {
      test(cmd, () => expect(isGitCommandSafe(cmd)).toBe(false))
    }
  })

  describe("git with path prefix — should still work", () => {
    test("git -C /path status", () => {
      expect(isGitCommandSafe("git -C /some/path status")).toBe(true)
    })

    test("git -C /path push --force", () => {
      expect(isGitCommandSafe("git -C /some/path push --force")).toBe(false)
    })

    test("git -C /path add .", () => {
      expect(isGitCommandSafe("git -C /some/path add .")).toBe(true)
    })

    test("git -C /path reset --hard", () => {
      expect(isGitCommandSafe("git -C /some/path reset --hard")).toBe(false)
    })
  })

  test("bare git — safe (shows help)", () => {
    expect(isGitCommandSafe("git")).toBe(true)
  })
})
