import createClient, { type Client } from "openapi-fetch";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { roadName } from "#shared/roads";
import { wording } from "#shared/wording";

import { exactJson, exactJsonText } from "./exact-json";
import { unitAt, unitFetch } from "./units";
import { answered } from "./unit-answer";

import type { ExactMessageId, FileLimit, RoomHolding, RoomMode, RoomProvidersView } from "#shared/types";
import type { components, paths } from "@bmo/receiver-client/schema";
import type { WithExactIds } from "./exact-json";
import type { UnitAnswerCall } from "./unit-answer";
import type { StreamedForm } from "./streamed-forms";
import type { UnitCall } from "./units";

// The receiver's fixed API as its published package states it (the receiver's `docs/api.md`, 「The wire」): one
// document, its types in `@bmo/receiver-client/schema` and one route for each thing it keeps. The package's own
// `receiverClient` hands back a call for some of those routes; every route this console reads is made through
// the same generated schema, so the ones its wrapper leaves out are made here from that schema alone. Its
// refusals are the console's to say, by the pack's sentence for each code.

type Schemas = components["schemas"];

// The chat verb a provider declares where it reads a room's past back (bmo-chat's `docs/contract.md`, 「Capabilities」).
const HISTORY = "history";

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

// The keys whose integers name a message wherever they stand in the receiver's answers (its `docs/api.md`): a
// message's own `id`, the message it replies to, the message a forward copies, a picture or a turn stands for, and the
// album a picture went out in, named by its first picture. An event and the live board number other things `id`
// (the event, a speaker), so they are read with `EVENT_IDS` alone.
type MessageIdKey = "id" | "replyToMessageId" | "messageId" | "album";
export const MESSAGE_IDS: ReadonlySet<MessageIdKey> = new Set(["id", "replyToMessageId", "messageId", "album"]);
export const EVENT_IDS: ReadonlySet<string> = new Set(["messageId"]);

/** One of the receiver's answers with every message id in it exact (ExactMessageId). */
export type Exact<T> = WithExactIds<T, MessageIdKey>;

/** A message as the receiver answers it, every message id in it exact. */
export type ExactMessage = Exact<ReceiverMessage>;

// The receiver's routes as the console asks them. Its published client types every message id a request carries as a
// number, which rounds past 2^53, so the console reads the same routes with each such id typed as its digits
// (ExactMessageId): a message named in a path, the message a body's line replies to, and the cursors of the two routes
// that page by a message. The client writes a path's and a query's values as the text they hold, and a body through
// `exactJsonText`, so each id reaches the wire as the digits it is.
type PathIdKey = "messageId";
type BodyIdKey = "replyTo";
const BODY_IDS: ReadonlySet<BodyIdKey> = new Set(["replyTo"]);
type CursorsOf<Route> = Route extends "/rooms/{roomId}/messages"
  ? "after" | "before"
  : Route extends "/rooms/{roomId}/pictures"
    ? "at" | "before" | "after"
    : never;

type ExactParameters<Parameters, Cursors extends PropertyKey> = {
  [Place in keyof Parameters]: Place extends "path"
    ? WithExactIds<Parameters[Place], PathIdKey>
    : Place extends "query"
      ? WithExactIds<Parameters[Place], Cursors>
      : Parameters[Place];
};

type ExactRequest<Operation, Cursors extends PropertyKey> = {
  [Part in keyof Operation]: Part extends "parameters"
    ? ExactParameters<Operation[Part], Cursors>
    : Part extends "requestBody"
      ? WithExactIds<Operation[Part], BodyIdKey>
      : Operation[Part];
};

/** The receiver's routes with every message id a request carries typed as its digits. */
export type ExactPaths = {
  [Route in keyof paths]: {
    [Method in keyof paths[Route]]: Method extends "parameters" ? paths[Route][Method] : ExactRequest<paths[Route][Method], CursorsOf<Route>>;
  };
};

