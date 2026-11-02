import { DB_VIEW } from "#shared/config";
import { wording } from "#shared/wording";

import type { DbRowDetail } from "#shared/types";

// One row of one table, whole. The list carries only the head of a long value, so this is where
// the rest of it comes from, and it is asked for by the number the table knows the row by rather
// than by anything the screen made up.
export default defineEventHandler(async (event): Promise<DbRowDetail> => {
  await requireUserSession(event);

  const asked = getQuery(event);
  const table = typeof asked.table === "string" ? asked.table : "";
  const rowid = Number.parseInt(typeof asked.rowid === "string" ? asked.rowid : "", 10);

  if (table === "" || !Number.isSafeInteger(rowid)) {
    throw fail(400, wording("db.error.row_not_found"));
  }

  const read = openDbRead(dbReadKeyOf(event));

  try {
    const schema = await readDbSchema(table, read);

    if (schema.columns.length === 0) {
      throw fail(404, wording("db.error.no_such_table"));
    }

    if (!schema.hasRowid) {
      throw fail(400, wording("db.error.no_rowid"));
    }

    const [found] = await askDatabase([rowStatement(table, schema.columns, rowid)], {
      rowCap: 1,
      cellCap: DB_VIEW.fullCellCap,
      read
    });

    const rows = found === undefined ? [] : asRows(found, false);

    return { columns: schema.columns, row: rows[0] ?? null };
  } catch (error) {
    if (error !== null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    throw fail(dbStatus(error), dbReason(error));
  } finally {
    closeDbRead(read);
  }
});
