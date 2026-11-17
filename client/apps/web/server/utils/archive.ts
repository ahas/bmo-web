import { PAGING, roomLabel } from "#shared/config";
import { isSystemNotice } from "#shared/text-marks";
import { readingStateOf } from "#shared/voice-briefings";
import { wording } from "#shared/wording";

import { agentLabels } from "./agent-labels";
import { draftSummaries } from "./drafting";
import { roomBriefings } from "./voice";
import { figuresOf } from "./runfigures";
import { judgementsWithin, markOf } from "./gate";
import { withOpenings } from "./openings";
import { ownerChat } from "./owner";
import { carriesFiles, messageMedia } from "./message-media";
import { exactAnswer, exactMessage, exactMessages, receiver, receiverCall } from "./receiver";

import type { ArchivedMessage, ExactMessageId, ForwardedFrom, Judgement, JudgementMark, MessageAttachment, MessageBriefing, MessagePage, MessageReaction, ReplyQuote, RoomSummary, RoundFiguresOf, Situation, TelegramExpression, TelegramFormat, VoiceBriefing } from "#shared/types";
import type { ExactMessage, ReceiverRoom } from "./receiver";
import type { JudgementSpan } from "./gate";

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

// The voice a send the receiver archived itself went out in (the receiver's `docs/api.md`, 「Messages」): the agent's
// own bot account, or a person's account speaking for it.
type SentVoice = "bot-account" | "human-avatar" | "human-reader";

// The kinds the receiver's record holds a message under where it is more than a plain message (its `docs/api.md`,
// 「Messages」): a thinking block it holds as a message, and a sticker, whether the record sent it or a chat service
// handed its picture over as one.
const THINKING = "thinking";
const STICKER = "sticker";

interface ReceivedMessage {
  chatId: number;
  messageId: ExactMessageId;
  senderId: number | null;
  senderName: string;
  sentAt: number;
  text: string;
  imagePath: string | null;
  replyToMessageId: ExactMessageId | null;
  answerSeconds: number | null;
  round: string | null;
  album: ExactMessageId | null;
  via: string | null;
  // The agent whose words the message is, on a send the receiver archived itself, and the voice it went out in. Both
  // are null on a message a provider carried in.
  agentName: string | null;
  voice: SentVoice | null;
  // What the record keeps the message as, where it is more than a plain message: a sticker, or a thinking block.
  kind: string | null;
  files: KeptFile[];
  // Where the record says the message was forwarded from, on a message kept as a forward.
  forwardedFrom: ForwardedFrom | null;
  // The room's situation note as the round that judged the message read it.
  situation: Situation | null;
  // What a voice note was heard as: the words, how long the recording ran in seconds, and whether it was heard or
  // could not be. All null on any other message.
  transcript: string | null;
  voiceSeconds: number | null;
  voiceState: string | null;
  // What the record keeps done to it, in unix seconds, and its reactions.
  editedAt: number | null;
  deletedAt: number | null;
  pinnedAt: number | null;
  reactions: MessageReaction[];
}

// A message as the receiver's own document answers it, read into the names the room screen stands on: its
// every message id in it is exact, and the room it stands in is its own.
function receivedOf(message: ExactMessage): ReceivedMessage {
  const sent = message as ExactMessage & { voice?: SentVoice | null };
  const moment = (ms: number | null | undefined): number | null => (ms == null ? null : seconds(ms));

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
    agentName: sent.agentName ?? null,
    voice: sent.voice ?? null,
    kind: message.kind ?? null,
    files: message.files,
    forwardedFrom: message.forwardedFrom ?? null,
    situation: message.situation ?? null,
    transcript: message.transcript ?? null,
    voiceSeconds: message.voiceSeconds ?? null,
    voiceState: message.voiceState ?? null,
    editedAt: moment(message.editedAt),
    deletedAt: moment(message.deletedAt),
    pinnedAt: moment(message.pinnedAt),
    reactions: (message.reactions ?? []).map((one) => ({ emoji: one.emoji, by: one.by }))
  };
}

const ATTACHED: readonly MessageAttachment["kind"][] = ["audio", "video", "animation", "document", "sticker"];

// The receiver states its times in epoch milliseconds; a shape the screen draws states them in the unix
// seconds `bmo-ui` reads, as every other unit adapter here does.
const seconds = (ms: number): number => Math.floor(ms / 1000);

