import { PAGING, roomLabel } from "#shared/config";
import { isSystemNotice } from "#shared/text-marks";
import { wording } from "#shared/wording";

import { draftSummaries } from "./drafting";
import { figuresOf } from "./runfigures";
import { judgementsOf, judgementsWithin } from "./gate";
import { ownerChat } from "./owner";
import { carriesFiles, messageMedia } from "./message-media";
import { receiver, receiverCall } from "./receiver";
import { within } from "./unit-answer";

import type { ArchivedMessage, Judgement, JudgementPage, MessageAttachment, MessagePage, ReplyQuote, RoomSummary, TelegramExpression } from "#shared/types";
import type { ReceiverMessage, ReceiverRoom } from "./receiver";

// A room as the receiver keeps it (the receiver's `docs/boundary-api.md`, 「For the web unit's console: reading a
// room」): the rooms, a room's name, and its line walked by a cursor the reader holds, read into the shapes the room
// screen draws. A page holds only what a person said themselves, as the receiver hands it. What the receiver's
// pages do not carry stands empty (docs/boundary.md, 「Gaps the console meets」): the judgements beside a page, which
// are the gate's; what a round cost and what its turn did; and a line's voice briefing. A message that carries files
// is read again for them and for the metadata it arrived with (`server/utils/message-media.ts`).

// A file a message carried, as the receiver's store keeps it.
interface KeptFile {
  kind: string;
  source: string;
  storedPath: string | null;
  summary: string | null;
  collectedAt: number;
}

interface ReceivedMessage {
  chatId: number;
  messageId: number;
  senderId: number | null;
  senderName: string;
  sentAt: number;
  text: string;
  imagePath: string | null;
  replyToMessageId: number | null;
  answerSeconds: number | null;
  round: string | null;
  album: number | null;
  via: string | null;
  files: KeptFile[];
}

// A message as the receiver's own document answers it, read into the names the room screen stands on: its
// number is the message's, and the room it stands in is its own.
function receivedOf(message: ReceiverMessage): ReceivedMessage {
  return {
    chatId: message.room,
    messageId: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    sentAt: seconds(message.sentAt),
    text: message.text,
    imagePath: message.imagePath,
    replyToMessageId: message.replyToMessageId,
    answerSeconds: message.answerSeconds,
    round: message.round,
    album: message.album,
    via: message.via,
    files: message.files
  };
}

const ATTACHED: readonly MessageAttachment["kind"][] = ["audio", "video", "document", "sticker"];

// The receiver states its times in epoch milliseconds; a shape the screen draws states them in the unix
// seconds `bmo-ui` reads, as every other unit adapter here does.
const seconds = (ms: number): number => Math.floor(ms / 1000);

// Every room the receiver shows, the pinned ones first in the owner's order: one page, as its route answers.
async function everyRoom(): Promise<ReceiverRoom[]> {
  return (await receiverCall(receiver().GET("/rooms", { signal: within(5_000) }))).items;
}

/** Every room, the pinned ones first in the owner's order, each under the name it is called by. */
export async function listRooms(): Promise<RoomSummary[]> {
  const [rooms, owner] = await Promise.all([everyRoom(), ownerChat()]);

  return rooms.map((room) => ({
    chatId: room.id,
    title: roomLabel(room.id, room.title, owner),
    messageCount: room.messageCount,
    lastMessageAt: room.lastMessageAt === null ? null : seconds(room.lastMessageAt),
    pinned: room.pinned,
    ...(room.companions.length > 0 ? { madeForCompanions: true as const, companions: room.companions } : {})
  }));
}

/** One room by the name it is called by, the same name the room list gives it. */
export async function roomTitleOf(chatId: number): Promise<string> {
  const [{ title }, owner] = await Promise.all([
    receiverCall(receiver().GET("/rooms/{roomId}/title", { params: { path: { roomId: chatId } }, signal: within(5_000) })),
    ownerChat()
  ]);

  return roomLabel(chatId, title, owner);
}

// The files a message carried as its page names them, each by its place among them and standing unavailable: what
// the line stands where the receiver's list of them could not be read.
function attachmentsOf(message: ReceivedMessage): MessageAttachment[] {
  return message.files.flatMap((file, at) => {
    const kind = file.kind as MessageAttachment["kind"];

    return ATTACHED.includes(kind)
      ? [{ id: at, kind, name: file.source.startsWith("bmo:") ? wording("room.label.voice_message") : file.source, bytes: null, type: null, available: false }]
      : [];
  });
}

