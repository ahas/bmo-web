import { DB_MASKED_TEXT, DB_VIEW } from "#shared/config";
import { wording } from "#shared/wording";
import { connectionOf, webDatabaseUrl } from "./db";

import type { DbCell, DbColumn, DbRow, DbTable, DbValue } from "#shared/types";

// Reading the console's own database as tables and rows (docs/web.md, 「DB screen」): the one database this
// console may read, the server's, which `WEB_DATABASE_URL` names. Everything on this road holds to two rules, and
// the rest of this file is those two rules made real.
//
// Nothing here can write. The database is not read on this app's own connection at all: every read of this
// screen is done by a separate process that reads inside a read-only transaction, so a statement that would
// change a row is refused by the database itself rather than by a pattern this file happens to recognise.
//
// Nothing here can hang. The transaction carries a statement timeout, and the process is given a deadline and
// killed when it passes it, so a query typed with a join condition missing never holds the app.

// The columns whose values this console keeps off every screen: the credentials a sign-in is checked against —
// the console's own account hashes and sumida's users' passwords and keys — and the two push keys a notification
// is encrypted to. Everything else in this database is the deployment's own and is shown whole.
const MASKED: Record<string, string[]> = {
  web_users: ["password_hash"],
  web_push_devices: ["p256dh", "auth"],
  users: ["password"],
  api_keys: ["key"]
};

// The same columns by name alone. A typed query answers with columns of its own naming, so
// there is no table to key on and the name is all there is to go by.
const MASKED_NAMES = new Set(Object.values(MASKED).flat());

export function isMasked(table: string, column: string): boolean {
  return (MASKED[table] ?? []).includes(column);
}

export function isMaskedName(column: string): boolean {
  return MASKED_NAMES.has(column);
}

// The name of a table or a column as SQL can carry it. Only ever a name — a value never comes
// this way and goes as an argument instead.
export function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

