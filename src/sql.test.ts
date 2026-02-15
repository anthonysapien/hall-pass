import { describe, test, expect } from "bun:test"
import { extractSqlFromArgs, extractSqlFromPsql, isSqlReadOnly } from "./sql.ts"

describe("extractSqlFromArgs", () => {
  describe("psql", () => {
    test("-c flag", () => {
      const args = ["psql", "postgres://user:pass@localhost:5433/db", "-t", "-c", "SELECT * FROM users"]
      expect(extractSqlFromArgs("psql", args)).toBe("SELECT * FROM users")
    })

    test("--command flag", () => {
      const args = ["psql", "--command", "EXPLAIN SELECT 1"]
      expect(extractSqlFromArgs("psql", args)).toBe("EXPLAIN SELECT 1")
    })

    test("--command=value form", () => {
      const args = ["psql", "--command=EXPLAIN SELECT 1"]
      expect(extractSqlFromArgs("psql", args)).toBe("EXPLAIN SELECT 1")
    })

    test("no -c flag returns null", () => {
      const args = ["psql", "postgres://localhost:5433/db"]
      expect(extractSqlFromArgs("psql", args)).toBeNull()
    })

    test("complex connection string with -c", () => {
      const args = ["psql", "postgres://dc:dc@localhost:5433/dc", "-t", "-c", "SELECT DISTINCT id FROM search_index LIMIT 1"]
      expect(extractSqlFromArgs("psql", args)).toBe("SELECT DISTINCT id FROM search_index LIMIT 1")
    })
  })

  describe("mysql", () => {
    test("-e flag", () => {
      const args = ["mysql", "-u", "root", "-e", "SELECT * FROM users"]
      expect(extractSqlFromArgs("mysql", args)).toBe("SELECT * FROM users")
    })

    test("--execute flag", () => {
      const args = ["mysql", "mydb", "--execute", "SHOW TABLES"]
      expect(extractSqlFromArgs("mysql", args)).toBe("SHOW TABLES")
    })

    test("--execute=value form", () => {
      const args = ["mysql", "mydb", "--execute=SHOW TABLES"]
      expect(extractSqlFromArgs("mysql", args)).toBe("SHOW TABLES")
    })

    test("no -e flag returns null (interactive)", () => {
      const args = ["mysql", "-u", "root", "mydb"]
      expect(extractSqlFromArgs("mysql", args)).toBeNull()
    })
  })

  describe("sqlite3", () => {
    test("positional SQL after db path", () => {
      const args = ["sqlite3", "db.sqlite", "SELECT * FROM users"]
      expect(extractSqlFromArgs("sqlite3", args)).toBe("SELECT * FROM users")
    })

    test("with flags before db path", () => {
      const args = ["sqlite3", "-header", "-column", "db.sqlite", "SELECT count(*) FROM orders"]
      expect(extractSqlFromArgs("sqlite3", args)).toBe("SELECT count(*) FROM orders")
    })

    test("with -cmd flag (skips value)", () => {
      const args = ["sqlite3", "-cmd", ".headers on", "test.db", "SELECT 1"]
      expect(extractSqlFromArgs("sqlite3", args)).toBe("SELECT 1")
    })

    test("no SQL arg returns null (interactive)", () => {
      const args = ["sqlite3", "db.sqlite"]
      expect(extractSqlFromArgs("sqlite3", args)).toBeNull()
    })

    test("no args at all returns null", () => {
      const args = ["sqlite3"]
      expect(extractSqlFromArgs("sqlite3", args)).toBeNull()
    })
  })
})

describe("extractSqlFromPsql (deprecated, backward compat)", () => {
  test("double-quoted -c", () => {
    const cmd = `psql postgres://user:pass@localhost:5433/db -t -c "SELECT * FROM users" 2>&1`
    expect(extractSqlFromPsql(cmd)).toBe("SELECT * FROM users")
  })

  test("single-quoted -c", () => {
    const cmd = `psql -c 'SELECT count(*) FROM orders'`
    expect(extractSqlFromPsql(cmd)).toBe("SELECT count(*) FROM orders")
  })

  test("no -c flag returns null", () => {
    const cmd = `psql postgres://localhost:5433/db`
    expect(extractSqlFromPsql(cmd)).toBeNull()
  })
})

describe("isSqlReadOnly", () => {
  describe("read-only (should return true)", () => {
    const readOnly = [
      "SELECT 1",
      "SELECT * FROM users WHERE id = 1",
      "SELECT count(*) FROM orders",
      "SELECT DISTINCT advertiser_id FROM search_index LIMIT 1",
      "SELECT a.name, b.total FROM a JOIN b ON a.id = b.a_id",
      "WITH cte AS (SELECT * FROM t) SELECT * FROM cte",
      "SELECT * FROM users; SELECT * FROM orders",
      "SHOW search_path",
    ]

    for (const sql of readOnly) {
      test(sql, () => {
        expect(isSqlReadOnly(sql)).toBe(true)
      })
    }
  })

  describe("writes (should return false)", () => {
    const writes = [
      "INSERT INTO users VALUES (1, 'test')",
      "UPDATE users SET name = 'test' WHERE id = 1",
      "DELETE FROM users WHERE id = 1",
      "DROP TABLE users",
      "TRUNCATE users",
      "ALTER TABLE users ADD COLUMN email text",
      "CREATE TABLE t (id int)",
      // Mixed: one read + one write
      "SELECT 1; DROP TABLE users",
    ]

    for (const sql of writes) {
      test(sql, () => {
        expect(isSqlReadOnly(sql)).toBe(false)
      })
    }
  })

  test("unparseable SQL returns false", () => {
    expect(isSqlReadOnly("NOT VALID SQL !@#$")).toBe(false)
  })

  test("empty string returns true", () => {
    expect(isSqlReadOnly("")).toBe(true)
  })
})
