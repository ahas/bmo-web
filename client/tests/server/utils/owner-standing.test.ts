import { describe, expect, test } from "bun:test";

import { SQL } from "bun";

import { asked, routeOf } from "../../support/nitro";
import { globalsRestoredAfter } from "../../support/globals";
import { answer, standIn } from "../../support/units";
import { scratchWebDatabase } from "../../support/web-database";

// Whose the owner's account is (docs/accounts.md, 「The owner's account」): the user the account service links to the
// sender the receiver names as the owner's. Where none is linked, the link is made to the user the data move made the
// platform administrator, and a link that stands is never moved. Where it cannot be made, the move's administrator
// stands as the owner unlinked and keeps the owner's own road.

const OWNER_SENDER = 900;
const MOVED = 1;

// Who the account service links the owner's sender to now, and whether it takes a new link.
let linkedTo: number | null = null;
let linking: "takes" | "refuses" = "takes";

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/owner") return answer({ room: -1, senderId: OWNER_SENDER });
  if (path === "/owner/messages") return answer({ id: 5 }, 201);
  if (/^\/rooms\/-?\d+\/words$/.test(path)) return answer({ id: 6 }, 201);

  return answer({ id: Number(path.split("/")[2]), title: null, privateOf: null, sealed: false });
});

const accounts = standIn("WEB_SERVER", (one) => {
  if (one.path === "/senders/users") {
    return answer({ links: linkedTo === null ? [] : [{ sender: OWNER_SENDER, user: String(linkedTo), signsIn: true }] });
  }

  const link = /^\/users\/(\d+)\/senders\/(\d+)$/.exec(one.path);

  if (link !== null && one.method === "PUT") {
    if (linking === "refuses") return answer({ code: "failed", error: "the service could not write the link" }, 500);

    linkedTo = Number(link[1]);

    return new Response(null, { status: 204 });
  }

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const { isOwnerLogin, onOwnersRoad, ownerStanding } = await import("../../../apps/web/server/utils/owner");

const moved = async () => String(MOVED);
const linksMade = () => accounts.asked.filter((one) => one.method === "PUT").map((one) => one.path);

describe("the owner's account", () => {
  test("is the user the owner's sender is linked to, and a link that stands is never moved", async () => {
    linkedTo = 5;
    accounts.asked.length = 0;

    expect(await ownerStanding(moved)).toEqual({ account: 5, linked: true });
    expect(linksMade()).toEqual([]);
  });

  test("is the data move's administrator, linked the first time it is asked where the sender stands linked to none", async () => {
    linkedTo = null;
    linking = "takes";
    accounts.asked.length = 0;

    expect(await ownerStanding(moved)).toEqual({ account: MOVED, linked: true });
    expect(linksMade()).toEqual([`/users/${MOVED}/senders/${OWNER_SENDER}`]);

    // Asked again, the link stands and nothing more is written.
    accounts.asked.length = 0;
    expect(await ownerStanding(moved)).toEqual({ account: MOVED, linked: true });
    expect(linksMade()).toEqual([]);
  });

  test("stands unlinked where no data move names an administrator, and nothing is linked", async () => {
    linkedTo = null;
    accounts.asked.length = 0;

    expect(await ownerStanding(async () => null)).toEqual({ account: null, linked: false });
    expect(linksMade()).toEqual([]);
  });

  test("stands as the move's administrator unlinked where the link cannot be made, who keeps the owner's road", async () => {
    linkedTo = null;
    linking = "refuses";

    const standing = await ownerStanding(moved);

    expect(standing).toEqual({ account: MOVED, linked: false });
    expect(await onOwnersRoad({ name: "boss", id: MOVED, administrator: true }, async () => standing)).toBe(true);
    expect(await onOwnersRoad({ name: "other", id: 2, administrator: true }, async () => standing)).toBe(false);
    linking = "takes";
  });

  test("leaves the owner's road to the console login before the model once the link stands", async () => {
    const linked = async () => ({ account: MOVED, linked: true });

    expect(await onOwnersRoad({ name: "boss", id: MOVED, administrator: true }, linked)).toBe(false);
    expect(await onOwnersRoad({ name: "boss", id: null, administrator: true }, linked)).toBe(true);
    expect(await onOwnersRoad({ name: "member", id: null, administrator: false }, linked)).toBe(false);
  });

  test("is the owner's login for the user linked, and for no other account", async () => {
    linkedTo = 5;

    expect(await isOwnerLogin({ name: "owner", id: 5, administrator: false })).toBe(true);
    expect(await isOwnerLogin({ name: "boss", id: MOVED, administrator: true })).toBe(false);
    expect(await isOwnerLogin({ name: "boss", id: null, administrator: true })).toBe(true);
  });
});

describe("the owner's words from the console", () => {
  test("go on the owner's own road while his sender cannot be linked, and as his account once it is", async () => {
    // The data move's record: the user it made the platform administrator.
    const address = await scratchWebDatabase();
    const { connectionOf } = await import("../../../apps/web/server/utils/db");
    const database = new SQL(connectionOf(address) as SQL.Options);

    await database.unsafe(`INSERT INTO "settings" ("key", "value") VALUES ('users_administrator', '${MOVED}')`);
    // The server's migration reads the administrator through this function, which the tables' fixture leaves out.
    await database.unsafe(`CREATE OR REPLACE FUNCTION "bmo_administrator"() RETURNS bigint LANGUAGE sql STABLE AS
      $$ SELECT CAST("value" AS bigint) FROM "settings" WHERE "key" = 'users_administrator' $$`);
    await database.close();

    const globals: Record<string, unknown> = globalThis;

    globalsRestoredAfter(["requireUserSession", "signedInUser"]);
    globals.requireUserSession = async () => ({ user: { name: "boss", id: MOVED }, sid: "bmo.sid=boss", administrator: true });
    globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

    const say = await routeOf<{ messageId: string }>("../../apps/web/server/api/rooms/[chatId]/say.post");
    const sends = () => receiver.asked.filter((one) => one.method === "POST").map((one) => one.path);

    linkedTo = null;
    linking = "refuses";
    receiver.asked.length = 0;

    expect((await asked(say, { params: { chatId: "-1" }, body: { text: "hello" } })).answer).toEqual({ messageId: "5" });
    expect(sends()).toEqual(["/owner/messages"]);

    linking = "takes";
    receiver.asked.length = 0;

    expect((await asked(say, { params: { chatId: "-1" }, body: { text: "hello" } })).answer).toEqual({ messageId: "6" });
    expect(sends()).toEqual(["/rooms/-1/words"]);
  });
});