// A catalogue name as a SQL string. Nothing but a name the database itself gave back is written this way;
// everything a person typed travels as an argument.
export function asText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// What a search matches: the words typed, anywhere in the value. The three characters LIKE
// reads as instructions are escaped, so a search for a percent sign finds a percent sign.
export function likeTerm(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

export interface Statement {
  sql: string;
  params: (string | number)[];
}

export interface StatementResult {
  columns: string[];
  rows: DbValue[][];
  cut: boolean;
}

// The process that does the reading. It is handed its job on stdin and answers on stdout, and it is the only thing
// in this app that reads the database on this road.
const CHILD = `
const job = JSON.parse(await Bun.stdin.text());

function cell(value, cap) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Uint8Array) {
    return { text: "<" + value.length + " bytes>", cut: false, length: value.length };
  }

  // A JSON object or list — a json column's value, or a text holding one — goes with its shape, so the screen stands
  // it as what it holds rather than as its text, and whole where it is read whole.
  let json;

  if (typeof value === "object" && !(value instanceof Date)) {
    json = value;
  } else if (typeof value === "string" && /^\s*[[{]/.test(value)) {
    try {
      const parsed = JSON.parse(value);

      if (parsed !== null && typeof parsed === "object") json = parsed;
    } catch {}
  }

  if (json !== undefined) {
    const whole = JSON.stringify(json);
    const shape = Array.isArray(json) ? "list" : "object";
    const count = Array.isArray(json) ? json.length : Object.keys(json).length;
    const keys = Array.isArray(json) ? [] : Object.keys(json).slice(0, 6);

    return whole.length > cap
      ? { text: whole.slice(0, cap), cut: true, length: whole.length, shape, count, keys }
      : { text: whole, cut: false, length: whole.length, shape, count, keys, json };
  }

  const text = typeof value === "string" ? value : String(value);

  return text.length > cap
    ? { text: text.slice(0, cap), cut: true, length: text.length }
    : { text, cut: false, length: text.length };
}

function answered(columns, rows) {
  const cut = rows.length > job.rowCap;

  return { columns, rows: (cut ? rows.slice(0, job.rowCap) : rows).map((row) => row.map((value) => cell(value, job.cellCap))), cut };
}

try {
  const results = [];
  const { SQL } = await import("bun");
  const sql = new SQL(typeof job.connection === "string" ? { url: job.connection, max: 1 } : { ...job.connection, max: 1 });

  await sql.begin("read only", async (tx) => {
    // The database's own limit stands a second past the console's deadline, so the deadline is what a person meets
    // and this only frees the database of a statement whose reader was killed.
    await tx.unsafe("SET LOCAL statement_timeout = " + (Number(job.timeoutMs) + 1000));

    for (const statement of job.statements) {
      const rows = await tx.unsafe(statement.sql, statement.params ?? []);
      const columns = rows.length === 0 ? [] : Object.keys(rows[0]);

      results.push(answered(columns, rows.map((row) => columns.map((column) => row[column]))));
    }
  });
  await sql.close();

  process.stdout.write(JSON.stringify({ ok: true, results }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }));
}
`;

// Anything the database itself refused: a name that is not a table, a statement that will not parse, a database
// that will not open.
export class DbViewError extends Error {}

// A read that took longer than it is allowed to. It is its own failure because it is the one
// the screen has something of its own to say about.
export class DbTimeoutError extends DbViewError {}

export interface AskOptions {
  rowCap?: number;
  cellCap?: number;
  timeoutMs?: number;
}

// Run statements against the database and answer with what they returned, each written with PostgreSQL's
// numbered parameters. The child is spawned for the one job and dies with it, so a read leaves nothing behind
// either way.
export async function askDatabase(statements: Statement[], options: AskOptions = {}): Promise<StatementResult[]> {
  const job = {
    connection: connectionOf(webDatabaseUrl()),
    timeoutMs: options.timeoutMs ?? DB_VIEW.timeoutMs,
    rowCap: options.rowCap ?? DB_VIEW.rowCap,
    cellCap: options.cellCap ?? DB_VIEW.cellCap,
    statements
  };

  const child = Bun.spawn([process.execPath, "-e", CHILD], {
    stdin: new TextEncoder().encode(JSON.stringify(job)),
    stdout: "pipe",
    stderr: "pipe"
  });

  const answered = (async (): Promise<string> => {
    const text = await new Response(child.stdout).text();

    await child.exited;

    return text;
  })();

  const overdue = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), options.timeoutMs ?? DB_VIEW.timeoutMs);
  });

  const answer = await Promise.race([answered, overdue]);

  if (answer === null) {
    child.kill(9);

    throw new DbTimeoutError(wording("db.error.query_timeout"));
  }

  if (answer === "") {
    const why = (await new Response(child.stderr).text()).trim().split("\n");

    throw new DbViewError(why[why.length - 1] ?? wording("db.error.read_failed"));
  }

  const parsed = JSON.parse(answer) as { ok: true; results: StatementResult[] } | { ok: false; error: string };

  if (!parsed.ok) {
    throw new DbViewError(parsed.error);
  }

  return parsed.results;
}

// How the database describes itself to this screen: its tables, whether each keeps a row number (`wr` is 1 for one
// that does not) — a table keeps one where it holds the `rowid` column the console's tables carry, which is no
// column of its own to show — a table's columns with their type, whether they are required and whether they are
// the key, and the declaration it reads as.
const rowidOf = (table: string) =>
  `CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = current_schema()` +
  ` AND c.table_name = ${table} AND c.column_name = 'rowid') THEN '0' ELSE '1' END`;

const TABLES =
  `SELECT t.table_name AS name, ${rowidOf("t.table_name")} AS wr FROM information_schema.tables t` +
  " WHERE t.table_schema = current_schema() AND t.table_type = 'BASE TABLE' ORDER BY t.table_name";

