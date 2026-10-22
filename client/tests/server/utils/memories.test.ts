import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { MemoriesView, MemoryChanged, MemoryRecord } from "../../../apps/web/shared/types";

// The memories screen's rows: what the stood-in brain answers, read by what the stood-in agency calls each agent
// and by what the stood-in receiver calls each room and person and keeps of each message. The brain's fixed API
// keeps one generic row and the caller's own facts in its labels, so the row's own names are read back from them.
// What it is held to is that a unit that does not know a name leaves the row standing by its number, that taking a
// row down goes to the brain with its reason, and that the brain's refusal is said by the pack's sentence for its
// code.

const OWNER_CHAT = 5;
const ROOM = -7;
const PERSON = 77;

function labels(over: Record<string, string> = {}): Record<string, string> {
  return { agent: "agent-a", type: "promise", reach: "all", action: "tell when the shell ends", setBy: "", ...over };
}

function memory(id: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    scope: "room:-7",
    subjectKey: null,
    kind: "note",
    text: "tell when the shell ends",
    state: "standing",
    labels: labels({ slug: `m${id}`, chatId: String(OWNER_CHAT) }),
    conditions: [],
    dueAt: null,
    lastMatchedAt: null,
    matchCount: 0,
    createdAt: 100_000,
    changedAt: 100_000,
    watches: [],
    ...over
  };
}

const rows = [
  memory(1),
  memory(2, { labels: labels({ slug: "m2", type: "followup", chatId: String(ROOM), action: "ask again tomorrow", forUser: String(PERSON), setBy: "1", messageId: "1" }) }),
  memory(3, { labels: labels({ slug: "m3", type: "followup", chatId: String(ROOM), action: "a stranger", forUser: "999", messageId: "99" }) }),
  memory(4, { labels: labels({ slug: "m4", type: "situation", reach: "group", condition: "when asked about lunch", action: "briefly", messageId: "1" }) }),
  memory(5, { labels: labels({ slug: "m5", agent: "agent-b", chatId: String(ROOM) }) })
];

const brain = standIn("BRAIN", (one) => {
  const url = new URL(one.path, "http://brain");
  const path = url.pathname;

  if (one.method === "GET" && path === "/memories") {
    const slug = url.searchParams.get("label")?.replace("slug=", "");
    const found = slug === undefined || slug === null ? rows : rows.filter((row) => (row.labels as Record<string, string>).slug === slug);

    return answer({ items: found, more: false });
  }

  if (one.method === "PATCH" && path.startsWith("/memories/")) {
    const id = Number(path.split("/").at(-1));

    if (id === 2) return answer({ code: "conflict", error: "the row is already down", refusal: { code: "already-down", error: "the row is already down" } }, 409);

    return answer({ ...rows[0], state: one.body?.state, labels: { ...labels({ slug: "m1", chatId: String(OWNER_CHAT) }), ...(one.body?.labels as Record<string, string>) } });
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

standIn("AGENCY", (one) => {
  const path = one.path.split("?")[0]!;

  if (path === "/agents") return answer({ items: [{ name: "agent-a", label: "Agent A", role: "builder", gates: null, reasoning: null, voice: null, resetAt: null, standInAvailable: false }, { name: "agent-b", label: null, role: "builder", gates: null, reasoning: null, voice: null, resetAt: null, standInAvailable: false }], more: false });
  if (path === "/workers") return answer({ items: [], more: false });

  return answer({ code: "not-found", error: "no route" }, 404);
});

standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0]!;

  if (path === "/rooms") {
    return answer({ items: [OWNER_CHAT, ROOM].map((id) => ({ id, title: id === ROOM ? "Room A" : null, messageCount: 1, lastMessageAt: 1, pinned: false, senders: [], companions: [], ownerRoom: id === OWNER_CHAT, registered: true, workRoom: 0 })), more: false });
  }
  if (path === "/owner") return answer({ room: OWNER_CHAT, senderId: OWNER_CHAT });
  if (path === "/people") {
    const ids = (new URL(one.path, "http://receiver").searchParams.get("ids") ?? "").split(",").map(Number);

    return answer({ items: ids.map((id) => ({ id, name: id === PERSON ? "Person A" : null })), more: false });
  }
  if (path === `/rooms/${ROOM}/messages/1`) {
    return answer({ id: 1, room: ROOM, senderId: PERSON, senderName: "Person A", sentAt: 100_000, text: "hello", imagePath: null, replyToMessageId: null, answerSeconds: null, round: null, album: null, via: null, files: [] });
  }
  if (path === `/rooms/${ROOM}/messages/99`) return answer({ code: "not-found", error: "no such message" }, 404);

  return answer({ code: "not-found", error: "no such message" }, 404);
});

