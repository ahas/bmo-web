import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// A room added from a chat service (the receiver's docs/api.md, 「Rooms」): the services that take a mode with what
// each lists and starts, a page of one service's rooms with the ones the receiver holds, a page of its contacts,
// and the add itself, from a room or from a conversation started, each refusal said in the pack's sentence for
// its code.

const receiver = standIn("RECEIVER", (call) => {
  if (call.path === "/providers") {
    return answer({
      items: [
        { key: "service-a", label: "Service A", listsRooms: true, listsContacts: true, startsChats: true, startsGroups: false, roomModes: ["record-only", "avatar"] },
        { key: "service-b", label: "Service B", listsRooms: false, listsContacts: false, startsChats: false, startsGroups: false, roomModes: ["avatar", "record-only"] },
        { key: "record", label: "Record", listsRooms: false, listsContacts: false, startsChats: false, startsGroups: false, roomModes: [] }
      ],
      more: false
    });
  }

  if (call.path.startsWith("/providers/service-a/rooms")) {
    return answer({
      items: [
        { id: 7, title: "room-a", kind: "group", privateTo: null, held: false, mode: null },
        { id: 8, title: null, kind: "owner", privateTo: 3, held: true, mode: "avatar", modes: ["human-reader"] },
        { id: 9, title: "room-c", kind: "group", privateTo: null, held: true, mode: null }
      ],
      more: true
    });
  }

  if (call.path.startsWith("/providers/service-a/contacts")) {
    return answer({
      items: [
        { id: 51, name: "Contact One", kind: "person", roomId: 9, held: true, mode: null },
        { id: 52, name: "Helper", kind: "bot", roomId: null, held: false, mode: null }
      ],
      more: false
    });
  }

  if (call.path.startsWith("/providers/service-b/contacts")) {
    return answer({ code: "contacts-unlisted", error: "Service B does not list the contacts of its account" }, 409);
  }

  if (call.method === "POST" && call.path === "/rooms") {
    if (call.body?.roomId === 8) return answer({ code: "room-added", error: "the room is already added" }, 409);
    if (call.body?.contactId === 99) return answer({ code: "contact-unknown", error: "Service A does not know a contact the start names" }, 409);
    if (call.body?.contactIds !== undefined) return answer({ code: "chats-unstarted", error: "Service A does not start a conversation of that kind" }, 409);

    const id = typeof call.body?.contactId === "number" ? call.body.contactId : 7;

    return answer({ id, title: id === 7 ? "room-a" : "Contact", messageCount: 0, lastMessageAt: null, pinned: false, senders: [], supervisors: [], ownerRoom: false, registered: true, workRoom: null, mode: "record-only" }, 201);
  }

  return answer({ code: "not-found", error: "no route" }, 404);
});

const services = await routeOf<unknown>("../../apps/web/server/api/room-add/index.get");
const page = await routeOf<unknown>("../../apps/web/server/api/room-add/[key]/index.get");
const contacts = await routeOf<unknown>("../../apps/web/server/api/room-add/[key]/contacts.get");
const add = await routeOf<unknown>("../../apps/web/server/api/rooms.post");

