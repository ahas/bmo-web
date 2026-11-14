import createClient, { type Client } from "openapi-fetch";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import { unitAt } from "./units";
import { answered } from "./unit-answer";

import type { ExactMessageId, RoomProvidersView } from "#shared/types";
import type { components, paths } from "@bmo/receiver-client/schema";
import type { UnitAnswerCall } from "./unit-answer";

// The receiver's fixed API as its published package states it (the receiver's `docs/api.md`, 「The wire」): one
// document, its types in `@bmo/receiver-client/schema` and one route for each thing it keeps. The package's own
// `receiverClient` hands back a call for some of those routes; every route this console reads is made through
// the same generated schema, so the ones its wrapper leaves out are made here from that schema alone. Its
// refusals are the console's to say, by the pack's sentence for each code.

type Schemas = components["schemas"];

/** What the receiver answers: its health, and every row it keeps. */
export type ReceiverHealth = Schemas["Health"];
export type ReceiverOwner = Schemas["Owner"];
export type ReceiverRoom = Schemas["Room"];
export type ReceiverPage<T> = { items: T[]; more: boolean };
export type ReceiverMessage = Schemas["Message"];
export type ReceiverKeptFile = Schemas["KeptFile"];
export type ReceiverFileEntry = Schemas["FileEntry"];
export type ReceiverPicture = Schemas["Picture"];
export type ReceiverPictures = Schemas["Pictures"];
export type ReceiverFigures = Schemas["Figures"];
export type ReceiverWindow = Schemas["Window"];
export type ReceiverInstruction = Schemas["Instruction"];
export type ReceiverOpening = Schemas["Opening"];
export type ReceiverOpeningText = Schemas["OpeningText"];
export type ReceiverPerson = Schemas["Person"];
export type ReceiverTalkAnswer = Schemas["TalkAnswer"];

/** A message as the receiver answers it, its own id kept as the digits the receiver wrote. */
export type ExactMessage = Omit<ReceiverMessage, "id"> & { id: ExactMessageId };

/** What a room's message list is asked with, its cursors either a message's exact id or the screen's number for one. */
export type ExactMessagesQuery = Omit<NonNullable<paths["/rooms/{roomId}/messages"]["get"]["parameters"]["query"]>, "after" | "before"> & {
  after?: ExactMessageId | number;
  before?: ExactMessageId | number;
};

/** The receiver's client, over the document its package publishes. */
export type ReceiverClient = Client<paths>;

export const RECEIVER_CODES: Readonly<Record<string, string>> = {
  // Every route's.
  "bad-request": "room.error.receiver_bad_request",
  unauthorized: "room.error.receiver_unauthorized",
  forbidden: "room.error.receiver_forbidden",
  "not-found": "room.error.receiver_not_found",
  "no-route": "room.error.receiver_not_found",
  "not-ready": "room.error.receiver_not_ready",
  "outage": "room.error.receiver_unreachable",
  "too-large": "room.error.file_too_large_named",
  conflict: "room.error.receiver_conflict",
  "upstream-failed": "room.error.receiver_unit_failed",
  unreachable: "room.error.receiver_unreachable",
  failed: "room.error.receiver_failed",
  // The owner's words from the console.
  "reply-missing": "room.error.reply_missing",
  "words-only": "room.error.words_only",
  "none-sent": "room.error.none_sent",
  // Adding a room from a chat service's account.
  "rooms-unlisted": "room.error.room_add_unlisted",
  "room-unknown": "room.error.room_add_unknown",
  "avatar-unsupported": "room.error.room_add_avatar",
  "room-added": "room.error.room_add_added",
  "contacts-unlisted": "room.error.room_add_contacts_unlisted",
  "chats-unstarted": "room.error.room_add_unstarted",
  "contact-unknown": "room.error.room_add_contact_unknown",
  "start-refused": "room.error.room_add_start_refused",
  // A signed-in person's act on a message.
  "no-caller": "room.error.no_caller",
  "message-unknown": "room.error.message_unknown",
  "message-deleted": "room.error.message_deleted",
  "message-forbidden": "room.error.message_forbidden",
  "unknown-sticker": "room.error.unknown_sticker",
  // Removing a room.
  "seeded-room": "room.error.removal_seeded_room",
  infrastructure: "room.error.removal_infrastructure",
  "owners-chat": "room.error.removal_owners_chat",
  "not-administrator": "room.error.removal_not_administrator",
  chat: "room.error.removal_chat"
};

// The receiver's refusals of a supervisor's add, its removal and the default answerer setting (its `docs/codes.md`,
// 「SupervisorRefusal」), each with the pack's key for its sentence, and the field of the add's form each stands under.
export const SUPERVISOR_CODES: Readonly<Record<string, string>> = {
  "unknown-supervisor": "agents.error.supervisor_unknown",
  name: "agents.error.supervisor_name",
  "name-taken": "agents.error.supervisor_name_taken",
  label: "agents.error.supervisor_label",
  provider: "agents.error.supervisor_provider",
  model: "agents.error.supervisor_model",
  repository: "agents.error.supervisor_repository",
  room: "agents.error.supervisor_room",
  seeded: "agents.error.supervisor_seeded_refused",
  "default-answerer": "agents.error.supervisor_default_answerer",
  running: "agents.error.supervisor_running",
  action: "common.error.bad_action"
};

