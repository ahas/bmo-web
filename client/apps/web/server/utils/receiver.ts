import createClient, { type Client } from "openapi-fetch";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import { exactJson, exactJsonText } from "./exact-json";
import { unitAt } from "./units";
import { answered } from "./unit-answer";

import type { ExactMessageId, RoomProvidersView } from "#shared/types";
import type { components, paths } from "@bmo/receiver-client/schema";
import type { WithExactIds } from "./exact-json";
import type { UnitAnswerCall } from "./unit-answer";

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
const MESSAGE_IDS: ReadonlySet<MessageIdKey> = new Set(["id", "replyToMessageId", "messageId", "album"]);
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

/** One message of a room, with its message ids exact. */
export async function exactMessage(roomId: number, messageId: ExactMessageId): Promise<ExactMessage> {
  return await exactAnswer<ReceiverMessage>(
    receiver().GET("/rooms/{roomId}/messages/{messageId}", { params: { path: { roomId, messageId } }, parseAs: "text" })
  );
}

/**
 * The names of the chat services a room's past comes over from: the room's providers whose own verbs, their `can` on
 * the receiver's provider list, hold `history` (bmo-chat's `docs/contract.md`, 「Capabilities」), each by the label the
 * receiver gives it, in the room's order. None where no provider of the room reads its past back.
 */
export async function roomPastReaders(roomId: number): Promise<string[]> {
  const asking = receiver();
  const [listed, room] = await Promise.all([
    receiverCall(asking.GET("/providers")),
    receiverCall(asking.GET("/rooms/{roomId}/providers", { params: { path: { roomId } } }))
  ]);

  return room.providers.flatMap((key) => {
    const provider = listed.items.find((one) => one.key === key);

    return provider?.can.includes(HISTORY) === true ? [provider.label] : [];
  });
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
