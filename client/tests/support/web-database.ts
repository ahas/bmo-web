import { afterAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import { SQL } from "bun";

import { closeWebSql, connectionOf } from "../../apps/web/server/utils/db";

// A database of the server's shape for a console test (docs/accounts.md, 「The tables」): a fresh PostgreSQL
// database on the test server, holding the console's own tables as the server's migrations make them, named
// by `WEB_DATABASE_URL` for the file that asked for it and dropped when that file is done, the file failing if
// it cannot be (docs/checks.md, 「The scratch databases」). The statements are the fixture `web-tables.sql`, which
// a test holds to the server's migration word for word.

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

/** What a test file's database is named by: this prefix, the process that made it and a count. */
const CONSOLE_PREFIX = "bmo_web_console_";

/** What the browser harness's database is named by: this prefix and the process that made it. */
export const BROWSER_CONSOLE_PREFIX = "bmo_web_browser_console_";

let consoleSwept: Promise<void> | undefined;

// How long the scratch database's drop may take, its checkpoint queued behind the test server's others.
const DROP_CEILING_MS = 60_000;

// PostgreSQL's code for a database other sessions still stand in.
const OBJECT_IN_USE = "55006";

// How many times a drop is asked while the database is still in use, each ask waiting up to five seconds.
const DROP_ASKS = 6;

/**
 * Drops a scratch database of the test server. Its own role's sessions are ended first, so a connection still
 * closing holds nothing. The drop is a plain one: dropping with FORCE also ends any autovacuum worker on the
 * database, which a role short of a superuser may not do, while a plain drop asks the worker to stop itself and
 * waits up to PostgreSQL's five seconds for it, so a drop answered that the database is still in use is asked
 * again.
 */
export async function dropScratchDatabase(name: string): Promise<void> {
  const dropping = new SQL(connectionOf(addressOf("postgres")) as SQL.Options);

  try {
    await dropping.unsafe(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND usename = current_user AND pid <> pg_backend_pid()",
      [name]
    );

    for (let asked = 1; ; asked++) {
      try {
        await dropping.unsafe(`DROP DATABASE IF EXISTS "${name}"`);

        return;
      } catch (error) {
        if ((error as { errno?: string }).errno !== OBJECT_IN_USE || asked === DROP_ASKS) throw error;
      }
    }
  } finally {
    await dropping.close();
  }
}

/** The process id a scratch database's name carries after `prefix`, alone or followed by a count. */
function processOf(name: string, prefix: string): number | undefined {
  if (!name.startsWith(prefix)) return undefined;

  const [process, count = "0", ...rest] = name.slice(prefix.length).split("_");

  if (rest.length > 0 || !/^\d+$/.test(process!) || !/^\d+$/.test(count)) return undefined;

  return Number(process);
}

/**
 * Whether process `id`, other than this one, is running on this machine. Where the process table cannot be read
 * every process counts as alive, so nothing is dropped on a guess.
 */
function lives(id: number): boolean {
  return id !== process.pid && (!existsSync("/proc/self") || existsSync(`/proc/${id}`));
}

/**
 * Drops every scratch database named by `prefix` that a dead process left. A database is left alone while its
 * process runs on this machine or a client's session is on it, so a run of another checkout's harness against
 * the same server keeps its own; this process has made none yet, so its own id counts as gone. A database the
 * sweep cannot drop is named on the error stream and left for the next run.
 */
export async function sweepScratchDatabases(prefix: string): Promise<void> {
  const listing = new SQL(connectionOf(addressOf("postgres")) as SQL.Options);
  let unattended: string[];

  try {
    const rows = (await listing.unsafe(
      "SELECT datname::text AS name FROM pg_database d WHERE NOT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname AND a.backend_type = 'client backend')"
    )) as { name: string }[];

    unattended = rows.map((row) => row.name);
  } catch (error) {
    console.error(`the scratch sweep lists no databases: ${error}`);

    return;
  } finally {
    await listing.close();
  }

  for (const name of unattended) {
    const owner = processOf(name, prefix);

    if (owner === undefined || lives(owner)) continue;

    try {
      await dropScratchDatabase(name);
    } catch (error) {
      console.error(`the scratch sweep leaves ${name}: ${error}`);
    }
  }
}

/** A database of its own for the test file that asks, made now and named by `WEB_DATABASE_URL`. */
export async function scratchWebDatabase(): Promise<string> {
  consoleSwept ??= sweepScratchDatabases(CONSOLE_PREFIX);
  await consoleSwept;

  const name = `${CONSOLE_PREFIX}${process.pid}_${made++}`;
  const admin = new SQL(connectionOf(addressOf("postgres")) as SQL.Options);

  await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.close();

  const address = addressOf(name);
  const fresh = new SQL(connectionOf(address) as SQL.Options);

  await fresh.unsafe(TABLES).simple();
  await fresh.close();

  process.env.WEB_DATABASE_URL = address;

  // A drop waits on an immediate checkpoint of the whole test server, queued behind the creates and drops of every
  // suite running on it, and under that load one checkpoint alone outlasts a hook's default five seconds, so the
  // hook is given a ceiling of its own.
  afterAll(
    async () => {
      await closeWebSql();
      await dropScratchDatabase(name);
    },
    { timeout: DROP_CEILING_MS }
  );

  return address;
}
