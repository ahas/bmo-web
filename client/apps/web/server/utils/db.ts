import { AsyncLocalStorage } from "node:async_hooks";

import { SQL } from "bun";

import type { TransactionSQL } from "bun";

// The console's own tables, which stand in the server's database beside sumida's (docs/accounts.md, 「The
// tables」; docs/web.md, 「Tables」): the console accounts, the push devices, the tab states, the palettes and
// themes, how far each user has read each room and the talk about each document. The server's baseline migration makes them; the console reads and
// writes them and no other unit's. `WEB_DATABASE_URL` names the database.

/** A value a statement may be given for one of its parameters. */
export type SqlValue = string | number | bigint | boolean | null;

/** What a write came to: the rows it changed. */
export interface Changed {
  changes: number;
}

/** The console's tables, every statement written with PostgreSQL's numbered parameters (`$1`, `$2`, …). */
export interface WebSql {
  /** Every row a statement answers, in the order it answers them. */
  all(sql: string, ...params: SqlValue[]): Promise<unknown[]>;
  /** The first row a statement answers, or null where it answers none. */
  get(sql: string, ...params: SqlValue[]): Promise<unknown>;
  /** A statement that answers no rows. */
  run(sql: string, ...params: SqlValue[]): Promise<Changed>;
  /** Several statements as one commit: every statement run inside `work` is part of it. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

// A whole number the database answers as a bigint comes back as the number it is, which every reader here
// expects; none of the console's own figures runs past what a number holds.
function readable(row: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") row[key] = Number(value);
  }

  return row;
}

class PostgresWebSql implements WebSql {
  // The transaction a statement runs inside, where one is open in the work that runs it.
  private readonly open = new AsyncLocalStorage<TransactionSQL>();

  constructor(private readonly client: SQL) {}

  private async rows(sql: string, params: SqlValue[]): Promise<Record<string, unknown>[] & { count?: number }> {
    const on = this.open.getStore() ?? this.client;
    const rows = (await on.unsafe(sql, params)) as Record<string, unknown>[] & { count?: number };

    rows.forEach(readable);

    return rows;
  }

  async all(sql: string, ...params: SqlValue[]): Promise<unknown[]> {
    return [...(await this.rows(sql, params))];
  }

  async get(sql: string, ...params: SqlValue[]): Promise<unknown> {
    return (await this.rows(sql, params))[0] ?? null;
  }

  async run(sql: string, ...params: SqlValue[]): Promise<Changed> {
    return { changes: (await this.rows(sql, params)).count ?? 0 };
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.open.getStore() !== undefined) return await work();

    return (await this.client.begin(async (tx) => await this.open.run(tx, work))) as T;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

/**
 * What Bun's client is handed for an address: the address itself where it names no `host` parameter, else the
 * server the parameter names as libpq reads it — a socket folder (`postgres:///<database>?host=/run/postgresql`)
 * as the socket in that folder, a host name or address (`?host=127.0.0.1&port=5433`) as that host and port —
 * with the database, and the user the address names or the process signs in as. Bun's client would hand a
 * `host` or `port` parameter on to the server as a setting of the session, which the server refuses.
 */
export function connectionOf(url: string): string | SQL.Options {
  const address = new URL(url);
  const named = address.searchParams.get("host");

  if (named === null) return url;

  const port = address.searchParams.get("port") ?? (address.port === "" ? "5432" : address.port);
  const database = decodeURIComponent(address.pathname.replace(/^\//, ""));
  const username = decodeURIComponent(address.username) || process.env.USER || process.env.LOGNAME;
  const password = address.password === "" ? undefined : decodeURIComponent(address.password);

  if (named.startsWith("/")) return { path: `${named}/.s.PGSQL.${port}`, database, username, password };

  return { hostname: named, port: Number(port), database, username, password };
}

let sql: PostgresWebSql | null = null;
let opened: string | null = null;

/** The database `WEB_DATABASE_URL` names; a console started without one has none and fails as it asks. */
export function webDatabaseUrl(): string {
  const named = process.env.WEB_DATABASE_URL?.trim() ?? "";

  if (named === "") throw new Error("the console's database is not set: WEB_DATABASE_URL names it");

  return named;
}

/** The console's tables, on the one connection pool this process holds to the database. */
export function useWebSql(): WebSql {
  const url = webDatabaseUrl();

  if (sql === null || opened !== url) {
    void sql?.close();
    sql = new PostgresWebSql(new SQL(connectionOf(url) as SQL.Options));
    opened = url;
  }

  return sql;
}

/** The connection let go of: what a test that brought a database of its own does as it ends. */
export async function closeWebSql(): Promise<void> {
  await sql?.close();
  sql = null;
  opened = null;
}