// What a message carried and the expressions its words drew. Only a message whose page names a file is asked
// about, since every expression stands on one of its files; a list that cannot be read is no reason to fail the
// page, and the line names its files as unavailable instead.
async function mediaOf(chatId: number, message: ReceivedMessage): Promise<{ attachments: MessageAttachment[]; expressions: TelegramExpression[] }> {
  if (!carriesFiles(message.files)) return { attachments: [], expressions: [] };

  try {
    return await messageMedia(chatId, message.messageId, message.text);
  } catch {
    return { attachments: attachmentsOf(message), expressions: [] };
  }
}

// The numbers an agent's own words stand under in a room, as the receiver gives each of the room's answerers
// its own number: a message whose sender is one of them is an agent's.
export async function agentNumbers(chatId: number): Promise<Set<number>> {
  return new Set((await answererNumbers(chatId)).keys());
}

// Each of a room's answerers' own numbers with the agent whose words stand under it. Where two agents stand under one
// number, it is the room's voice's: the one the receiver speaks for the room as.
async function answererNumbers(chatId: number): Promise<Map<number, string>> {
  const answerers = await receiverCall(
    receiver().GET("/rooms/{roomId}/answerers", { params: { path: { roomId: chatId } }, signal: within(5_000) })
  );
  const names = [...new Set([answerers.default, ...answerers.items.map((answerer) => answerer.agentName), answerers.voice])].filter((name) => name !== "");
  const numbers = await Promise.all(
    names.map(async (agentName) => {
      try {
        const answer = await receiverCall(
          receiver().GET("/rooms/{roomId}/own-number", {
            params: { path: { roomId: chatId }, query: { agentName } },
            signal: within(5_000)
          })
        );

        return answer.number;
      } catch {
        return null;
      }
    })
  );
  const owned = new Map<number, string>();

  // The voice is named last, so a number it shares is its own.
  names.forEach((name, at) => {
    const number = numbers[at];

    if (number !== null && number !== undefined) owned.set(number, name);
  });

  return owned;
}

// How long the receiver's word that a number is the owner's account stands before it is asked again.
const OWNER_NUMBER_TTL_MS = 10 * 60_000;
const ownerNumbers = new Map<string, { owner: boolean; until: number }>();

// The agents whose answers a page holds sent in the owner's own account, by the number they went out under: an agent's
// number the receiver says is the owner's, asked once for each such number on the page through one message of it that
// went out in a round (docs/web.md, 「An answer sent in the owner's own account wears the agent's face」).
async function ownerVoices(chatId: number, messages: readonly ReceivedMessage[], answerers: ReadonlyMap<number, string>): Promise<Map<number, string>> {
  const asked = new Map<number, number>();

  for (const message of messages) {
    if (message.senderId !== null && message.round !== null && answerers.has(message.senderId) && !asked.has(message.senderId)) {
      asked.set(message.senderId, message.messageId);
    }
  }

  const voiced = new Map<number, string>();

  await Promise.all(
    [...asked].map(async ([number, messageId]) => {
      if (await isOwnerNumber(chatId, number, messageId)) voiced.set(number, answerers.get(number)!);
    })
  );

  return voiced;
}

async function isOwnerNumber(chatId: number, number: number, messageId: number): Promise<boolean> {
  const key = `${chatId}:${number}`;
  const held = ownerNumbers.get(key);

  if (held !== undefined && held.until > Date.now()) return held.owner;

  try {
    const answer = await receiverCall(
      receiver().GET("/rooms/{roomId}/messages/{messageId}/sender-is-owner", {
        params: { path: { roomId: chatId, messageId } },
        signal: within(5_000)
      })
    );

    // The route answers `owner` (the receiver's `docs/api.md`), where the published client's types name its field
    // otherwise, so the answer is read by the document's name.
    const owner = (answer as { owner?: unknown }).owner === true;

    ownerNumbers.set(key, { owner, until: Date.now() + OWNER_NUMBER_TTL_MS });

    return owner;
  } catch {
    // A question the receiver did not answer leaves the message under the name it was filed with.
    return false;
  }
}

function senderKey(message: ReceivedMessage): string {
  return `${message.senderId ?? ""}:${message.senderName}`;
}

