import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// The tables the console's tests stand on are the server's own (docs/accounts.md, 「The tables」): every table
// statement of the tests' fixture stands in one of the server's migrations word for word, and the tables a user
// keys are the ones the migration keys.

const fixture = readFileSync(new URL("../fixtures/web-tables.sql", import.meta.url), "utf8");
const read = (name: string) => readFileSync(new URL(`../../../server/src/migration/${name}.rs`, import.meta.url), "utf8");
const tables = read("m20261019_000001_tables");
const migrations = [tables, read("m20261019_000002_document_talk"), read("m20261117_000001_presence_hidden")];

const blocks = fixture.split("\n\n").map((block) => block.trim()).filter((block) => block !== "");

test("every table the tests make is made by one of the server's migrations as it is written there", () => {
  const made = blocks.filter((block) => block.startsWith("CREATE TABLE"));

  expect(made.length).toBe(9);

  for (const block of made) {
    expect(migrations.some((migration) => migration.includes(block))).toBe(true);
  }
});

test("the tables the tests key by a user are the ones the migration keys", () => {
  const keyed = blocks.filter((block) => block.startsWith("ALTER TABLE")).map((block) => /^ALTER TABLE "([a-z_]+)"/.exec(block)![1]);

  expect(tables).toContain(`USER_KEYED: [&str; ${keyed.length}] = [${keyed.map((table) => `"${table}"`).join(", ")}]`);
  expect(tables).toContain('ADD COLUMN IF NOT EXISTS "user_id" bigint');
});
