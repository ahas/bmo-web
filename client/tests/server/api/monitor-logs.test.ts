import { afterAll, describe, expect, test } from "bun:test";

import { fail } from "../../../apps/web/server/utils/fail";
import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";

import type { LogPage, LogSources } from "../../../apps/web/shared/monitor-logs";

// The monitor's logs tab is the administrator's alone (docs/web.md, 「Monitor's logs tab」): both its routes refuse a
// member before anything of the journal is read.

const globals: Record<string, unknown> = globalThis;
const administrator = globals.requireAdministrator;

globals.requireAdministrator = async () => {
  throw fail(403, wording("common.error.administrator_only"));
};

afterAll(() => {
  globals.requireAdministrator = administrator;
});

const logs = await routeOf<LogPage>("../../apps/web/server/api/monitor/logs.get");
const sources = await routeOf<LogSources>("../../apps/web/server/api/monitor/log-sources.get");

describe("the logs routes", () => {
  test("refuse anyone but the administrator", async () => {
    expect(await asked(logs, { query: {} })).toMatchObject({ status: 403, message: wording("common.error.administrator_only") });
    expect(await asked(sources, {})).toMatchObject({ status: 403, message: wording("common.error.administrator_only") });
  });
});
