import { DB_VIEW } from "#shared/config";
import { wording } from "#shared/wording";

import type { DbPage } from "#shared/types";

// One page of one table. The page, the search and the order the caller asked for are all read
// again from the database on every ask: this screen holds nothing between two reads, so what is
// on it is what the database said at the moment it was read.
export default defineEventHandler(async (event): Promise<DbPage> => {
  await requireUserSession(event);

  const asked = getQuery(event);
  const table = typeof asked.table === "string" ? asked.table : "";

  if (table === "") {
    throw fail(400, wording("db.error.no_table_name"));
  }

  const page = Math.max(1, Number.parseInt(typeof asked.page === "string" ? asked.page : "1", 10) || 1);
  const query = typeof asked.q === "string" && asked.q.trim() !== "" ? asked.q.trim() : null;
  const sort = typeof asked.sort === "string" && asked.sort !== "" ? asked.sort : null;
  const started = Date.now();
  const read = openDbRead(dbReadKeyOf(event));

  try {
    const schema = await readDbSchema(table, read);

    if (schema.columns.length === 0) {
      throw fail(404, wording("db.error.no_such_table"));
    }

    const statements = browseStatements({
      table,
      columns: schema.columns,
      hasRowid: schema.hasRowid,
      query,
      sort,
      descending: asked.dir === "desc",
      limit: DB_VIEW.pageSize,
      offset: (page - 1) * DB_VIEW.pageSize
    });

    const [counted, listed] = await askDatabase([statements.count, statements.rows], {
      rowCap: DB_VIEW.pageSize,
      cellCap: DB_VIEW.cellCap,
      read
    });

    return {
      table,
      columns: schema.columns,
      ddl: schema.ddl,
      rows: listed === undefined ? [] : asRows(listed, schema.hasRowid),
      total: Number(counted?.rows[0]?.[0]?.text ?? "0"),
      page,
      pageSize: DB_VIEW.pageSize,
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
