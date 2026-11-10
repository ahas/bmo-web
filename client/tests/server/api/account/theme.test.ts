import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../../support/globals";

import { DEFAULT_THEME, THEMES } from "bmo-ui/shared/themes";
import { useWebSql } from "../../../../apps/web/server/utils/db";
import { readTheme, saveTheme } from "../../../../apps/web/server/utils/themes";
import { standInHandler } from "../../../support/route-handler";
import { scratchWebDatabase } from "../../../support/web-database";

// The theme each account reads the console in (docs/web.md, 「Themes」): kept per account, read back by
// that account alone, the default where it never chose, and only a theme the console has.

await scratchWebDatabase();

interface FakeEvent {
  body: unknown;
}

const globals: Record<string, unknown> = globalThis;
let user: string | null = "tester";

globalsRestoredAfter(["defineEventHandler", "fail", "readBody", "readTheme", "saveTheme", "signedInUser", "useWebSql"]);
globals.defineEventHandler = (handler: unknown) => handler;
globals.signedInUser = async () => {
  if (user === null) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  return { name: user, id: null, administrator: true };
};
globals.fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
globals.readBody = async (event: FakeEvent) => event.body;
globals.useWebSql = useWebSql;
globals.readTheme = readTheme;
globals.saveTheme = saveTheme;

const read = standInHandler((await import("../../../../apps/web/server/api/account/theme.get")).default);
const write = standInHandler((await import("../../../../apps/web/server/api/account/theme.put")).default);

describe("an account's theme", () => {
  test("is the default until chosen, then what the account chose, and no other account's", async () => {
    const other = THEMES.find((theme) => theme.id !== DEFAULT_THEME.id)!.id;

    user = "tester";
    expect(await read({ body: null })).toEqual({ theme: DEFAULT_THEME.id });
    expect(await write({ body: { theme: other } })).toEqual({ theme: other });
    expect(await read({ body: null })).toEqual({ theme: other });

    user = "guest";
    expect(await read({ body: null })).toEqual({ theme: DEFAULT_THEME.id });
    user = "tester";
  });

  test("refuses a theme the console does not have, and reads one no longer offered as the default", async () => {
    await expect(write({ body: { theme: "nope" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(write({ body: {} })).rejects.toMatchObject({ statusCode: 400 });

    await saveTheme("retired", "gone", 1, null);
    expect(await readTheme("retired")).toBe(DEFAULT_THEME.id);
  });

  test("keeps nothing and reads nothing without a login", async () => {
    user = null;
    await expect(read({ body: null })).rejects.toMatchObject({ statusCode: 401 });
    await expect(write({ body: { theme: DEFAULT_THEME.id } })).rejects.toMatchObject({ statusCode: 401 });
    user = "tester";
  });
});
