import { DB_VIEW } from "#shared/config";
import { wording } from "#shared/wording";

import type { DbResult } from "#shared/types";

// A statement the owner typed themselves. It is run by a process that reads the database in a read-only transaction
// for as long as the query takes, or until the screen stops it, and it is made into a subquery before it is run —
// so anything that is not one statement shaped like a SELECT is refused by the database's own parser
// rather than by a list of words this app happens to look for.
export default defineEventHandler(async (event): Promise<DbResult> => {
  await requireUserSession(event);

  const body = await readBody<{ sql?: unknown }>(event);
  const sql = typeof body.sql === "string" ? body.sql.trim() : "";

  if (sql === "") {
    throw fail(400, wording("db.error.query_empty"));
  }

  const started = Date.now();
  const read = openDbRead(dbReadKeyOf(event));

  try {
    const [answered] = await askDatabase([{ sql: wrapQuery(sql, DB_VIEW.rowCap), params: [] }], {
      rowCap: DB_VIEW.rowCap,
      cellCap: DB_VIEW.cellCap,
      read
    });

    if (answered === undefined) {
      throw fail(500, wording("db.error.read_failed"));
    }

    const masked = maskResult(answered.columns, asRows(answered, false));

    return {
      columns: answered.columns,
      masked: masked.masked,
      rows: masked.rows,
      cut: answered.cut,
      ms: Date.now() - started
    };
  } catch (error) {
    if (error !== null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    throw fail(dbStatus(error), dbReason(error));
  } finally {
    closeDbRead(read);
  }
});