// The message a reply answers, as the reply shows it; one the receiver does not hand over stands with nothing.
async function replyQuoteOf(chatId: number, messageId: number, held?: { message: ReceivedMessage; media: ReturnType<typeof mediaOf> }): Promise<ReplyQuote> {
  try {
    // A message the page itself holds is quoted from the page, its files from the read the page already made.
    const answered = held?.message ?? receivedOf(await receiverCall(
      receiver().GET("/rooms/{roomId}/messages/{messageId}", {
        params: { path: { roomId: chatId, messageId } },
        signal: within(5_000)
      })
    ));

    if (answered !== undefined) {
      return {
        messageId,
        senderName: answered.senderName,
        text: answered.text,
        pictured: answered.imagePath !== null,
        attachment: (await (held?.media ?? mediaOf(chatId, answered))).attachments[0] ?? null
      };
    }
  } catch {
    // A quote is no reason to fail the page.
  }

  return { messageId, senderName: null, text: "", pictured: false, attachment: null };
}

// A page of the receiver's read into the messages the screen draws.
async function messagesOf(chatId: number, received: readonly ReceivedMessage[]): Promise<ArchivedMessage[]> {
  const answerers = await answererNumbers(chatId).catch(() => new Map<number, string>());
  const agents = new Map(received.map((message) => [senderKey(message), message.senderId !== null && answerers.has(message.senderId)]));
  const voiced = await ownerVoices(chatId, received, answerers);
  // Each message's files are read once, and a reply to a message the page holds quotes it from the page.
  const media = new Map(received.map((message) => [message.messageId, mediaOf(chatId, message)]));
  const onPage = new Map(received.map((message) => [message.messageId, message]));
  // Several replies of a page often answer one message; what it said and carried is read once.
  const quoted = new Map<number, Promise<ReplyQuote>>();
  const quote = (messageId: number): Promise<ReplyQuote> => {
    let held = quoted.get(messageId);

    if (held === undefined) {
      const page = onPage.get(messageId);

      held = replyQuoteOf(chatId, messageId, page === undefined ? undefined : { message: page, media: media.get(messageId)! });
      quoted.set(messageId, held);
    }

    return held;
  };

  const built: ArchivedMessage[] = await Promise.all(
    received.map(async (message) => {
      const agent = agents.get(senderKey(message)) === true;
      const voicedBy = agent && message.round !== null && message.senderId !== null ? voiced.get(message.senderId) : undefined;
      const files = await media.get(message.messageId)!;

      return {
        chatId: message.chatId,
        messageId: message.messageId,
        senderId: message.senderId,
        senderName: message.senderName,
        sentAt: message.sentAt,
        text: message.text,
        imagePath: message.imagePath,
        replyToMessageId: message.replyToMessageId,
        answerSeconds: message.answerSeconds,
        round: message.round,
        album: message.album,
        agent,
        ...(voicedBy === undefined ? {} : { voicedBy }),
        notice: agent && isSystemNotice(message.text),
        attachments: files.attachments,
        expressions: files.expressions,
        replyQuote: message.replyToMessageId === null ? null : await quote(message.replyToMessageId),
        spend: null,
        actions: null,
        drafts: null
      };
    })
  );

  // What a round cost and what it did stands on the round's last message (docs/web.md, the room screen's
  // meta line): the runs behind the page's rounds are read once each, and a run the agency no longer holds
  // leaves the message as it stood.
  const last = new Map<string, number>();

  built.forEach((message, index) => {
    if (message.round != null && message.agent === true) last.set(message.round, index);
  });

  // How the round's draft process made its answer stands there too (docs/web.md, the room screen's draft chip): the
  // page's rounds are read from the receiver's round log at once.
  const [, drafts] = await Promise.all([
    Promise.all(
      [...last].map(async ([round, index]) => {
        const figures = await figuresOf(round).catch(() => null);

        if (figures !== null && built[index] !== undefined) {
          built[index]!.spend = figures.spend;
          built[index]!.actions = figures.actions;
        }
      })
    ),
    draftSummaries(chatId, [...last.keys()])
  ]);

  for (const [round, index] of last) {
    if (built[index] !== undefined) built[index]!.drafts = drafts.get(round) ?? null;
  }

  return built;
}

