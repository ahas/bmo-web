import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";

import { standInAccountService } from "../../support/account-service";
import { standInHandler } from "../../support/route-handler";
import { answer, standIn } from "../../support/units";

// Whose profile pictures a member sees (docs/web.md, 「Profile photos」): the rooms they read and the people they
// share one of those rooms with, their own identities and the chat agents they see, and nothing of another company.
// Two companies stand: in A the member (60) and a colleague (62), with the member's own BMO's private room and a group
// room both are members of; in B another person (61) with their own BMO's private room. The receiver keeps a picture
// of every room and every person; the deployment's BMO speaks in both private rooms.

const MEMBER = 60;
const COLLEAGUE = 62;
const STRANGER = 61;
const MEMBERS_ROOM = -9_000_000_000_124;
const GROUP = -9_000_000_000_300;
const STRANGERS_ROOM = -9_000_000_000_200;
// The person numbers each identity and agent speaks under.
const MEMBERS_SENDER = 600;
const MEMBERS_OTHER_SENDER = 601;
const COLLEAGUES_SENDER = 620;
const STRANGERS_SENDER = 610;
const DEPLOYMENTS_BMO = 900;
const MEMBERS_BMO = 960;
const STRANGERS_BMO = 961;

const service = standInAccountService({
  users: [
    { id: 1, name: "boss", administrator: true },
    { id: MEMBER, name: "member", senders: [MEMBERS_SENDER, MEMBERS_OTHER_SENDER] },
    { id: STRANGER, name: "stranger", senders: [STRANGERS_SENDER] },
    { id: COLLEAGUE, name: "colleague", senders: [COLLEAGUES_SENDER] }
  ]
});

const rooms = [
  { id: MEMBERS_ROOM, senders: [MEMBERS_SENDER, MEMBERS_BMO, DEPLOYMENTS_BMO], privateOf: MEMBER },
  // The colleague was let in and has said nothing yet.
  { id: GROUP, senders: [MEMBERS_SENDER], privateOf: null },
  { id: STRANGERS_ROOM, senders: [STRANGERS_SENDER, STRANGERS_BMO, DEPLOYMENTS_BMO], privateOf: STRANGER }
];
const accounts = new Map<number, number[]>([
  [MEMBERS_ROOM, [MEMBER]],
  [GROUP, [MEMBER, COLLEAGUE]],
  [STRANGERS_ROOM, [STRANGER]]
]);
const numbers: Record<string, number> = { bmo: DEPLOYMENTS_BMO, u60: MEMBERS_BMO, u61: STRANGERS_BMO };
const pictures = [
  ...rooms.map((room) => ({ kind: "room", id: room.id })),
  ...[MEMBERS_SENDER, MEMBERS_OTHER_SENDER, COLLEAGUES_SENDER, STRANGERS_SENDER, DEPLOYMENTS_BMO, MEMBERS_BMO, STRANGERS_BMO].map((id) => ({ kind: "person", id }))
].map((picture, at) => ({ ...picture, takenAt: at + 1 }));

standIn("RECEIVER", (asked) => {
  const path = asked.path.split("?")[0]!;
  const membership = path.match(/^\/accounts\/(\d+)\/rooms$/);
  const members = path.match(/^\/rooms\/(-?\d+)\/accounts$/);
  const ownNumber = path.match(/^\/rooms\/(-?\d+)\/own-number$/);

  if (path === "/avatars") return answer({ items: pictures, more: false });
  if (path === "/rooms") {
    return answer({
      items: rooms.map((room) => ({
        id: room.id,
        title: null,
        messageCount: 1,
        lastMessageAt: 1,
        pinned: false,
        senders: room.senders,
        supervisors: [],
        ownerRoom: false,
        registered: true,
        workRoom: 0,
        privateOf: room.privateOf,
        sealed: false
      })),
      more: false
    });
  }
  if (membership !== null) {
    const account = Number(membership[1]);

    return answer({ rooms: [...accounts].filter(([, held]) => held.includes(account)).map(([room]) => room) });
  }
  if (members !== null) return answer({ accounts: (accounts.get(Number(members[1])) ?? []).map((one) => ({ account: String(one) })) });
  if (ownNumber !== null) {
    const agent = new URL(`http://x${asked.path}`).searchParams.get("agentName") ?? "";

    return answer({ number: numbers[agent] ?? null });
  }

  return answer({ error: "no such route", code: "not-found" }, 404);
});
standIn("AGENCY", (asked) => {
  if (asked.path.startsWith("/supervisors/")) return answer({ items: [] });

  return answer({
    items: [
      { name: "bmo", label: "BMO", ownerAccount: null },
      { name: "u60", label: "member's BMO", ownerAccount: MEMBER },
      { name: "u61", label: "stranger's BMO", ownerAccount: STRANGER }
    ]
  });
});

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;
process.env.RECEIVER_TOKEN = "the receiver's token";

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["createError", "fail", "getRouterParam", "requireUserSession", "defineEventHandler", "avatarReach", "reaches", "avatarRefs"]);
globals.requireUserSession = async () => session;
globals.createError = (error: { statusCode: number; statusMessage?: string }) => Object.assign(new Error(error.statusMessage), error);
globals.fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
globals.getRouterParam = (event: { context: { params: Record<string, string> } }, name: string) => event.context.params[name];
globals.defineEventHandler = (handler: unknown) => handler;

const reach = await import("../../../apps/web/server/utils/avatar-reach");
const { avatarRefs } = await import("../../../apps/web/server/utils/avatars");

globals.avatarReach = reach.avatarReach;
globals.reaches = reach.reaches;
globals.avatarRefs = avatarRefs;

const listed = standInHandler((await import("../../../apps/web/server/api/avatars.get")).default);
const one = standInHandler((await import("../../../apps/web/server/api/avatars/[kind]/[id].get")).default);

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

// A request of its own each time, so nothing one test read is held for another.
const event = (params: Record<string, string> = {}) => ({ context: { params } });
const signedAs = (id: number, name: string, administrator = false) => {
  session = { user: { name, id }, sid: `bmo.sid=${name}`, administrator };
};
const subjects = async () => (await listed(event())).map((ref) => `${ref.kind} ${ref.id}`).sort();
const status = async (kind: string, id: number) =>
  await one(event({ kind, id: String(id) })).then(
    () => 200,
    (error: { statusCode?: number }) => error.statusCode ?? 500
  );

describe("the profile pictures a member sees", () => {
  beforeEach(() => {
    signedAs(MEMBER, "member");
  });

  test("are those of the rooms they read and the people and agents they share them with, and none of another company", async () => {
    expect(await subjects()).toEqual(
      [
        `room ${MEMBERS_ROOM}`,
        `room ${GROUP}`,
        `person ${MEMBERS_SENDER}`,
        `person ${MEMBERS_OTHER_SENDER}`,
        // A member let into a shared room is seen before saying anything.
        `person ${COLLEAGUES_SENDER}`,
        `person ${DEPLOYMENTS_BMO}`,
        `person ${MEMBERS_BMO}`
      ].sort()
    );
  });

  test("leave another company's person, room and BMO answering as if they did not stand", async () => {
    expect(await status("room", STRANGERS_ROOM)).toBe(404);
    expect(await status("person", STRANGERS_SENDER)).toBe(404);
    expect(await status("person", STRANGERS_BMO)).toBe(404);
  });

  test("are every picture for the administrator", async () => {
    signedAs(1, "boss", true);

    expect((await subjects()).length).toBe(pictures.length);
  });
});