// Every room the receiver shows, the pinned ones first in the owner's order: one page, as its route answers.
async function everyRoom(): Promise<ReceiverRoom[]> {
  return (await receiverCall(receiver().GET("/rooms"))).items;
}

// The names of the people whose numbers some rooms are, as the receiver names them (its `GET /people`): a one-to-one
// with no title of its own is called by the person it is with (docs/web.md, 「Sidebar」). A list the receiver does not
// answer names nobody, and the room stands under its number.
async function peopleNamed(ids: readonly number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();

  try {
    const people = await receiverCall(receiver().GET("/people", { params: { query: { ids: ids.join(",") } } }));

    return new Map(people.items.flatMap((person) => (person.name === null || person.name === undefined || person.name.trim() === "" ? [] : [[person.id, person.name] as const])));
  } catch {
    return new Map();
  }
}

const untitled = (title: string | null): boolean => title === null || title.trim() === "";

/** Whether a room has been added, as the receiver's record of it says and never by the chat service it is on: his
 * private chat, a room added in a mode, one naming supervisors, one pinned, or one on the listen list. Words of his
 * in a room add nothing (docs/web.md, 「Sidebar」). */
export function isAdded(room: ReceiverRoom): boolean {
  return room.ownerRoom || room.mode !== null || room.supervisors.length > 0 || room.pinned || room.listened;
}

/** Every room that has been added, the pinned ones first in the owner's order, each under the name it is called by
 * (docs/web.md, 「Sidebar」). */
export async function listRooms(): Promise<RoomSummary[]> {
  const [every, owner] = await Promise.all([everyRoom(), ownerChat()]);
  const rooms = every.filter(isAdded);
  const named = await peopleNamed(rooms.filter((room) => untitled(room.title) && room.id !== owner).map((room) => room.id));

  return await Promise.all(
    rooms.map(async (room): Promise<RoomSummary> => {
      return {
        chatId: room.id,
        title: roomLabel(room.id, untitled(room.title) ? (named.get(room.id) ?? null) : room.title, owner),
        messageCount: room.messageCount,
        lastMessageAt: room.lastMessageAt === null ? null : seconds(room.lastMessageAt),
        pinned: room.pinned
      };
    })
  );
}

