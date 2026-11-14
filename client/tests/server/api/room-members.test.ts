import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomMember } from "../../../apps/web/shared/types";

// A room's members (docs/web.md, the room screen's members entry): the receiver's list as the room's chat service read
// it, each member marked with the console account they are only where the account service links their person number
// to a user who may sign in, and the receiver's refusal said by the pack's sentence for its code.

const ROOM = -7;
const KNOWN = 9_000_000_000_101;
const UNKNOWN = 9_000_000_000_102;
const GRANTED = 9_000_000_000_103;

const receiver = standIn("RECEIVER", (one) => {
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
  if (one.path === "/rooms/-8/members") return answer({ code: "not-found", error: "The room's members were never read." }, 404);
  if (one.path === "/rooms/-9/members") return answer({ code: "no-route", error: "There is no route here." }, 404);
  if (one.path === "/rooms/-10/members") return answer({ members: [{ person: KNOWN, name: "member-a", statusMessage: null }] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

// The account service links the known member to a user who signs in, and the granted one to a user made by a grant,
// who cannot; a room asked for after that refuses the lookup.
let accountsAnswer = true;
const server = standIn("WEB_SERVER", (one) => {
  if (!accountsAnswer) return answer({ code: "database", error: "The database did not answer." }, 500);

  return answer({
    links: [
      { sender: KNOWN, user: "7", signsIn: true },
      { sender: GRANTED, user: "8", signsIn: false }
    ].filter((link) => ((one.body?.senders ?? []) as number[]).includes(link.sender))
  });
});

const read = await routeOf<RoomMember[]>("../../apps/web/server/api/rooms/[chatId]/members.get");

describe("a room's members", () => {
  test("stand in the receiver's order with their status lines, a known account marked and everyone else not", async () => {
    server.asked.length = 0;

    expect((await asked(read, { params: { chatId: String(ROOM) } })).answer).toEqual([
      { person: KNOWN, name: "member-a", status: "status-a", account: "7" },
      { person: UNKNOWN, name: "member-b", status: null, account: null },
      { person: GRANTED, name: "member-c", status: null, account: null },
      { person: null, name: "member-d", status: "status-d", account: null }
    ]);
    // One lookup for every member with a number, and none for the member without one or the row with no name.
    expect(server.asked.map((one) => [one.method, one.path, one.body])).toEqual([
      ["POST", "/senders/users", { senders: [KNOWN, UNKNOWN, GRANTED] }]
    ]);
  });

  test("say the receiver's refusal by the pack's sentence for its code, and ask the account service nothing", async () => {
    server.asked.length = 0;

    expect(await asked(read, { params: { chatId: "-8" } })).toMatchObject({ status: 404, message: wording("members.error.not_filled") });
    expect(await asked(read, { params: { chatId: "-9" } })).toMatchObject({ status: 404, message: wording("members.error.not_served") });
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
