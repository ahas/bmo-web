// The browser harness's invite room, as its stand-in receiver answers it and the test that invites into it names it
// (docs/web.md, the room screen's section on opening a room and letting people in): a room opened in the console,
// its opener leading it, a member who writes, a member whose rooms section only reads, and one guest for each width
// the test drives, none of them a member until a member lets them in. The receiver's part is kept as the receiver
// keeps it: the room's members, whom the account service reads to judge who may let a person in, the rooms each
// account is a member of, and the line the room hears for each person let in. The room is no deployment's room, so
// no administrator's room list holds it.

/** The room's number. */
export const INVITE_ROOM = -9_002_000_000_005;

/** The accounts the room is made with and the guests the test lets in, each by the name and password it signs in
 * with; the opener never signs in. */
export const INVITE_ACCOUNTS = {
  opener: { name: "invite-opener", password: "fixture-password-3961" },
  writer: { name: "invite-writer", password: "fixture-password-3962" },
  reader: { name: "invite-reader", password: "fixture-password-3963" },
  guests: [
    { name: "invite-guest-1280", password: "fixture-password-3964" },
    { name: "invite-guest-360", password: "fixture-password-3965" }
  ]
} as const;

/** The words the opener said in the room before anyone was let in. */
export const OPENING_WORDS = "welcome to the room";

interface Held {
  // The users each fixture name stands for, once the accounts stand.
  ids: Map<string, number>;
  members: Set<number>;
  line: Record<string, unknown>[];
}

const held: Held = { ids: new Map(), members: new Set(), line: [] };

/** Takes the users the fixture's accounts stand for and makes the room: its opener, the writer and the reader its
 * members, the opener's words its first line. */
export function inviteRoomMade(users: readonly { user: string; name: string }[], at: number): void {
  const named = [INVITE_ACCOUNTS.opener, INVITE_ACCOUNTS.writer, INVITE_ACCOUNTS.reader, ...INVITE_ACCOUNTS.guests];

  for (const { name } of named) {
    const one = users.find((user) => user.name === name);

    if (one === undefined) throw new Error(`${name} stands in no users list`);

    held.ids.set(name, Number(one.user));
  }

  const opener = idOf(INVITE_ACCOUNTS.opener.name);

  held.members = new Set([opener, idOf(INVITE_ACCOUNTS.writer.name), idOf(INVITE_ACCOUNTS.reader.name)]);
  held.line = [message(1, at - 60_000, { senderId: 21, senderName: INVITE_ACCOUNTS.opener.name, text: OPENING_WORDS })];
}

/** The room as the room list reads it, from the room the stand-in builds every room from, asked before the accounts
 * stand as well as after. */
export function inviteRoomListed<Room extends object>(room: Room) {
  const last = held.line.at(-1);

  return {
    ...room, id: INVITE_ROOM, title: "invite-room", ownerRoom: false, workRoom: INVITE_ROOM, listened: false, mode: null,
    // A room opened in the console names its opener's own BMO as the supervisor that answers it; until the accounts
    // stand the room names none, and no list holds it.
    supervisors: held.ids.has(INVITE_ACCOUNTS.opener.name) ? [`u${idOf(INVITE_ACCOUNTS.opener.name)}`] : [],
    messageCount: held.line.length, lastMessageAt: (last?.sentAt as number | undefined) ?? null
  };
}

/** The rooms an account is a member of here: the invite room where it is one, none otherwise. */
export function inviteRoomsOf(account: number): number[] {
  return held.members.has(account) ? [INVITE_ROOM] : [];
}

/** The room's roads as the receiver answers them; null for any road it does not serve, which the stand-in answers as
 * it answers every room. */
export async function inviteRoom(path: string, request: Request): Promise<Response | null> {
  const room = new RegExp(`^/rooms/${INVITE_ROOM}(/.*)?$`).exec(path);

  if (room === null) return null;

  switch (`${request.method} ${room[1] ?? ""}`) {
    case "GET /messages":
      return Response.json({ items: held.line, more: false });
    case "GET /providers":
      return Response.json({ providers: ["record"], chosen: true, fileLimit: null });
    case "GET /title":
      return Response.json({ title: "invite-room" });
    case "GET /leaders":
      return Response.json({ room: INVITE_ROOM, leaders: [idOf(INVITE_ACCOUNTS.opener.name)] });
    case "GET /members":
      return Response.json({ code: "record-only-room", error: "The room is on the record alone." }, { status: 409 });
    case "GET /accounts":
      return Response.json({ accounts: [...held.members].map((account) => ({ account, addedBy: null, addedAt: null })) });
    case "POST /accounts":
      return Response.json(letIn((await request.json()) as { accounts?: number[]; by?: number }));
    default:
      return null;
  }
}

// The accounts asked let in as the receiver lets them in: those not members yet, with one line naming who let whom in.
function letIn(asked: { accounts?: number[]; by?: number }): { accounts: Record<string, unknown>[]; letIn: number[] } {
  const fresh = (asked.accounts ?? []).filter((account) => !held.members.has(account));

  for (const account of fresh) held.members.add(account);

  if (fresh.length > 0) {
    const fields = fresh.length === 1 ? { code: "account-let-in", fields: { account: fresh[0], by: asked.by } } : { code: "accounts-let-in", fields: { accounts: fresh, by: asked.by } };

    held.line.push(message(held.line.length + 1, Date.now(), { senderId: null, senderName: "agent-a", kind: "fixed-line", line: fields, text: "someone was let in" }));
  }

  return { accounts: (asked.accounts ?? []).map((account) => ({ account, addedBy: asked.by ?? null, addedAt: null })), letIn: fresh };
}

function idOf(name: string): number {
  const id = held.ids.get(name);

  if (id === undefined) throw new Error(`${name} is no account of the invite room's yet`);

  return id;
}

function message(id: number, at: number, over: Record<string, unknown>): Record<string, unknown> {
  return {
    id, room: INVITE_ROOM, senderId: 21, senderName: "", sentAt: at, text: "", imagePath: null, replyToMessageId: null,
    answerSeconds: null, round: null, album: null, via: "record", files: [], ...over
  };
}