/**
 * The receiver at the address its setting names, asked with its token: a call that only reads answers at once,
 * and one that runs a model waits as long as the model takes.
 */
export function receiver(): ReceiverClient {
  const unit = unitAt("RECEIVER");

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  return createClient<paths>({
    baseUrl: unit.address,
    ...(unit.token === null ? {} : { headers: { Authorization: `Bearer ${unit.token}` } })
  });
}

/** One call on the receiver, its refusals said in the pack's words: the route's own sentences where the call names
 * them, and every route's otherwise. */
export async function receiverCall<T, E extends { code?: string; error?: string; field?: string } = { code?: string; error?: string; field?: string }>(
  asked: Promise<{ data?: T; error?: E; response: Response }>,
  call: UnitAnswerCall = {}
): Promise<T> {
  return await answered(asked, { ...call, codes: { ...RECEIVER_CODES, ...call.codes } });
}

// The receiver numbers a message with a signed 64-bit integer, which a JavaScript number holds without rounding only
// up to 2^53, and a chat service may number its messages past that (docs/web.md, 「Unread messages」). JSON.parse
// hands a reviver each value's own source text, so a message's id is read from the digits the receiver wrote, kept by
// the object it stands in, and handed back in its place.
function withExactIds(text: string): { parsed: unknown; idOf: (message: ReceiverMessage) => ExactMessageId } {
  const ids = new WeakMap<object, ExactMessageId>();
  const parsed: unknown = JSON.parse(text, function (this: object, key: string, value: unknown, context?: { source?: string }) {
    if (key === "id" && typeof value === "number" && context?.source !== undefined) ids.set(this, context.source);

    return value;
  });

  return { parsed, idOf: (message) => ids.get(message) ?? String(message.id) };
}

// A message's exact id as the receiver's client takes it in a path or a query: the client types a 64-bit id as a
// number, and writes whatever it is given as text, which the exact id already is.
export function onTheWire(id: ExactMessageId | number): number {
  return id as number;
}

/** A page of a room's messages, each with its exact id (ExactMessage). */
export async function exactMessages(roomId: number, query: ExactMessagesQuery): Promise<ReceiverPage<ExactMessage>> {
  const { after, before, ...rest } = query;
  const cursors = { ...(after === undefined ? {} : { after: onTheWire(after) }), ...(before === undefined ? {} : { before: onTheWire(before) }) };
  const text = await receiverCall(
    receiver().GET("/rooms/{roomId}/messages", { params: { path: { roomId }, query: { ...rest, ...cursors } }, parseAs: "text" })
  );
  const { parsed, idOf } = withExactIds(text);
  const page = parsed as ReceiverPage<ReceiverMessage>;

  return { items: page.items.map((message) => ({ ...message, id: idOf(message) })), more: page.more };
}

/** One message of a room, with its exact id (ExactMessage). */
export async function exactMessage(roomId: number, messageId: ExactMessageId | number): Promise<ExactMessage> {
  const text = await receiverCall(
    receiver().GET("/rooms/{roomId}/messages/{messageId}", { params: { path: { roomId, messageId: onTheWire(messageId) } }, parseAs: "text" })
  );
  const { parsed, idOf } = withExactIds(text);
  const message = parsed as ReceiverMessage;

  return { ...message, id: idOf(message) };
}

/**
 * The names of a room's chat services that read a room's past back: those whose road in the room performs
 * `history` (bmo-chat's `docs/contract.md`, 「Capabilities」), each by the label the receiver gives it, in the room's
 * order. The room's line reaches only as far back as what such a service has handed over so far.
 */
export async function roomPastReaders(roomId: number): Promise<string[]> {
  const asking = receiver();
  const [listed, room] = await Promise.all([
    receiverCall(asking.GET("/providers")),
    receiverCall(asking.GET("/rooms/{roomId}/providers", { params: { path: { roomId } } }))
  ]);
  const verbs = await Promise.all(
    room.providers.map((via) => receiverCall(asking.GET("/rooms/{roomId}/send-verbs", { params: { path: { roomId }, query: { via } } })))
  );

  return room.providers
    .filter((_, at) => verbs[at]!.items.includes("history"))
    .map((key) => listed.items.find((provider) => provider.key === key)?.label ?? key);
}

/** A room's chat providers as its dialog reads them: every provider the receiver names, and the ones the room is on. */
export async function roomProviders(roomId: number): Promise<RoomProvidersView> {
  const asking = receiver();
  const [listed, room] = await Promise.all([
    receiverCall(asking.GET("/providers")),
    receiverCall(asking.GET("/rooms/{roomId}/providers", { params: { path: { roomId } } }))
  ]);

  return {
    providers: listed.items.map((provider) => ({ key: provider.key, label: provider.label })),
    on: room.providers,
    chosen: room.chosen
  };
}