/** One room by the name it is called by, the same name the room list gives it. */
export async function roomTitleOf(chatId: number): Promise<string> {
  const [{ title }, owner] = await Promise.all([
    receiverCall(receiver().GET("/rooms/{roomId}/title", { params: { path: { roomId: chatId } } })),
    ownerChat()
  ]);
  const person = untitled(title) && chatId !== owner ? ((await peopleNamed([chatId])).get(chatId) ?? null) : null;

  return roomLabel(chatId, untitled(title) ? person : title, owner);
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

// What a message carried and what its words were sent with. Its metadata is asked for when its row may draw words
// from it — its page names a file, or it is not an agent's answer and has words of its own; an agent's answer
// without files is drawn as its markdown and asks nothing. A list that cannot be read is no reason to fail the
// page, and the line names its files as unavailable instead.
async function mediaOf(chatId: number, message: ReceivedMessage, wordsFromMetadata: boolean): Promise<{ attachments: MessageAttachment[]; expressions: TelegramExpression[]; formats: TelegramFormat[] }> {
  const listed = carriesFiles(message.files);

  if (!listed && !wordsFromMetadata) return { attachments: [], expressions: [], formats: [] };

  try {
    return await messageMedia(chatId, message.messageId, message.text, listed);
  } catch {
    return { attachments: attachmentsOf(message), expressions: [], formats: [] };
  }
}

// The numbers an agent's own words stand under in a room, as the receiver gives each of the room's answerers
// its own number: a message whose sender is one of them is an agent's.
export async function agentNumbers(chatId: number): Promise<Set<number>> {
  return new Set((await answererNumbers(chatId)).numbers.keys());
}

// Each of a room's answerers' own numbers with the agent whose words stand under it, and the room's voice: the agent the
// receiver speaks for the room as. Where two agents stand under one number, it is the voice's.
async function answererNumbers(chatId: number): Promise<{ numbers: Map<number, string>; voice: string | null }> {
  const answerers = await receiverCall(
    receiver().GET("/rooms/{roomId}/answerers", { params: { path: { roomId: chatId } } })
  );
  const names = [...new Set([answerers.default, ...answerers.items.map((answerer) => answerer.agentName), answerers.voice])].filter((name) => name !== "");
  const numbers = await Promise.all(
    names.map(async (agentName) => {
      try {
        const answer = await receiverCall(
          receiver().GET("/rooms/{roomId}/own-number", {
            params: { path: { roomId: chatId }, query: { agentName } }
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

  return { numbers: owned, voice: answerers.voice || answerers.default || null };
}

// How long the receiver's word that a number is the owner's account stands before it is asked again.
const OWNER_NUMBER_TTL_MS = 10 * 60_000;
const ownerNumbers = new Map<string, { owner: boolean; until: number }>();

// The agents whose answers a page holds sent in the owner's own account, by the number they went out under: an agent's
// number the receiver says is the owner's, asked once for each such number through one message of the page that went
// out in a round (docs/web.md, 「An answer sent in the owner's own account wears the agent's face」). A page the
// receiver named the agent on every send of needs no question.
async function ownerVoices(chatId: number, messages: readonly ReceivedMessage[], answerers: ReadonlyMap<number, string>): Promise<Map<number, string>> {
  const asked = new Map<number, ExactMessageId>();

  for (const message of messages) {
    if (message.agentName === null && message.senderId !== null && message.round !== null && answerers.has(message.senderId) && !asked.has(message.senderId)) {
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

async function isOwnerNumber(chatId: number, number: number, messageId: ExactMessageId): Promise<boolean> {
  const key = `${chatId}:${number}`;
  const held = ownerNumbers.get(key);

  if (held !== undefined && held.until > Date.now()) return held.owner;

  try {
    const answer = await receiverCall(
      receiver().GET("/rooms/{roomId}/messages/{messageId}/sender-is-owner", {
        params: { path: { roomId: chatId, messageId } }
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

// The agent whose words a message is, where its answer went out in a person's own account: the receiver names both
// the agent and the voice on a send it archived itself, and a message written before it did is read by the number it
// went out under and the voice the room answers as. A send in the agent's own bot account is no such answer.
function accountAgent(message: ReceivedMessage, voiced: ReadonlyMap<number, string>): string | undefined {
  // The agent the receiver names on its send is the agent whose words the message is, whichever voice it went out in —
  // its own bot account or a person's — so a supervisor speaking in a room that names it stands under its own name
  // (docs/web.md, the naming rule).
  if (message.agentName !== null) return message.agentName;

  return message.round !== null && message.senderId !== null ? voiced.get(message.senderId) : undefined;
}

// The agent whose words an agent's message is, so its row wears that agent's face in every room (docs/web.md, 「An
// agent's words wear the agent's face in every room」): the one the receiver names on its send, else the agent whose
// own number it went out under, else — a notice said in the room's voice — the agent the room answers as.
function speakerOf(message: ReceivedMessage, agent: boolean, answerers: ReadonlyMap<number, string>, voice: string | null): string | undefined {
  if (!agent) return undefined;
  if (message.agentName !== null) return message.agentName;

  const owned = message.senderId === null ? undefined : answerers.get(message.senderId);

  return owned ?? voice ?? undefined;
}

function senderKey(message: ReceivedMessage): string {
  return `${message.senderId ?? ""}:${message.senderName}`;
}

// The message a reply answers, as the reply shows it; one the receiver does not hand over stands with nothing.
async function replyQuoteOf(chatId: number, messageId: ExactMessageId, held?: { message: ReceivedMessage; media: ReturnType<typeof mediaOf> }): Promise<ReplyQuote> {
  try {
    // A message the page itself holds is quoted from the page, its files from the read the page already made.
    const answered = held?.message ?? receivedOf(await exactMessage(chatId, messageId));

    if (answered !== undefined) {
      return {
        messageId,
        senderName: answered.senderName,
        text: answered.text,
        pictured: answered.imagePath !== null,
        ...(answered.kind === STICKER ? { sticker: true } : {}),
        attachment: (await (held?.media ?? mediaOf(chatId, answered, false))).attachments[0] ?? null
      };
    }
  } catch {
    // A quote is no reason to fail the page.
  }

  return { messageId, senderName: null, text: "", pictured: false, attachment: null };
}

// A page of the receiver's read into the messages the screen draws.
async function messagesOf(chatId: number, received: readonly ReceivedMessage[]): Promise<ArchivedMessage[]> {
  const room = await answererNumbers(chatId).catch(() => ({ numbers: new Map<number, string>(), voice: null }));
  const answerers = room.numbers;
  const agents = new Map(received.map((message) => [senderKey(message), message.agentName !== null || (message.senderId !== null && answerers.has(message.senderId))]));
  // What each agent is called, as the agency holds it, so an agent's row stands under its label for every reader.
  const [voiced, labels] = await Promise.all([ownerVoices(chatId, received, answerers), agentLabels()]);
  // Each message's files are read once, and a reply to a message the page holds quotes it from the page. A row
  // draws its words from the metadata it arrived with unless it is an agent's answer, which stands as its markdown.
  const media = new Map(received.map((message) => [message.messageId, mediaOf(chatId, message, message.text !== "" && agents.get(senderKey(message)) !== true)]));
  const onPage = new Map(received.map((message) => [message.messageId, message]));
  // Several replies of a page often answer one message; what it said and carried is read once.
  const quoted = new Map<ExactMessageId, Promise<ReplyQuote>>();
  const quote = (messageId: ExactMessageId): Promise<ReplyQuote> => {
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
      const voicedBy = accountAgent(message, voiced);
      const speaker = speakerOf(message, agent, answerers, room.voice);
      const named = voicedBy ?? speaker;
      const speakerLabel = named === undefined ? undefined : labels.get(named);
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
        ...(speaker === undefined ? {} : { speaker }),
        ...(speakerLabel === undefined ? {} : { speakerLabel }),
        notice: agent && isSystemNotice(message.text),
        ...(agent && message.kind === THINKING ? { thinking: true } : {}),
        ...(message.kind === STICKER ? { sticker: true } : {}),
        attachments: files.attachments,
        expressions: files.expressions,
        formats: files.formats,
        replyQuote: message.replyToMessageId === null ? null : await quote(message.replyToMessageId),
        ...(message.forwardedFrom === null ? {} : { forwardedFrom: message.forwardedFrom }),
        ...(message.situation == null ? {} : { situation: message.situation }),
        transcript: message.transcript,
        voiceSeconds: message.voiceSeconds,
        voiceState: message.voiceState,
        spend: null,
        actions: null,
        drafts: null,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        pinnedAt: message.pinnedAt,
        reactions: message.reactions
      };
    })
  );

  // How the round's draft process made its answer stands on the round's last message (docs/web.md, the room screen's
  // draft chip): the page's rounds are read from the receiver's round log at once. What the round cost and did is
  // not read with the page; the room asks for it once the page has landed (roundFigures).
  const last = new Map<string, number>();

  built.forEach((message, index) => {
    if (message.round != null && message.agent === true) last.set(message.round, index);
  });

  const [drafts, briefings] = await Promise.all([draftSummaries(chatId, [...last.keys()]), roomBriefings(chatId)]);

  // Each agent line but a thinking message carries its voice briefing chip, standing where the voice engine says the
  // line's full reading stands (docs/web.md, the room screen's voice briefing chip).
  for (const message of built) {
    if (message.agent === true && message.thinking !== true) message.briefing = lineBriefing(briefings, message.messageId);
  }

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
export function placedJudgements<J extends JudgementMark>(messages: readonly ArchivedMessage[], judgements: readonly J[]): J[] {
  const sent = new Map(messages.map((message) => [message.messageId, message.sentAt]));
  // A round's answer can stand as a run of messages; its verdicts stand under the last of them.
  const answered = new Map<string, ExactMessageId>();

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

/**
 * What the rounds of a room's answers spent and did, each answer read from the room so a round of another room is
 * never asked by this one, and each round read once, side by side (docs/web.md, the room screen's chip line). An
 * answer the room does not hold, one in no round, and a round the agency holds no run of are left out.
 */
export async function roundFigures(chatId: number, messageIds: readonly ExactMessageId[]): Promise<RoundFiguresOf[]> {
  const rounds = new Map<string, ExactMessageId>();

  await Promise.all(
    messageIds.map(async (messageId) => {
      try {
        const message = await exactMessage(chatId, messageId);

        if (message.round != null && !rounds.has(message.round)) rounds.set(message.round, messageId);
      } catch {
        // An answer the receiver does not hand over has no round to ask about.
      }
    })
  );

  const read = await Promise.all(
    [...rounds].map(async ([round, messageId]): Promise<RoundFiguresOf | null> => {
      const figures = await figuresOf(round).catch(() => null);

      return figures === null ? null : { messageId, round, spend: figures.spend, actions: figures.actions };
    })
  );

  return read.filter((one) => one !== null);
}

// A page with the judgements standing under its messages, read for the stretch of time the page covers: from a
// little before its first message to now for the room's end, and to a while past its last message otherwise. Each
// stands as its mark alone, since a busy stretch holds thousands and only an opened record reads them whole. The
// room is the receiver's, so a gate that does not answer leaves the page without verdicts rather than unread.
async function pageOf(chatId: number, page: { items: ExactMessage[]; more: boolean }, end: boolean): Promise<MessagePage> {
  const received = page.items.map(receivedOf);
  const times = received.map((message) => message.sentAt);
  // The verdicts are asked for beside the messages, the stretch they cover being known from the receiver's page.
  const [messages, judgements] = await Promise.all([
    messagesOf(chatId, received),
    times.length === 0
      ? Promise.resolve([])
      : judgementsWithin(chatId, {
          from: Math.min(...times) - JUDGED_BEFORE_SECONDS,
          to: end ? null : Math.max(...times) + JUDGED_AFTER_SECONDS
        }).catch(() => [])
  ]);

  return { messages, judgements: placedJudgements(messages, judgements.map(markOf)), hasMore: page.more };
}

/** One page of a room, oldest first, ending just before `before` when it is given. */
export async function readMessagePage(chatId: number, before: ExactMessageId | null, limit: number): Promise<MessagePage> {
  const page = await exactMessages(chatId, { limit: Math.min(limit, PAGING.maxSize), ...(before === null ? {} : { before }) });

  return await pageOf(chatId, page, before === null);
}

/** The messages of a room past a message the reader already holds, oldest first. */
export async function readMessagesAfter(chatId: number, after: ExactMessageId, limit: number): Promise<MessagePage> {
  const page = await exactMessages(chatId, { after, limit: Math.min(limit, PAGING.maxSize) });

  return await pageOf(chatId, page, !page.more);
}

/** One message of a room by its own number, as a page of one, or an empty page where the screen stands none. */
export async function readOneMessage(chatId: number, messageId: ExactMessageId): Promise<MessagePage> {
  const message = await exactMessage(chatId, messageId);

  return await pageOf(chatId, { items: [message], more: false }, false);
}

/** Where a day begins in a room: the first message a person said at or after a moment, or null. */
export async function readDayStart(chatId: number, from: number): Promise<{ messageId: ExactMessageId } | null> {
  const { messageId } = (await exactAnswer<{ messageId: number | null }>(
    receiver().GET("/rooms/{roomId}/day-start", { params: { path: { roomId: chatId }, query: { from } }, parseAs: "text" })
  ));

  return messageId === null ? null : { messageId };
}

/**
 * The judgements of a room that `ids` names, whole and each worn by what opened its turn, read for the stretch of time
 * they were written in (docs/web.md, the room screen's chip line). One the gate does not hold within it is left out.
 */
export async function readWholeJudgements(chatId: number, ids: readonly number[], span: JudgementSpan): Promise<Judgement[]> {
  const asked = new Set(ids);

  return await withOpenings(chatId, (await judgementsWithin(chatId, span)).filter((judgement) => asked.has(judgement.id)));
}

/** Where a line's full reading stands, as the voice engine's briefings of its room say: never asked for, being made,
 * there — the engine's own sound, or the voice message a reading from before it spoke readings went out as —,
 * failed, or stopped before it stood. The newest reading of the line is the one that counts. */
export function lineBriefing(briefings: readonly VoiceBriefing[], messageId: ExactMessageId): MessageBriefing {
  const reading = briefings.find((one) => one.kind === "full" && one.messageId === messageId);

  if (reading === undefined) return { state: "idle", source: null, voiceMessageId: null, sound: null, briefingId: null };

  const state = readingStateOf(reading.state);

  if (state !== "ready") return { state, source: null, voiceMessageId: null, sound: null, briefingId: reading.id };

  return {
    state,
    source: reading.spoken ? "kept" : reading.voiceMessageId === null ? null : "voice",
    voiceMessageId: reading.voiceMessageId,
    sound: null,
    briefingId: reading.id
  };
}
