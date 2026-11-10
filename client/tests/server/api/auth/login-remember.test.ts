import { beforeEach, describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../../support/globals";

import { BROWSER_LOGIN_SECONDS, REMEMBER_LOGIN_SECONDS } from "../../../../apps/web/shared/config";
import { standInHandler } from "../../../support/route-handler";

// What the login and the account change do with the life of the session, with the Nuxt
// auto-imports supplied by hand. What they are held to: the switch decides the life and is off
// unless it was asked for; the life is written into the session as well as onto the cookie, so
// every later write knows it; and changing the account does not quietly take a kept login away.

interface FakeEvent {
  body: unknown;
}

interface Written {
  data: Record<string, unknown>;
  life: { maxAge?: number; cookie?: { expires: Date }; seal?: { ttl?: number } } | undefined;
}

const globals: Record<string, unknown> = globalThis;

let written: Written | null = null;
let standing: Record<string, unknown> = { user: { name: "owner" }, loggedInAt: 1, remember: false };

globalsRestoredAfter(["changePassword", "checkPassword", "consoleModel", "defineEventHandler", "fail", "findWebUser", "normalizeName", "normalizePassword", "readBody", "renameWebUser", "replaceUserSession", "requireUserSession", "sessionLife", "sessionRemembers", "setUserSession", "signedInUser"]);
globals.defineEventHandler = (handler: unknown) => handler;
globals.readBody = async (event: FakeEvent) => event.body;
globals.fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
globals.normalizeName = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
globals.normalizePassword = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
globals.findWebUser = (name: string) => (name === "owner" ? { name, passwordHash: "h", createdAt: 0 } : null);
globals.checkPassword = async (user: unknown, password: string) => user !== null && password === "right";
globals.renameWebUser = () => undefined;
globals.changePassword = async () => undefined;
globals.requireUserSession = async () => standing;
// The console's own login, as it stands where the archive is the file and no user of sumida's is.
globals.consoleModel = async () => "off";
globals.signedInUser = async () => ({ name: (standing.user as { name: string }).name, id: null, administrator: true });
globals.setUserSession = async (event: FakeEvent, data: Record<string, unknown>, life: Written["life"]) => {
  written = { data, life };
};
globals.replaceUserSession = globals.setUserSession;

const { sessionLife, sessionRemembers } = await import("../../../../apps/web/server/utils/session-life");

globals.sessionLife = sessionLife;
globals.sessionRemembers = sessionRemembers;

const login = standInHandler((await import("../../../../apps/web/server/api/auth/login.post")).default);
const account = standInHandler((await import("../../../../apps/web/server/api/account.post")).default);

beforeEach(() => {
  written = null;
  standing = { user: { name: "owner" }, loggedInAt: 1, remember: false };
});

describe("logging in", () => {
  test("the switch off writes a session with no age, which is the browser's own, sealed to end 12 hours on", async () => {
    await login({ body: { name: "owner", password: "right", remember: false } });

    expect(written?.data.remember).toBe(false);
    expect(written?.life).toEqual({ seal: { ttl: BROWSER_LOGIN_SECONDS * 1000 } });
  });

  test("a request that says nothing about the switch is not a kept login", async () => {
    await login({ body: { name: "owner", password: "right" } });

    expect(written?.data.remember).toBe(false);
    expect(written?.life).toEqual({ seal: { ttl: BROWSER_LOGIN_SECONDS * 1000 } });
  });

  test("the switch on writes the span onto the session and onto the cookie", async () => {
    await login({ body: { name: "owner", password: "right", remember: true } });

    expect(written?.data.remember).toBe(true);
    expect(written?.life?.maxAge).toBe(REMEMBER_LOGIN_SECONDS);
    expect(written?.life?.cookie?.expires.getTime()).toBeGreaterThan(Date.now());
  });

  test("a wrong password writes no session at all", async () => {
    await expect(login({ body: { name: "owner", password: "wrong", remember: true } })).rejects.toThrow();
    expect(written).toBeNull();
  });
});

describe("changing the account", () => {
  test("a kept login is still kept after the password is changed", async () => {
    standing = { user: { name: "owner" }, loggedInAt: 1, remember: true };

    await account({ body: { currentPassword: "right", name: "owner", password: "" } });

    expect(written?.data.remember).toBe(true);
    expect(written?.life?.maxAge).toBe(REMEMBER_LOGIN_SECONDS);
    expect(written?.life?.cookie?.expires.getTime()).toBeGreaterThan(Date.now());
  });

  test("a login that was not kept is not made into one", async () => {
    await account({ body: { currentPassword: "right", name: "owner", password: "" } });

    expect(written?.data.remember).toBe(false);
    expect(written?.life).toEqual({ seal: { ttl: BROWSER_LOGIN_SECONDS * 1000 } });
  });
});