describe("adding a room", () => {
  test("offers every service that takes a mode, with what it lists and starts, the record left out", async () => {
    expect((await asked(services, {})).answer).toEqual([
      { key: "service-a", label: "Service A", modes: ["record-only", "avatar"], listsRooms: true, listsContacts: true, startsChats: true, startsGroups: false },
      { key: "service-b", label: "Service B", modes: ["avatar", "record-only"], listsRooms: false, listsContacts: false, startsChats: false, startsGroups: false }
    ]);
  });

  test("reads a page of a service's rooms past the one given, each marked held or not", async () => {
    const read = await asked(page, { params: { key: "service-a" }, query: { after: "5", limit: "50" } });

    expect(read.answer).toEqual({
      items: [
        { id: 7, title: "room-a", kind: "group", held: false, mode: null, modes: null },
        { id: 8, title: null, kind: "owner", held: true, mode: "avatar", modes: ["human-reader"] },
        { id: 9, title: "room-c", kind: "group", held: true, mode: null, modes: null }
      ],
      more: true
    });
    expect(receiver.asked.at(-1)?.path).toBe("/providers/service-a/rooms?after=5&limit=50");
  });

  test("reads a page of the deployment's own account's contacts for the administrator, each with its one-to-one held or not", async () => {
    const read = await asked(contacts, { params: { key: "service-a" }, query: { limit: "200", accountId: "5" } });

    expect(read.answer).toEqual({
      items: [
        { id: 51, name: "Contact One", kind: "person", roomId: 9, held: true, mode: null },
        { id: 52, name: "Helper", kind: "bot", roomId: null, held: false, mode: null }
      ],
      more: false
    });
    // The administrator's account is the deployment's own, so the listing names none, whatever the query says.
    expect(receiver.asked.at(-1)?.path).toBe("/providers/service-a/contacts?limit=200");
  });

  test("says a service that lists no contacts in the pack's sentence", async () => {
    const read = await asked(contacts, { params: { key: "service-b" }, query: {} });

    expect(read.status).toBe(409);
    expect(read.message).toBe(wording("room.error.room_add_contacts_unlisted"));
  });

  test("adds a room with its mode and an empty title left out, and answers the room's number", async () => {
    const read = await asked(add, { body: { provider: "service-a", roomId: 7, mode: "record-only", title: "  " } });

    expect(read.answer).toEqual({ chatId: 7, title: "room-a" });
    expect(receiver.asked.at(-1)?.body).toEqual({ provider: "service-a", roomId: 7, mode: "record-only", title: null });
  });

  test("starts a one-to-one with a contact in the deployment's own account for the administrator and answers the room it came to", async () => {
    const read = await asked(add, { body: { provider: "service-a", contactId: 52, mode: "record-only", title: "" } });

    expect(read.answer).toEqual({ chatId: 52, title: "Contact" });
    expect(receiver.asked.at(-1)?.body).toEqual({ provider: "service-a", contactId: 52, mode: "record-only" });
  });

  test("hands a group's contacts and name on, and says a kind of start the service does not make", async () => {
    const read = await asked(add, { body: { provider: "service-a", contactIds: [51, 52], mode: "record-only", title: " Plans " } });

    expect(read.status).toBe(409);
    expect(read.message).toBe(wording("room.error.room_add_unstarted"));
    expect(receiver.asked.at(-1)?.body).toEqual({ provider: "service-a", contactIds: [51, 52], mode: "record-only", title: "Plans" });
  });

  test("names no account for a person the model gives no user, so the service answers its own", async () => {
    const globals: Record<string, unknown> = globalThis;
    const administrator = globals.requireAdministrator;

    globals.requireAdministrator = async () => ({ id: null, name: "tester", administrator: true });

    try {
      await asked(contacts, { params: { key: "service-a" }, query: { limit: "200" } });
      expect(receiver.asked.at(-1)?.path).toBe("/providers/service-a/contacts?limit=200");

      await asked(add, { body: { provider: "service-a", contactId: 52, mode: "record-only" } });
      expect(receiver.asked.at(-1)?.body).toEqual({ provider: "service-a", contactId: 52, mode: "record-only" });
    } finally {
      globals.requireAdministrator = administrator;
    }
  });

  test("says a room already added and a contact the service does not know in the pack's sentences", async () => {
    const added = await asked(add, { body: { provider: "service-a", roomId: 8, mode: "avatar" } });
    const unknown = await asked(add, { body: { provider: "service-a", contactId: 99, mode: "record-only" } });

    expect([added.status, added.message]).toEqual([409, wording("room.error.room_add_added")]);
    expect([unknown.status, unknown.message]).toEqual([409, wording("room.error.room_add_contact_unknown")]);
  });

  test("refuses a body of no shape it knows, asking the receiver nothing", async () => {
    const before = receiver.asked.length;

    for (const body of [
      { provider: "service-a", roomId: 7, mode: "loud" },
      { provider: "service-a", mode: "record-only" },
      { provider: "service-a", roomId: 7, contactId: 52, mode: "record-only" },
      { provider: "service-a", contactIds: [51], mode: "record-only", title: "  " },
      { provider: "service-a", contactIds: [], mode: "record-only", title: "Plans" },
      { provider: "service-a", contactIds: ["51"], mode: "record-only", title: "Plans" }
    ]) {
      expect((await asked(add, { body })).status).toBe(400);
    }

    expect(receiver.asked.length).toBe(before);
  });
});
