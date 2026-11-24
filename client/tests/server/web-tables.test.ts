import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// The tables the console's tests stand on are the server's own (docs/accounts.md, 「The tables」): every statement
// of the tests' fixture stands in the server's baseline migration word for word, and the tables whose user defaults
// to the platform administrator are the ones the data move hands to the user it makes.

const fixture = readFileSync(new URL("../fixtures/web-tables.sql", import.meta.url), "utf8");
const server = (path: string) => readFileSync(new URL(`../../../server/src/${path}`, import.meta.url), "utf8");
const baseline = server("migration/baseline.sql");

const blocks = fixture.split("\n\n").map((block) => block.trim()).filter((block) => block !== "");

test("every statement the tests run stands in the server's baseline as it is written there", () => {
  expect(blocks.filter((block) => block.startsWith("CREATE TABLE")).length).toBe(11);

  for (const block of blocks) {
    expect(baseline.includes(block)).toBe(true);
  }
});

test("the tables the tests key by a user are the ones the data move keys", () => {
  const keyed = blocks
    .filter((block) => block.startsWith("CREATE TABLE") && block.includes("user_id bigint DEFAULT public.bmo_administrator()"))
    .map((block) => /^CREATE TABLE public\.([a-z_]+)/.exec(block)![1]);

  expect(keyed.length).toBeGreaterThan(0);
  expect(server("data_move.rs")).toContain(`USER_KEYED: [&str; ${keyed.length}] = [${keyed.map((table) => `"${table}"`).join(", ")}]`);
});