function describe(table: string): Statement[] {
  return [
    {
      sql:
        "SELECT c.column_name AS name, c.data_type AS type, CASE WHEN c.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull," +
        " CASE WHEN EXISTS (SELECT 1 FROM information_schema.key_column_usage k JOIN information_schema.table_constraints tc" +
        " ON tc.constraint_name = k.constraint_name AND tc.table_schema = k.table_schema WHERE tc.constraint_type = 'PRIMARY KEY'" +
        " AND k.table_schema = c.table_schema AND k.table_name = c.table_name AND k.column_name = c.column_name) THEN 1 ELSE 0 END AS pk" +
        " FROM information_schema.columns c WHERE c.table_schema = current_schema() AND c.table_name = $1 AND c.column_name <> 'rowid'" +
        " ORDER BY c.ordinal_position",
      params: [table]
    },
    {
      sql:
        "SELECT 'CREATE TABLE ' || $1 || ' (' || string_agg(column_name || ' ' || data_type, ', ' ORDER BY ordinal_position) || ')' AS sql" +
        " FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name <> 'rowid' HAVING count(*) > 0",
      params: [table]
    },
    { sql: `SELECT ${rowidOf("$1")} AS wr`, params: [table] }
  ];
}

// Every table of the database, with how many rows each holds. Two reads: what the tables are, and then one
// statement counting them all, since a count has to name its table.
export async function listDbTables(): Promise<DbTable[]> {
  const [named] = await askDatabase([{ sql: TABLES, params: [] }], { rowCap: 1_000 });

  const tables = (named?.rows ?? []).map((row) => ({
    name: textOf(row[0]),
    hasRowid: textOf(row[1]) !== "1"
  }));

  if (tables.length === 0) {
    return [];
  }

  const [counted] = await askDatabase([{ sql: countsSql(tables.map((table) => table.name)), params: [] }], {
    rowCap: 1_000
  });

  const counts = new Map((counted?.rows ?? []).map((row) => [textOf(row[0]), Number(textOf(row[1]))]));

  return tables.map((table) => ({ ...table, rows: counts.get(table.name) ?? 0 }));
}

// One statement that counts every table at once. The names come from the database's own catalogue.
export function countsSql(names: string[]): string {
  return names
    .map((name) => `SELECT ${asText(name)} AS name, count(*) AS rows FROM ${quoted(name)}`)
    .join(" UNION ALL ");
}

export interface DbSchema {
  columns: DbColumn[];
  ddl: string;
  hasRowid: boolean;
}

// What one table is made of. An empty answer is what says the table is not there: the catalogue describes no
// columns for a name it does not hold.
export async function readDbSchema(table: string): Promise<DbSchema> {
  const [described, created, listed] = await askDatabase(describe(table));

  return {
    hasRowid: textOf(listed?.rows[0]?.[0]) !== "1",
    columns: (described?.rows ?? []).map((row) => ({
      name: textOf(row[0]),
      type: textOf(row[1]),
      required: textOf(row[2]) === "1",
      primaryKey: textOf(row[3]) !== "0",
      masked: isMasked(table, textOf(row[0]))
    })),
    ddl: textOf(created?.rows[0]?.[0])
  };
}

export interface BrowseAsk {
  table: string;
  columns: DbColumn[];
  hasRowid: boolean;
  query: string | null;
  sort: string | null;
  descending: boolean;
  limit: number;
  offset: number;
}

