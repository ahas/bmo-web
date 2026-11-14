import { afterAll } from "bun:test";
import { readFileSync } from "node:fs";

import { SQL } from "bun";

import { closeWebSql, connectionOf } from "../../apps/web/server/utils/db";

// A database of the server's shape for a console test (docs/accounts.md, 「The tables」): a fresh PostgreSQL
// database on the test server, holding the console's own tables as the server's migrations make them, named
// by `WEB_DATABASE_URL` for the file that asked for it and dropped when that file is done. The statements are
// the fixture `web-tables.sql`, which a test holds to the server's migration word for word.

const TABLES = readFileSync(new URL("../fixtures/web-tables.sql", import.meta.url), "utf8");

/** The test server, as the suite names it, and the machine's own socket where nothing does. */
export function testServer(): string {
  const named = process.env.BMO_TEST_POSTGRES?.trim() ?? "";

  return named === "" ? "postgres:///bmo_test?host=/var/run/postgresql" : named;
}

/** The test server's address with another database in place of its own. */
export function addressOf(database: string): string {
  const address = new URL(testServer());

  address.pathname = `/${database}`;

  return address.toString();
}

let made = 0;

/** A database of its own for the test file that asks, made now and named by `WEB_DATABASE_URL`. */
export async function scratchWebDatabase(): Promise<string> {
  const name = `bmo_web_console_${process.pid}_${made++}`;
  const admin = new SQL(connectionOf(addressOf("postgres")) as SQL.Options);

  await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.close();

  const address = addressOf(name);
  const fresh = new SQL(connectionOf(address) as SQL.Options);

  await fresh.unsafe(TABLES).simple();
  await fresh.close();

  process.env.WEB_DATABASE_URL = address;

  // A connection still closing would hold a plain drop waiting out PostgreSQL's five seconds, the whole of the
  // hook's own ceiling, so the drop ends whatever still stands in the scratch database.
  afterAll(async () => {
    await closeWebSql();

    const dropping = new SQL(connectionOf(addressOf("postgres")) as SQL.Options);

    await dropping.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await dropping.close();
  });

  return address;
}
