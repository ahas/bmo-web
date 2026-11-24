import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { carriesSession } from "../../../apps/web/server/utils/session-cookie";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { rawNumber } from "../../support/raw-number";
import { standInHandler } from "../../support/route-handler";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// Every platform administrator is the administrator, by the account service's word alone (docs/accounts.md, 「The
// platform administrators」; docs/web.md, 「Access」): one the account command made after the move passes the route
// guard and every administrator's route though the seal it signed in with recorded nothing, reads another account's
// private room and changes nothing there, and holds nothing of the owner's, whose account is the move's administrator's.
// The service no longer naming them takes the standing away at the next request once the session's window lapses, and
// from an open stream at its next read. A member gains nothing.

const BOSS = 1;
const SECOND = 6;
const MEMBER = 2;
const OWNER_SENDER = 900;
// The owner's private chat, his account's own once his sender is linked; a member's private room with their own BMO; a
// group room.
const OWNER_CHAT = -1;
const PRIVATE = -21;
const GROUP = -7;
const HIGH = "3973025898369060353";

const PRIVATE_OF: Record<number, number> = { [OWNER_CHAT]: BOSS, [PRIVATE]: MEMBER };
const privacy = (room: number) => ({ privateOf: PRIVATE_OF[room] ?? null, sealed: false });

// Whom the account service names a platform administrator: the move's administrator and one the account command made.
const administrators = new Set([BOSS, SECOND]);
const INVITE = { token: "a-token", unit: { id: 3, name: "unit-a" }, company: { id: 1, name: "company-a" }, head: false, expiresAt: 1, createdBy: String(BOSS) };