// The two statements one page of a table stands on: how many rows answer the search, and the
// rows themselves. A masked column is never selected — a constant stands in its place, so the
// value does not leave the database — and never searched either, since a row appearing or not
// appearing in a search is itself an answer about the value.
export function browseStatements(ask: BrowseAsk): { count: Statement; rows: Statement } {
  const searchable = ask.columns.filter((column) => !column.masked);
  const term = ask.query === null ? null : likeTerm(ask.query);
  const where =
    term === null || searchable.length === 0
      ? ""
      : ` WHERE (${searchable
          .map((column) => `CAST(${quoted(column.name)} AS TEXT) ILIKE $1 ESCAPE '\\'`)
          .join(" OR ")})`;
  const params = term === null ? [] : [term];
  const head = ask.hasRowid ? "rowid, " : "";

  return {
    count: { sql: `SELECT count(*) FROM ${quoted(ask.table)}${where}`, params },
    rows: {
      sql:
        `SELECT ${head}${selection(ask.columns)} FROM ${quoted(ask.table)}${where}${orderBy(ask)}` +
        ` LIMIT ${ask.limit} OFFSET ${ask.offset}`,
      params
    }
  };
}

// One row of one table, whole. It is asked for by the number the table knows the row by, so it is the row that was
// on the screen and not one that merely looks like it.
export function rowStatement(table: string, columns: DbColumn[], rowid: number): Statement {
  return { sql: `SELECT ${selection(columns)} FROM ${quoted(table)} WHERE rowid = $1`, params: [rowid] };
}

function selection(columns: DbColumn[]): string {
  return columns
    .map((column) => (column.masked ? `${asText(wording(DB_MASKED_TEXT))} AS ${quoted(column.name)}` : quoted(column.name)))
    .join(", ");
}

// What order a table stands in. A column the reader picked, or — where the table keeps a row number — the newest
// row first, which is the end a person opens a table at.
function orderBy(ask: BrowseAsk): string {
  const direction = ask.descending ? "DESC" : "ASC";

  if (ask.sort !== null && ask.columns.some((column) => column.name === ask.sort)) {
    return ` ORDER BY ${quoted(ask.sort)} ${direction}`;
  }

  return ask.hasRowid ? " ORDER BY rowid DESC" : "";
}

// A typed query, made runnable by being made into a subquery. Anything that is not one
// statement shaped like a SELECT fails to parse here rather than being matched against a list
// of forbidden words, and one row past the cap is asked for so the answer can say it was cut.
export function wrapQuery(sql: string, rowCap: number): string {
  return `SELECT * FROM (${sql.trim().replace(/;+\s*$/, "")}) LIMIT ${rowCap + 1}`;
}

// A statement's answer as rows the screen reads: the number the table knows each row by, where the statement
// carried one, and the values themselves.
export function asRows(result: StatementResult, hasRowid: boolean): DbRow[] {
  return result.rows.map((cells) => ({
    rowid: hasRowid ? Number(textOf(cells[0])) : null,
    cells: hasRowid ? cells.slice(1) : cells
  }));
}

// A typed query's answer, with any column named as one this console withholds blanked out. The
// browse road masks in SQL, where nothing can slip past; here the query chose its own columns,
// so what can be held to is the name it gave them.
export function maskResult(columns: string[], rows: DbRow[]): { masked: boolean[]; rows: DbRow[] } {
  const masked = columns.map((column) => isMaskedName(column));

  if (!masked.includes(true)) {
    return { masked, rows };
  }

  return {
    masked,
    rows: rows.map((row) => ({
      rowid: row.rowid,
      cells: row.cells.map((cell, at) => (masked[at] === true ? maskedCell() : cell))
    }))
  };
}

// How a failed read is answered. The database's own refusal is the caller's to correct and is
// worth reading; a deadline is its own answer; anything else is this app's fault and says so.
export function dbStatus(error: unknown): number {
  if (error instanceof DbTimeoutError) {
    return 504;
  }

  return error instanceof DbViewError ? 400 : 500;
}

export function dbReason(error: unknown): string {
  return error instanceof DbViewError && error.message !== "" ? error.message : wording("db.error.read_failed");
}

function maskedCell(): DbCell {
  const text = wording(DB_MASKED_TEXT);

  return { text, cut: false, length: text.length };
}

function textOf(value: DbValue | undefined): string {
  return value === null || value === undefined ? "" : value.text;
}
