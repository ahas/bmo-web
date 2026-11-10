import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../../support/globals";

import { useWebSql } from "../../../../apps/web/server/utils/db";
import { isTabScreen, readTabState, saveTabState, TAB_STATE_MAX_BYTES } from "../../../../apps/web/server/utils/tab-states";
import { standInHandler } from "../../../support/route-handler";
import { scratchWebDatabase } from "../../../support/web-database";

await scratchWebDatabase();

// A screen's open tabs kept per account on the server: each account reads back only what it kept,
// a screen names its own key within one pattern, and nothing is kept before the session is checked.

interface FakeEvent {
  params: Record<string, string>;
  body: unknown;
}


const globals: Record<string, unknown> = globalThis;
let user: string | null = "tester";

globalsRestoredAfter(["TAB_STATE_MAX_BYTES", "defineEventHandler", "fail", "getRouterParam", "isTabScreen", "readBody", "readTabState", "requireUserSession", "saveTabState", "signedInUser", "useWebSql"]);
globals.defineEventHandler = (handler: unknown) => handler;
globals.requireUserSession = async () => {
  if (user === null) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  return { user: { name: user } };
};
globals.signedInUser = async () => {
  if (user === null) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  return { name: user, id: null, administrator: true };
};
globals.fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
globals.getRouterParam = (event: FakeEvent, name: string) => event.params[name];
globals.readBody = async (event: FakeEvent) => event.body;
globals.useWebSql = useWebSql;
globals.isTabScreen = isTabScreen;
globals.readTabState = readTabState;
globals.saveTabState = saveTabState;
globals.TAB_STATE_MAX_BYTES = TAB_STATE_MAX_BYTES;

const read = standInHandler((await import("../../../../apps/web/server/api/tab-states/[screen].get")).default);
const write = standInHandler((await import("../../../../apps/web/server/api/tab-states/[screen].put")).default);


describe("a screen's kept tabs", () => {
  test("read back what the account kept, and nothing another account kept", async () => {
    user = "tester";
    expect(await read({ params: { screen: "code" }, body: null })).toEqual({ state: null });

    await write({ params: { screen: "code" }, body: { state: { tabs: [{ path: "a.ts", pinned: true }] } } });
    expect(await read({ params: { screen: "code" }, body: null })).toEqual({ state: { tabs: [{ path: "a.ts", pinned: true }] } });

    await write({ params: { screen: "code" }, body: { state: { tabs: [] } } });
    expect(await read({ params: { screen: "code" }, body: null })).toEqual({ state: { tabs: [] } });

    user = "guest";
    expect(await read({ params: { screen: "code" }, body: null })).toEqual({ state: null });
    user = "tester";
  });

  test("refuse a screen key outside the pattern, a missing state and one too large", async () => {
    expect(isTabScreen("remote")).toBe(true);
    expect(isTabScreen("graph-code")).toBe(true);
    expect(isTabScreen("../x")).toBe(false);
    expect(isTabScreen("Code")).toBe(false);
    expect(isTabScreen("a".repeat(41))).toBe(false);

    await expect(read({ params: { screen: "no/pe" }, body: null })).rejects.toMatchObject({ statusCode: 400 });
    await expect(write({ params: { screen: "code" }, body: {} })).rejects.toMatchObject({ statusCode: 400 });
    await expect(write({ params: { screen: "code" }, body: { state: "text" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(write({ params: { screen: "code" }, body: { state: { big: "x".repeat(TAB_STATE_MAX_BYTES) } } })).rejects.toMatchObject({ statusCode: 413 });
  });

  test("keep nothing and read nothing without a login", async () => {
    user = null;
    await expect(read({ params: { screen: "code" }, body: null })).rejects.toMatchObject({ statusCode: 401 });
    await expect(write({ params: { screen: "docs" }, body: { state: {} } })).rejects.toMatchObject({ statusCode: 401 });
    user = "tester";
    expect(await read({ params: { screen: "docs" }, body: null })).toEqual({ state: null });
  });
});
