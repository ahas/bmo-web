import { describe, expect, test } from "bun:test";

import { DEFAULT_PALETTE, PALETTES } from "bmo-ui/shared/palettes";
import { useWebSql } from "../../../../apps/web/server/utils/db";
import { readPalette, savePalette } from "../../../../apps/web/server/utils/palettes";
import { standInHandler } from "../../../support/route-handler";
import { scratchWebDatabase } from "../../../support/web-database";

// The palette each account reads the console in (docs/web.md, 「Palettes」): kept per account, read back
// by that account alone, the default where it never chose, and only a palette the console has.

await scratchWebDatabase();

interface FakeEvent {
  body: unknown;
}

const globals: Record<string, unknown> = globalThis;
let user: string | null = "tester";

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
globals.readPalette = readPalette;
globals.savePalette = savePalette;

const read = standInHandler((await import("../../../../apps/web/server/api/account/palette.get")).default);
const write = standInHandler((await import("../../../../apps/web/server/api/account/palette.put")).default);

describe("an account's palette", () => {
  test("is the default until chosen, then what the account chose, and no other account's", async () => {
    const other = PALETTES.find((palette) => palette.id !== DEFAULT_PALETTE.id)!.id;

    user = "tester";
    expect(await read({ body: null })).toEqual({ palette: DEFAULT_PALETTE.id });
    expect(await write({ body: { palette: other } })).toEqual({ palette: other });
    expect(await read({ body: null })).toEqual({ palette: other });

    user = "guest";
    expect(await read({ body: null })).toEqual({ palette: DEFAULT_PALETTE.id });
    user = "tester";
  });

  test("refuses a palette the console does not have, and reads one no longer offered as the default", async () => {
    await expect(write({ body: { palette: "nope" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(write({ body: {} })).rejects.toMatchObject({ statusCode: 400 });

    await savePalette("retired", "gone", 1, null);
    expect(await readPalette("retired")).toBe(DEFAULT_PALETTE.id);
  });

  test("keeps nothing and reads nothing without a login", async () => {
    user = null;
    await expect(read({ body: null })).rejects.toMatchObject({ statusCode: 401 });
    await expect(write({ body: { palette: DEFAULT_PALETTE.id } })).rejects.toMatchObject({ statusCode: 401 });
    user = "tester";
  });
});