const accounts = standIn(
  "WEB_SERVER",
  (one) => {
    const path = one.path.split("?")[0] ?? "";
    const user = Number(/^\/users\/(\d+)$/.exec(path)?.[1]);
    const role = one.headers?.["owner-role"];

    if (Number.isSafeInteger(user)) {
      return answer({ user: String(user), name: `account-${user}`, administrator: administrators.has(user), senders: user === BOSS ? [OWNER_SENDER] : [] });
    }
    // The owner's sender stands linked to the move's administrator.
    if (path === "/senders/users") return answer({ links: [{ sender: OWNER_SENDER, user: String(BOSS), signsIn: true }] });
    if (path === "/units") return role === "administrator" ? answer({ units: [] }) : answer({ code: "forbidden", error: "the administrator's" }, 403);
    if (path === "/invites") return answer({ invites: role === "administrator" ? [INVITE] : [] });

    return answer({ code: "failed", error: "Not served here." }, 500);
  },
  { headers: true }
);

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";
  const room = Number(/^\/(?:rooms|pinned-rooms)\/(-?\d+)/.exec(path)?.[1] ?? one.body?.room);
  const rooms = [OWNER_CHAT, PRIVATE, GROUP];

  if (one.method === "GET" && path === "/owner") return answer({ room: OWNER_CHAT, senderId: OWNER_SENDER });
  if (one.method === "GET" && path === "/rooms") return answer({ items: rooms.map((id) => ({ id, title: null, senders: [], ...privacy(id) })), more: false });
  if (one.method === "GET" && /^\/rooms\/-?\d+$/.test(path)) return answer({ id: room, title: null, ...privacy(room) });
  if (one.method === "GET" && /^\/accounts\/\d+\/rooms$/.test(path)) return answer({ rooms: path === `/accounts/${BOSS}/rooms` ? [OWNER_CHAT] : [] });
  if (one.method === "GET" && path === "/providers") return answer({ items: [{ key: "record", label: "Record" }], more: false });
  if (one.method === "GET" && path.endsWith("/providers")) return answer({ providers: ["record"], chosen: true });
  if (one.method === "GET") return answer({ code: "failed", error: "Not served here." }, 500);
  if (path.endsWith("/words")) return answer({ id: rawNumber(HIGH) }, 201);
  if (path.startsWith("/pinned-rooms")) return answer({ roomIds: [room] });
  if (path.endsWith("/tone")) return answer({ tone: one.body?.tone ?? null, tones: [] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["requireUserSession", "signedInUser", "requireAdministrator", "getUserSession", "getCookie", "useRuntimeConfig", "carriesSession"]);

const signedIn = await import("../../../apps/web/server/utils/accounts");

globals.requireUserSession = async () => session;
globals.getUserSession = async () => session;
globals.signedInUser = signedIn.signedInUser;
globals.requireAdministrator = signedIn.requireAdministrator;
globals.getCookie = () => "sealed";
globals.useRuntimeConfig = () => ({ session: { name: "nuxt-session" }, app: { baseURL: "/bmo/" } });
globals.carriesSession = carriesSession;

const { forgetSession, signedInOf, chatAccountOf } = signedIn;
const { LiveRooms, ownRooms, requireReadableRoom, mayChangeRoom } = await import("../../../apps/web/server/utils/room-reach");
const { onOwnersRoad, isOwnerLogin } = await import("../../../apps/web/server/utils/owner");
const { speakerOf } = await import("../../../apps/web/server/utils/console-rooms");
const { ownSenders } = await import("../../../apps/web/server/utils/room-reads");

const guard = standInHandler((await import("../../../apps/web/server/middleware/route-scope")).default);
const route = async (path: string) => await routeOf<unknown>(`../../apps/web/server/api/${path}`);

// The seal of an administrator the account command made after they signed in: it recorded no administrator.
const AS_SECOND = { user: { name: `account-${SECOND}`, id: SECOND }, sid: "bmo.sid=second", administrator: false };
const AS_BOSS = { user: { name: `account-${BOSS}`, id: BOSS }, sid: "bmo.sid=boss", administrator: true };
const AS_MEMBER = { user: { name: `account-${MEMBER}`, id: MEMBER }, sid: "bmo.sid=member", administrator: false };

const LINKED = async () => ({ account: BOSS, linked: true });
const UNLINKED = async () => ({ account: BOSS, linked: false });

// What the route guard answers a request with: 200 where it passes it on to the route.
async function guarded(method: string, path: string): Promise<number> {
  try {
    await guard({ path: `/bmo${path}`, method, context: {} });

    return 200;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? 500;
  }
}

const ADMINISTRATOR_ROUTES: [string, string][] = [
  ["GET", "/api/organization/units"],
  ["GET", "/api/users"],
  ["GET", `/api/rooms/${GROUP}/mode`],
  ["PUT", `/api/rooms/${GROUP}/tone`],
  ["POST", `/api/rooms/${GROUP}/pin`]
];

const receiverWrites = () => receiver.asked.filter((one) => one.method !== "GET");
const roomOnly = (room: number, body?: unknown): RouteEvent => ({ params: { chatId: String(room) }, ...(body === undefined ? {} : { body }) });

describe("an administrator the account command made, whose seal recorded none", () => {
  test("passes the route guard on the administrator's routes, as the move's administrator does", async () => {
    for (const as of [AS_SECOND, AS_BOSS]) {
      session = as;

      for (const [method, path] of ADMINISTRATOR_ROUTES) expect({ path, as: as.user.id, status: await guarded(method, path) }).toEqual({ path, as: as.user.id, status: 200 });
    }
  });

  test("reads the organisation's units and every open invitation, handed on as the administrator", async () => {
    session = AS_SECOND;
    accounts.asked.length = 0;

    expect((await asked(await route("organization/units.get"), {})).status).toBe(200);
    expect(await asked(await route("invites/index.get"), {})).toMatchObject({ status: 200, answer: [INVITE] });
    expect(accounts.asked.filter((one) => one.path === "/units" || one.path === "/invites").map((one) => [one.headers?.["owner-key"], one.headers?.["owner-role"]])).toEqual([
      [String(SECOND), "administrator"],
      [String(SECOND), "administrator"]
    ]);
  });

  test("administers a group room", async () => {
    session = AS_SECOND;
    receiver.asked.length = 0;

    expect((await asked(await route("rooms/[chatId]/pin.post"), roomOnly(GROUP, { pinned: true }))).status).toBe(200);
    expect((await asked(await route("rooms/[chatId]/tone.put"), roomOnly(GROUP, { tone: null }))).status).toBe(200);
    expect(receiverWrites().map((one) => one.body?.account)).toEqual([SECOND, SECOND]);
  });

  test("reads another account's private room, and every change there is refused before a unit hears of it", async () => {
    session = AS_SECOND;
    receiver.asked.length = 0;

    await requireReadableRoom({ context: {} } as never, PRIVATE);
    expect(await mayChangeRoom({ context: {} } as never, PRIVATE)).toBe(false);

    for (const [file, body] of [
      ["rooms/[chatId]/say.post", { text: "hello" }],
      ["rooms/[chatId]/pin.post", { pinned: true }],
      ["rooms/[chatId]/tone.put", { tone: null }]
    ] as const) {
      expect({ file, ...(await asked(await route(file), roomOnly(PRIVATE, body))) }).toMatchObject({ file, status: 403, message: wording("room.error.private_room") });
    }

    expect(receiverWrites()).toEqual([]);
  });

  test("holds nothing of the owner's: the owner's chat is another's private room to him, and his own road is not his", async () => {
    session = AS_SECOND;
    receiver.asked.length = 0;

    const second = await signedInOf(AS_SECOND);

    expect(second).toEqual({ name: `account-${SECOND}`, id: SECOND, administrator: true });
    expect(await isOwnerLogin(second)).toBe(false);
    expect(await onOwnersRoad(second, LINKED)).toBe(false);
    expect(await onOwnersRoad(second, UNLINKED)).toBe(false);
    expect(await speakerOf(second)).toEqual({ account: String(SECOND), name: `account-${SECOND}` });
    expect((await ownRooms(second)).has(OWNER_CHAT)).toBe(false);
    expect(await ownSenders(second, OWNER_SENDER)).toEqual([]);
    expect(await chatAccountOf(second)).toEqual({ accountId: SECOND });

    const owner = await asked(await route("owner.get"), {});

    expect(owner.answer).toEqual({ chatId: OWNER_CHAT, senderId: OWNER_SENDER, senders: [], administrator: true, owner: false });

    // Speaking in the owner's chat is refused as in any account's private room, and nothing goes on his road.
    expect(await asked(await route("rooms/[chatId]/say.post"), roomOnly(OWNER_CHAT, { text: "hello" }))).toMatchObject({ status: 403, message: wording("room.error.private_room") });
    expect(receiverWrites()).toEqual([]);
  });

  test("is refused every act that is the owner's, before anything is asked of the unit it would reach", async () => {
    session = AS_SECOND;

    const OWNERS: { file: string; event: RouteEvent; refusal: string }[] = [
      { file: "questions.post", event: { body: { id: 5, chosen: 0 } }, refusal: "question.error.owner_only" },
      { file: "question-talk.post", event: { body: { id: 5, say: "Why?" } }, refusal: "question.error.owner_only" },
      { file: "question-pause.post", event: { body: { id: 5, paused: true } }, refusal: "question.error.owner_only" },
      { file: "worker-word.post", event: { body: { agent: "agent-a", text: "go on" } }, refusal: "agents.error.word_owner_only" },
      { file: "documents/talk.get", event: { query: { repository: "a", path: "docs/a.md" } }, refusal: "documents.error.talk_owner_only" },
      { file: "documents/talk.post", event: { body: { repository: "a", path: "docs/a.md", say: "Why?" } }, refusal: "documents.error.talk_owner_only" }
    ];

    for (const one of OWNERS) {
      expect({ file: one.file, ...(await asked(await route(one.file), one.event)) }).toMatchObject({ file: one.file, status: 403, message: wording(one.refusal) });
    }
  });

  test("is never linked to the owner's sender", () => {
    expect(accounts.asked.filter((one) => one.method === "PUT" && one.path.includes("/senders/"))).toEqual([]);
  });
});

describe("the move's administrator beside a second one", () => {
  test("is the owner still: his chat, his sender's words and the deployment's own chat account are his", async () => {
    session = AS_BOSS;

    const boss = await signedInOf(AS_BOSS);

    expect(await isOwnerLogin(boss)).toBe(true);
    expect((await ownRooms(boss)).has(OWNER_CHAT)).toBe(true);
    expect(await ownSenders(boss, OWNER_SENDER)).toEqual([OWNER_SENDER]);
    expect(await chatAccountOf(boss)).toEqual({});
    expect((await asked(await route("owner.get"), {})).answer).toEqual({ chatId: OWNER_CHAT, senderId: OWNER_SENDER, senders: [OWNER_SENDER], administrator: true, owner: true });
  });
});

describe("a member", () => {
  test("gains nothing of an administrator's or the owner's", async () => {
    session = AS_MEMBER;

    const member = await signedInOf(AS_MEMBER);

    expect(member.administrator).toBe(false);
    expect(await guarded("GET", "/api/organization/units")).toBe(404);
    expect(await guarded("GET", "/api/users")).toBe(404);
    expect(await asked(await route("organization/units.get"), {})).toMatchObject({ status: 403, message: wording("common.error.administrator_only") });
    expect(await chatAccountOf(member)).toEqual({ accountId: MEMBER });
    expect((await asked(await route("owner.get"), {})).answer).toMatchObject({ senders: [], administrator: false, owner: false });
  });
});

describe("an administrator the service no longer names one", () => {
  test("loses the standing at the next request once the session's window lapses, the seal's word notwithstanding", async () => {
    // A seal that recorded the standing at sign-in.
    session = { ...AS_SECOND, administrator: true };
    expect(await guarded("GET", "/api/organization/units")).toBe(200);

    administrators.delete(SECOND);

    try {
      // Within the window the word read last holds; the window lapsed, the service is asked again.
      expect(await guarded("GET", "/api/organization/units")).toBe(200);
      forgetSession(AS_SECOND.sid);

      for (const [method, path] of ADMINISTRATOR_ROUTES) expect({ path, status: await guarded(method, path) }).toEqual({ path, status: 404 });

      expect(await asked(await route("organization/units.get"), {})).toMatchObject({ status: 403, message: wording("common.error.administrator_only") });
    } finally {
      administrators.add(SECOND);
      forgetSession(AS_SECOND.sid);
    }
  });

  test("loses an open stream at its next read", async () => {
    session = AS_SECOND;

    const signed = await signedInOf(AS_SECOND);
    const rooms = new LiveRooms(signed, "all", async () => await signedInOf(AS_SECOND));
    let lost = 0;
    const stop = rooms.follow(() => (lost += 1), 20);

    try {
      await Bun.sleep(60);
      await rooms.settled();
      expect([lost, rooms.has(PRIVATE)]).toEqual([0, true]);

      administrators.delete(SECOND);
      forgetSession(AS_SECOND.sid);

      for (let tries = 0; tries < 100 && lost === 0; tries += 1) await Bun.sleep(5);

      expect([lost, rooms.has(PRIVATE)]).toEqual([1, false]);
    } finally {
      stop();
      administrators.add(SECOND);
      forgetSession(AS_SECOND.sid);
    }
  });
});