const { registerChatAgent } = await import("../../../apps/web/shared/agent-names");

registerChatAgent({ name: "agent-a", label: "Agent A" });

const read = await routeOf<MemoriesView>("../../apps/web/server/api/memories.get.ts");
const change = await routeOf<MemoryChanged>("../../apps/web/server/api/memories.post.ts");
const { memories } = await read({});
const [ownerRow, personRow, strangerRow, globalRow, otherRow] = memories;

describe("the memories as the screen reads them", () => {
  test("are the brain's rows, narrowed to a room where the screen names one", async () => {
    expect(memories.map((one) => one.id)).toEqual([1, 2, 3, 4, 5]);

    const inRoom = await read({ query: { chat: String(ROOM) } });

    expect(inRoom.memories.map((one) => one.id)).toEqual([2, 3, 5]);
    expect(brain.asked.at(-1)?.path).toBe("/memories?limit=500");
  });

  test("a room is read by its name, the owner's own by the chat agent's, and a global row by none", () => {
    expect(ownerRow!.room).toBe("Agent A");
    expect(personRow!.room).toBe("Room A");
    expect(globalRow!.room).toBeNull();
  });

  test("whose a row is is read by what the agency calls the agent, and by its name where it gives no label", () => {
    expect(ownerRow!.agentLabel).toBe("Agent A");
    expect(otherRow!.agentLabel).toBe("agent-b");
  });

  test("a person is read by the name they last spoke under, and by their number where none is known", () => {
    expect(personRow!.forName).toBe("Person A");
    expect(strangerRow!.forName).toBe("999");
    expect(ownerRow!.forName).toBeNull();
    expect(personRow!.setByName).toBe("1");
  });

  test("the message a row was set from is read in its own room, and a global row or a message not kept gives none", () => {
    expect(personRow!.message).toEqual({ senderName: "Person A", sentAt: 100, text: "hello" });
    expect(strangerRow!.message).toBeNull();
    expect(globalRow!.message).toBeNull();
  });

  test("no watch stands beside a row, since no route serves one", () => {
    expect(memories.every((one) => one.watch === null)).toBe(true);
  });
});

describe("a row taken down or put back", () => {
  test("goes to the brain with its reason in its labels, and the row comes back as the screen reads it", async () => {
    const changed = await change({ body: { slug: "m1", active: false, why: "no longer needed" } });

    expect(brain.asked.at(-1)).toMatchObject({ method: "PATCH", path: "/memories/1", body: { state: "retired" } });
    expect((brain.asked.at(-1)?.body?.labels as Record<string, string>).downReason).toBe("no longer needed");
    expect(changed.memory).toMatchObject({ id: 1, active: false, downReason: "no longer needed", room: "Agent A" });
  });

  test("put back goes without a reason", async () => {
    await change({ body: { slug: "m1", active: true } });

    expect(brain.asked.at(-1)?.body).toMatchObject({ state: "standing" });
    expect((brain.asked.at(-1)?.body?.labels as Record<string, string>).downReason).toBeUndefined();
  });

  test("is refused here for a missing slug, direction or reason, and by the brain's code where the row's state refuses it", async () => {
    const { wording } = await import("../../../apps/web/shared/wording");

    expect(await asked(change, { body: { active: false, why: "x" } })).toMatchObject({ status: 400, message: wording("memories.error.pick_memory") });
    expect(await asked(change, { body: { slug: "m1" } })).toMatchObject({ status: 400, message: wording("memories.error.direction") });
    expect(await asked(change, { body: { slug: "m1", active: false, why: " " } })).toMatchObject({ status: 400, message: wording("memories.error.reason_empty") });
    expect(await asked(change, { body: { slug: "m2", active: false, why: "x" } })).toMatchObject({ status: 409, message: wording("memories.error.row_already_down"), data: { code: "already-down" } });
  });
});
