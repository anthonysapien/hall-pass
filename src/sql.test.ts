import { describe, test, expect } from "bun:test"
import { extractSqlFromPsql, isSqlReadOnly } from "./sql.ts"

describe("extractSqlFromPsql", () => {
  test("double-quoted -c", () => {
    const cmd = `psql postgres://user:pass@localhost:5433/db -t -c "SELECT * FROM users" 2>&1`
    expect(extractSqlFromPsql(cmd)).toBe("SELECT * FROM users")
  })

  test("single-quoted -c", () => {
    const cmd = `psql -c 'SELECT count(*) FROM orders'`
    expect(extractSqlFromPsql(cmd)).toBe("SELECT count(*) FROM orders")
  })

  test("--command= form", () => {
    const cmd = `psql --command="EXPLAIN SELECT 1"`
    expect(extractSqlFromPsql(cmd)).toBe("EXPLAIN SELECT 1")
  })

  test("no -c flag returns null", () => {
    const cmd = `psql postgres://localhost:5433/db`
    expect(extractSqlFromPsql(cmd)).toBeNull()
  })

  test("complex connection string", () => {
    const cmd = `psql postgres://deepcurrent:deepcurrent@localhost:5433/deepcurrent -t -c "SELECT DISTINCT advertiser_id FROM search_index LIMIT 1" 2>&1`
    expect(extractSqlFromPsql(cmd)).toBe(
      "SELECT DISTINCT advertiser_id FROM search_index LIMIT 1"
    )
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