/** What a room's message list is asked with, its cursors a message's exact id. */
export type ExactMessagesQuery = NonNullable<ExactPaths["/rooms/{roomId}/messages"]["get"]["parameters"]["query"]>;

/** The receiver's client, over the document its package publishes, each message id it is asked with exact. */
export type ReceiverClient = Client<ExactPaths>;

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
  // The owner's words from the console, and any account's.
  "reply-missing": "room.error.reply_missing",
  "private-room": "room.error.private_room",
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
  // A room's mode, set by the administrator.
  "no-chat-service": "room.error.mode_no_chat_service",
  "avatar-unoffered": "room.error.room_add_avatar",
  "room-takes-no-avatar": "room.error.mode_takes_no_avatar",
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

/** The receiver's refusal of a room setting asked by anyone but the administrator, in the sentence every
 * administrator's route says it in rather than the room removal's. */
export const ADMINISTRATOR_ONLY: Readonly<Record<string, string>> = { "not-administrator": "common.error.administrator_only" };

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

  return createClient<ExactPaths>({
    baseUrl: unit.address,
    bodySerializer: (body: unknown) => (body instanceof FormData ? body : exactJsonText(body, BODY_IDS)),
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

/**
 * One call on a receiver route its published client does not carry (docs/boundary.md, 「Gaps the console meets」),
 * asked on its address as every unit call is made: a body handed as a value goes as JSON with every message id in it
 * as its digits, and a refusal is said as `receiverCall` says it. An answer naming messages is read exact where the
 * call names `MESSAGE_IDS` as its `exactIds`.
 */
export async function receiverRoute<T>(path: string, init: Omit<RequestInit, "body"> & { body?: unknown } = {}, call: UnitCall = {}): Promise<T> {
  const { body, ...rest } = init;
  const headers = (rest.headers as Record<string, string> | undefined) ?? {};
  const sending: RequestInit =
    body === undefined
      ? rest
      : body instanceof FormData
        ? { ...rest, body }
        : isStreamedForm(body)
          ? ({ ...rest, body: body.body, headers: { ...body.headers, ...headers }, duplex: "half" } as RequestInit)
          : { ...rest, body: exactJsonText(body, BODY_IDS), headers: { "content-type": "application/json", ...headers } };

  return await unitFetch<T>("RECEIVER", path, sending, { ...call, codes: { ...RECEIVER_CODES, ...call.codes } });
}

// A form handed as the stream it is sent as, which goes with its own frame's headers.
function isStreamedForm(value: unknown): value is StreamedForm {
  return typeof value === "object" && value !== null && Reflect.get(value, "body") instanceof ReadableStream;
}

/** One call on the receiver asked for its answer as text, read with every message id in it exact (`exactJson`), its
 * refusals said as `receiverCall` says them. `T` is the answer as the receiver's schema types it. */
export async function exactAnswer<T>(asked: Promise<{ data?: string; error?: { code?: string; error?: string; field?: string }; response: Response }>, call: UnitAnswerCall = {}): Promise<Exact<T>> {
  return exactJson(await receiverCall(asked, call), MESSAGE_IDS) as Exact<T>;
}

/** A page of a room's messages, each with its message ids exact. */
export async function exactMessages(roomId: number, query: ExactMessagesQuery): Promise<ReceiverPage<ExactMessage>> {
  // The cursors stand last in the address the receiver is asked at.
  const { after, before, ...rest } = query;
  const cursors = { ...(after === undefined ? {} : { after }), ...(before === undefined ? {} : { before }) };

  return await exactAnswer<ReceiverPage<ReceiverMessage>>(
    receiver().GET("/rooms/{roomId}/messages", { params: { path: { roomId }, query: { ...rest, ...cursors } }, parseAs: "text" })
  );
}

/** A page of a room's messages holding one kind, each with its message ids exact (the receiver's `docs/api.md`,
 * 「Messages」). The published client names no `holding`, so it is asked beside the query the client names
 * (docs/boundary.md, 「Gaps the console meets」). */
export async function exactHoldingMessages(roomId: number, holding: RoomHolding, before: ExactMessageId | null, limit: number): Promise<ReceiverPage<ExactMessage>> {
  const asked = { limit, holding, ...(before === null ? {} : { before }) };

  return await exactAnswer<ReceiverPage<ReceiverMessage>>(
    receiver().GET("/rooms/{roomId}/messages", { params: { path: { roomId }, query: asked }, parseAs: "text" })
  );
}

/** One message of a room, with its message ids exact. */
export async function exactMessage(roomId: number, messageId: ExactMessageId): Promise<ExactMessage> {
  return await exactAnswer<ReceiverMessage>(
    receiver().GET("/rooms/{roomId}/messages/{messageId}", { params: { path: { roomId, messageId } }, parseAs: "text" })
  );
}

/** A chat road's name in the reader's language, by its key from the pack (docs/web.md, 「A chat road's name」); the label the
 * receiver gives a road is its own English and is never shown. */
export function chatRoadName(key: string): string {
  return roadName(wording, key);
}

/**
 * The names of the chat services a room's past comes over from: the room's providers whose own verbs, their `can` on
 * the receiver's provider list, hold `history` (bmo-chat's `docs/contract.md`, 「Capabilities」), each by its name
 * in the pack, in the room's order. None where no provider of the room reads its past back.
 */
export async function roomPastReaders(roomId: number): Promise<string[]> {
  const asking = receiver();
  const [listed, room] = await Promise.all([
    receiverCall(asking.GET("/providers")),
    receiverCall(asking.GET("/rooms/{roomId}/providers", { params: { path: { roomId } } }))
  ]);

  return room.providers.flatMap((key) => {
    const provider = listed.items.find((one) => one.key === key);

    return provider?.can.includes(HISTORY) === true ? [chatRoadName(provider.key)] : [];
  });
}

/** The keys of the chat roads a room stands on, in the receiver's order (its `docs/api.md`, 「Rooms」): the record the
 * console reads the room off stands among them, and every chat service that carries the room besides it. */
export async function roomRoads(roomId: number): Promise<string[]> {
  return (await receiverCall(receiver().GET("/rooms/{roomId}/providers", { params: { path: { roomId } } }))).providers;
}

/** The largest file a room takes and the chat service declaring it, by its name in the pack: the smallest
 * limit any chat service on the room's list declares, or none where none declares one (the receiver's `docs/api.md`,
 * 「Sends」). */
export async function roomFileLimit(roomId: number): Promise<FileLimit | null> {
  const asking = receiver();
  const [listed, room] = await Promise.all([
    receiverCall(asking.GET("/providers")),
    receiverCall(asking.GET("/rooms/{roomId}/providers", { params: { path: { roomId } } }))
  ]);
  const limit = room.fileLimit ?? null;

  if (limit === null) return null;

  return { bytes: limit.bytes, by: chatRoadName(limit.provider) };
}

/** The mode a registration answer names, null where it names none the console knows. */
export function modeOf(registration: unknown): RoomMode | null {
  const mode: unknown = typeof registration === "object" && registration !== null ? Reflect.get(registration, "mode") : null;

  return mode === "avatar" || mode === "record-only" ? mode : null;
}

/** A room's chat providers as its dialog reads them: the ones the room is on, each by its name in the pack, and
 * whether one of them offers the avatar mode. */
export async function roomProviders(roomId: number): Promise<RoomProvidersView> {
  const asking = receiver();
  const [listed, room] = await Promise.all([
    receiverCall(asking.GET("/providers")),
    receiverCall(asking.GET("/rooms/{roomId}/providers", { params: { path: { roomId } } }))
  ]);
  const roads = room.providers;

  const offersAvatar = new Set(listed.items.filter((provider) => provider.roomModes.includes("avatar")).map((provider) => provider.key));

  return {
    on: roads.map((key) => ({ key, label: chatRoadName(key) })),
    avatarOffered: roads.some((key) => offersAvatar.has(key))
  };
}