// How far before a page's first message a judgement about it can have been written: one written earlier was left by
// an earlier message that held the same number (docs/web.md, the room screen's verdicts).
const JUDGED_BEFORE_SECONDS = 600;
// How far past a page's last message its judgements are read, for a page short of the room's end: a turn's
// verdicts stand under the last message it read and are written while the turn goes on.
const JUDGED_AFTER_SECONDS = 3_600;

/** The judgements standing under a page's messages: each under the message the gate filed it under where it could
 * have been about that message, or, filed under none, under the message its round answered with. */
export function placedJudgements(messages: readonly ArchivedMessage[], judgements: readonly Judgement[]): Judgement[] {
  const sent = new Map(messages.map((message) => [message.messageId, message.sentAt]));
  // A round's answer can stand as a run of messages; its verdicts stand under the last of them.
  const answered = new Map<string, number>();

  for (const message of messages) {
    if (message.round != null) answered.set(message.round, message.messageId);
  }

  return judgements.flatMap((judgement) => {
    if (judgement.messageId !== null) {
      const at = sent.get(judgement.messageId);

      return at !== undefined && judgement.createdAt >= at - JUDGED_BEFORE_SECONDS ? [judgement] : [];
    }

    const answer = judgement.round == null ? undefined : answered.get(judgement.round);

    return answer === undefined ? [] : [{ ...judgement, messageId: answer }];
  });
}

// A page with the judgements standing under its messages, read for the stretch of time the page covers: from a
// little before its first message to now for the room's end, and to a while past its last message otherwise. The
// room is the receiver's, so a gate that does not answer leaves the page without verdicts rather than unread.
async function pageOf(chatId: number, page: { items: ReceiverMessage[]; more: boolean }, end: boolean): Promise<MessagePage> {
  const messages = await messagesOf(chatId, page.items.map(receivedOf));
  const times = messages.map((message) => message.sentAt);
  const judgements = times.length === 0
    ? []
    : await judgementsWithin(chatId, {
        from: Math.min(...times) - JUDGED_BEFORE_SECONDS,
        to: end ? null : Math.max(...times) + JUDGED_AFTER_SECONDS
      }).catch(() => []);

  return { messages, judgements: placedJudgements(messages, judgements), hasMore: page.more };
}

/** One page of a room, oldest first, ending just before `before` when it is given. */
export async function readMessagePage(chatId: number, before: number | null, limit: number): Promise<MessagePage> {
  const page = await receiverCall(
    receiver().GET("/rooms/{roomId}/messages", {
      params: {
        path: { roomId: chatId },
        query: { limit: Math.min(limit, PAGING.maxSize), ...(before === null ? {} : { before }) }
      },
      signal: within(5_000)
    })
  );

  return await pageOf(chatId, page, before === null);
}

/** The messages of a room past a message the reader already holds, oldest first. */
export async function readMessagesAfter(chatId: number, after: number, limit: number): Promise<MessagePage> {
  const page = await receiverCall(
    receiver().GET("/rooms/{roomId}/messages", {
      params: { path: { roomId: chatId }, query: { after, limit: Math.min(limit, PAGING.maxSize) } },
      signal: within(5_000)
    })
  );

  return await pageOf(chatId, page, !page.more);
}

/** One message of a room by its own number, as a page of one, or an empty page where the screen stands none. */
export async function readOneMessage(chatId: number, messageId: number): Promise<MessagePage> {
  const message = await receiverCall(
    receiver().GET("/rooms/{roomId}/messages/{messageId}", {
      params: { path: { roomId: chatId, messageId } },
      signal: within(5_000)
    })
  );

  return await pageOf(chatId, { items: [message], more: false }, false);
}

/** Where a day begins in a room: the first message a person said at or after a moment, or null. */
export async function readDayStart(chatId: number, from: number): Promise<{ messageId: number } | null> {
  const { messageId } = (await receiverCall(
    receiver().GET("/rooms/{roomId}/day-start", { params: { path: { roomId: chatId }, query: { from } }, signal: within(5_000) })
  )) as { messageId: number | null };

  return messageId === null ? null : { messageId };
}

/** A room's judgements newest first, the page before `before` where it is given: the gate's own (docs/boundary.md, 「Gaps the console meets」). */
export async function readJudgementPage(chatId: number, before: number | null, limit: number): Promise<JudgementPage> {
  return await judgementsOf(chatId, before, limit);
}
