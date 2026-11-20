import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomMembersView } from "../../../apps/web/shared/types";

// A room's members (docs/web.md, the room screen's members entry), by either road: the receiver's list as the room's
// chat service read it, each member marked with the console account they are only where the account service links
// their person number to a user who may sign in, then the accounts let in in the console that list leaves out; the
// receiver's refusal said by the pack's sentence for its code, and a room no chat service carries, or whose chat
// service lists no members, standing with its accounts alone and saying which.

const ROOM = -7;
const KNOWN = 9_000_000_000_101;
const UNKNOWN = 9_000_000_000_102;
const GRANTED = 9_000_000_000_103;

const receiver = standIn("RECEIVER", (one) => {
  if (one.path === `/rooms/${ROOM}/accounts`) return answer({ accounts: [{ account: "7", addedBy: null, addedAt: 1 }, { account: "12", addedBy: "7", addedAt: 2 }] });
  if (one.path === "/rooms/-12/accounts") return answer({ accounts: [{ account: "12", addedBy: null, addedAt: 1 }, { account: "13", addedBy: "12", addedAt: 2 }] });
  if (one.path.endsWith("/accounts")) return answer({ accounts: [] });
  // Whose private room each room is: -14 is an account's own private room, -15 a sealed one, every other room no one's.
  if (/^\/rooms\/-?\d+$/.test(one.path)) {
    return answer({ id: Number(one.path.split("/")[2]), title: null, privateOf: one.path === "/rooms/-14" ? 12 : null, sealed: one.path === "/rooms/-15" });
  }
  if (["/rooms/-12/members", "/rooms/-14/members", "/rooms/-15/members"].includes(one.path)) return answer({ code: "record-only-room", error: "The room is on the record alone." }, 409);
  if (one.path === `/rooms/${ROOM}/members`) {
    return answer({
      members: [
        { person: KNOWN, name: "member-a", statusMessage: "status-a" },
        { person: UNKNOWN, name: "member-b", statusMessage: null },
        { person: GRANTED, name: "member-c", statusMessage: "" },
        { person: null, name: "member-d", statusMessage: "status-d" },
        { person: KNOWN + 1, name: "", statusMessage: "a row with no name" }
      ]
    });
  }
  if (one.path === "/rooms/-8/members") return answer({ code: "members-unheld", error: "Chat A gave no members of the room." }, 409);
  if (one.path === "/rooms/-9/members") return answer({ code: "members-unlisted", error: "Chat A does not list the members of a room." }, 409);
  if (one.path === "/rooms/-10/members") return answer({ members: [{ person: KNOWN, name: "member-a", statusMessage: null }] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

// The account service links the known member to a user who signs in, and the granted one to a user made by a grant,
// who cannot; user 12 has a person's name and every other user its login alone; a room asked for after that refuses
// the lookup.
let accountsAnswer = true;
const server = standIn("WEB_SERVER", (one) => {
  if (!accountsAnswer) return answer({ code: "database", error: "The database did not answer." }, 500);

  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  if (user !== undefined) return answer({ user, name: `account-${user}`, fullName: user === "12" ? "person-12" : "", administrator: false, senders: [] });

  return answer({
    links: [
      { sender: KNOWN, user: "7", signsIn: true },
      { sender: GRANTED, user: "8", signsIn: false }
    ].filter((link) => ((one.body?.senders ?? []) as number[]).includes(link.sender))
  });
});

const read = await routeOf<RoomMembersView>("../../apps/web/server/api/rooms/[chatId]/members.get");

describe("a room's members", () => {
  test("stand in the receiver's order with their status lines, a known account marked and everyone else not", async () => {
    server.asked.length = 0;

    expect((await asked(read, { params: { chatId: String(ROOM) } })).answer).toEqual({
      members: [
        { person: KNOWN, name: "member-a", status: "status-a", account: "7", inConsole: true },
        { person: UNKNOWN, name: "member-b", status: null, account: null, inConsole: false },
        { person: GRANTED, name: "member-c", status: null, account: null, inConsole: false },
        { person: null, name: "member-d", status: "status-d", account: null, inConsole: false },
        { person: null, name: "person-12", status: null, account: "12", inConsole: true }
      ],
      chatMembers: "listed",
      mayLetIn: true
    });
    // One lookup for every member with a number, and none for the member without one or the row with no name; then
    // the name of the one account let in that the chat service does not list.
    expect(server.asked.map((one) => [one.method, one.path, one.body])).toEqual([
      ["POST", "/senders/users", { senders: [KNOWN, UNKNOWN, GRANTED] }],
      ["GET", "/users/12", null]
    ]);
  });

  test("of a private room, sealed or not, offer nobody to let in, the administrator included, since the receiver keeps them as they stand", async () => {
    expect((await asked(read, { params: { chatId: "-14" } })).answer?.mayLetIn).toBe(false);
    expect((await asked(read, { params: { chatId: "-15" } })).answer?.mayLetIn).toBe(false);
  });

  test("of a room no chat service carries are its accounts alone, each by its person's name, its login where none stands", async () => {
    expect((await asked(read, { params: { chatId: "-12" } })).answer).toEqual({
      members: [
        { person: null, name: "person-12", status: null, account: "12", inConsole: true },
        { person: null, name: "account-13", status: null, account: "13", inConsole: true }
      ],
      chatMembers: "no-service",
      mayLetIn: true
    });
  });

  test("of a room whose chat service lists no members are its accounts alone, none here, with no refusal", async () => {
    expect((await asked(read, { params: { chatId: "-9" } })).answer).toEqual({ members: [], chatMembers: "unlisted", mayLetIn: true });
  });

  test("say the receiver's refusal by the pack's sentence for its code, and ask the account service nothing", async () => {
    server.asked.length = 0;

    expect(await asked(read, { params: { chatId: "-8" } })).toMatchObject({ status: 409, message: wording("members.error.unheld") });
    expect(await asked(read, { params: { chatId: "-11" } })).toMatchObject({ status: 502, message: wording("room.error.receiver_failed") });
    expect(server.asked).toEqual([]);
  });

  test("stand as no list where the account service cannot say who is a console user", async () => {
    accountsAnswer = false;

    try {
      expect(await asked(read, { params: { chatId: "-10" } })).toMatchObject({ status: 502, message: wording("members.error.accounts_failed") });
    } finally {
      accountsAnswer = true;
    }
    expect(receiver.asked.some((one) => one.path === "/rooms/-10/members")).toBe(true);
  });
});
