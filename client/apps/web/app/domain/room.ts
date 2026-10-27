import { markWords, MEDIA_MARKS, VOICE_MARK } from "#shared/text-marks";
import { PAGING, POLL_INTERVAL_MS } from "#shared/config";
import { chatAgent } from "#shared/agent-names";
import { agentRowName, bmoLabel, companionOf, defaultAnswererName } from "./agents";
import { agentKey, avatarFor, hueOf } from "./avatars";
import { failureText } from "bmo-ui/app/domain/errors";
import { runKey } from "./events";
import { countText } from "./numbers";
import { dayKey, formatDay } from "bmo-ui/app/domain/time";
import { subjectOf } from "./working";

import type {
  ArchivedMessage,
  Judgement,
  MessageAttachment,
  MessageBriefing,
  MessagePage,
  ReplyQuote,
  RoundSpend,
  TelegramExpression,
  TurnActionsRef
} from "#shared/types";
import type { DraftSummary } from "#shared/drafting";
import type { AvatarProps } from "@nuxt/ui";
import type { ComputedRef, Ref } from "vue";
import type { AvatarIndex } from "./avatars";
import type { CopyItem } from "./room-copy";
import type { RunState } from "./events";
import type { OutboxItem, OutboxState } from "./outbox";
import type { Translate } from "#shared/wording";

// Which side of the conversation a row stands on.
export type MessageSide = "left" | "right";

// How one message is handed to the chat components: an agent answers, so it takes the assistant
// role and the assistant's side; everyone else is a user. What an agent says is kept as the markdown
// it wrote, so its words stand as that markdown; what a person says reaches the archive with
// Telegram's formatting already taken off, so it stands as the characters it is.
export interface MessageLook {
  role: "assistant" | "user";
  side: MessageSide;
  // Whether the row stands in a bubble ("soft") or as what it carried alone ("naked").
  variant: "naked" | "soft";
  avatar: AvatarProps | undefined;
  markdown: boolean;
}

// Everything a message says of itself stands inside its bubble, so the chat component's own name
// line goes unused and the bottom padding it keeps under the bubble for its own actions is taken
// away: the space between one message and the next is the feed's (docs/web.md, 「The conversation's
// measures」).
export const bubbleBottomPad = "pb-0";

// How wide a row may be, the same on both sides: the row holds its own photo's column and its
// bubble. On a phone it runs over most of the other side's photo column, since a phone has no room to
// keep that column clear and a meta line of chips needs it to stand on one line, but always keeps the
// choosing column clear on the far side: a row on the left slides aside by it while messages are
// chosen and is never cut, and the marks stand beside a row on the right. From the width the whole
// app changes its mind at (see NARROW_MAX_PX) it leaves the photo's column of the other side clear,
// wider than the choosing column, so a bubble on the left never reaches where one on the right could
// begin, and is also at most three quarters of the row, which a desktop has room for (docs/web.md,
// 「One width for both sides」).
export const rowWidth = "max-w-[calc(100%-var(--chat-choose-room))] sm:max-w-[min(calc(100%-var(--chat-face-room)),75%)]";

// The one length and easing everything choosing moves takes as it opens and closes (docs/web.md, how
// several messages are chosen and copied): the top bar's ground and row, a day mark held at the top,
// the rows' squares and the lines sliding aside. Opening and closing choosing is one change of mode,
// so its parts are one movement, starting in the same frame and ending in the same frame, with no
// part waiting for another. Each names the property it moves beside this.
export const choosingMotion = "duration-(--bmo-motion-unfold) ease-(--bmo-ease-move) motion-reduce:transition-none";

// How a line on the leading side moves as choosing opens and closes its column: aside by the
// column's width, by transform alone, as the top bar grows down and folds back. A line moves as one
// piece, and its photo stands outside its row, so the row and the run's photo both take this one
// slide and stand at the same offset in every frame.
export function asideSlide(selecting: boolean): string {
  const moving = `transition-transform ${choosingMotion}`;

  return selecting ? `${moving} translate-x-(--chat-choose-room)` : moving;
}

// How a message's words break (docs/web.md, 「Every message is a bubble」): where they have a space, so
// a Korean word never folds a syllable onto a line of its own, and anywhere only where a run with no
// break in it is wider than its line.
export const wordsWrap = "break-keep wrap-anywhere text-pretty";

// The picture's room stands on the same side as the bubble, so a row on the right runs the other
// way round: the bubble first and the picture's room at the outer edge. The chat component lays a
// row out from the leading edge, which is what these classes turn about, and the group stays where
// the side put it. The room between the picture and its bubble is the conversation's own.
export function sideLayout(side: MessageSide): { container: string } {
  const shared = `${bubbleBottomPad} gap-(--chat-face-gap) ${rowWidth}`;

  return { container: side === "right" ? `${shared} ms-auto flex-row-reverse justify-start` : shared };
}

// The colour a sender's name is drawn in at the head of a bubble (docs/web.md, 「The conversation's
// measures」): one of the conversation's eight name colours, chosen by the sender's number, so the
// same person — an agent included — wears the same colour in every room. A sender with no number
// is chosen by name. The choice is the one a face with no picture is drawn on (avatars.ts hueOf,
// FACE_TONES), so a sender's letter and name are one hue.
export const NAME_COLOURS = [
  "text-(--chat-name-1)",
  "text-(--chat-name-2)",
  "text-(--chat-name-3)",
  "text-(--chat-name-4)",
  "text-(--chat-name-5)",
  "text-(--chat-name-6)",
  "text-(--chat-name-7)",
  "text-(--chat-name-8)"
] as const;

export function nameColour(senderId: number | null, senderName: string): string {
  return NAME_COLOURS[hueOf(senderId, senderName)]!;
}

// Where a row stands in its sender's run (docs/web.md, 「One sender's run is one block」).
export interface RunPlace {
  first: boolean;
  last: boolean;
}

// The place a row stands at as one object for each place, so a row whose place has not changed is
// handed the very same one and its drawing is kept.
const PLACES: readonly (readonly RunPlace[])[] = [
  [{ first: false, last: false }, { first: false, last: true }],
  [{ first: true, last: false }, { first: true, last: true }]
];

export function runPlace(first: boolean, last: boolean): RunPlace {
  return PLACES[Number(first)]![Number(last)]!;
}

// A bubble's ground and corners. Someone else's words stand on the raised ground, the owner's own on
// the teal the stylesheet declares once for it, and every bubble draws its secondary colours as inks
// of its own ground and its surfaces as steps from it (docs/web.md, 「The conversation's measures」); the tail drawn beside it wears the
// same ground, so the two match exactly. Every corner takes the shared radius every box of the console takes; where two bubbles of a run meet, the corners on the photo's side take the small tier, so the
// run reads as one block, and the last bubble's foot on that side is square where its tail hangs. The
// bubble keeps no inner room of its own: its parts keep it, since a picture runs to its edges. A row
// that is a sticker alone has no bubble at all.
export function bubbleLook(look: Pick<MessageLook, "side" | "variant">, place: RunPlace): string {
  if (look.variant === "naked") {
    return "";
  }

  const right = look.side === "right";
  const ground = right ? "chat-mine" : "chat-theirs";
  const head = place.first ? "" : right ? "rounded-tr-(--chat-radius-joined)" : "rounded-tl-(--chat-radius-joined)";
  const foot = place.last ? (right ? "rounded-br-none" : "rounded-bl-none") : right ? "rounded-br-(--chat-radius-joined)" : "rounded-bl-(--chat-radius-joined)";

  return ["chat-bubble rounded-(--chat-radius) bg-(--bubble)", ground, head, foot].filter((part) => part !== "").join(" ");
}

// One sender's run: messages one after another from the same sender on the same side, within one
// day and within a run's join time of each other, which stand as one block beside one photo. A notice stands alone, and a message a turn passed
// over ends the run it closes, since the line saying so stands under it between runs.
export interface SenderRun {
  // Named after the row it follows, so a run keeps its key when its first row hands its place to
  // another — a running turn's to its answer, a message on its way to the archived one.
  key: string;
  side: MessageSide;
  senderName: string;
  avatar: AvatarProps | undefined;
  notice: boolean;
  rows: FeedItem[];
}

// How long after one message the next of the same sender still joins its run.
export const RUN_JOIN_SECONDS = 600;

// Whether a row joins the run of the row before it (docs/web.md, 「One sender's run is one block」): the
// same sender on the same side, within a run's join time of it, whatever either carries — words, a
// picture, an album, a file, a voice — and nothing standing between them. A notice, a turn passed
// over and the day changing each end the run.
function sameSender(before: FeedItem, next: FeedItem): boolean {
  if (before.notice || next.notice || before.skipped > 0 || before.look.side !== next.look.side) {
    return false;
  }

  if (next.sentAt - before.sentAt > RUN_JOIN_SECONDS) {
    return false;
  }

  return before.senderId !== null || next.senderId !== null ? before.senderId === next.senderId : before.senderName === next.senderName;
}

// One day's rows as runs. `opening` names the place the day's first run follows.
export function senderRuns(rows: readonly FeedItem[], opening: string): SenderRun[] {
  const runs: SenderRun[] = [];
  let previous: FeedItem | null = null;

  for (const row of rows) {
    const current = runs.at(-1);

    if (current !== undefined && previous !== null && sameSender(previous, row)) {
      current.rows.push(row);
    } else {
      runs.push({
        key: previous === null ? opening : `after:${previous.life ?? previous.key}`,
        side: row.look.side,
        senderName: row.senderName,
        avatar: row.look.avatar,
        notice: row.notice,
        rows: [row]
      });
    }

    previous = row;
  }

  return runs;
}

export interface TextPart {
  type: "text";
  text: string;
}

// What a message that is still on its way says about itself. An archived message carries none.
export interface PendingMark {
  state: OutboxState;
  reason: string | null;
  // Whether the bot has numbered it: it went, and only the archive has yet to carry it.
  sent: boolean;
}

// Where a message of the reader's own stands on its way, told by one mark beside its time. Every
// such message carries one — an archived one is sent — so a change of state changes the mark alone
// and never what stands around it.
export type SendMark = OutboxState | "sent";

export function sendMark(item: Pick<FeedItem, "look" | "pending" | "run">): SendMark | null {
  if (item.look.side !== "right" || item.run !== null) {
    return null;
  }

  if (item.pending === null || (item.pending.state === "sending" && item.pending.sent)) {
    return "sent";
  }

  return item.pending.state;
}

// One picture of an album row: the message it went out as — none yet for a picture still on its
// way — and where it is fetched from.
export interface AlbumPicture {
  messageId: number | null;
  src: string;
}

// One line of the conversation.
export interface FeedItem {
  key: string;
  // The key the row has stood under since it first stood, where that is not its own: a message the owner sent keeps
  // the key of the line that stood for it while it went, so it is one row for its whole life and is never drawn
  // again (docs/web.md, the room screen's section on a message being sent).
  life?: string;
  messageId: number;
  senderId: number | null;
  senderName: string;
  sentAt: number;
  // The words as the archive holds them, which is what is copied.
  text: string;
  // The words as the bubble stands them: the archive's mark for a file that stands on its own line
  // below is not said twice.
  shownText: string;
  // The message this one answers, when it is a reply.
  quote: ReplyQuote | null;
  imageUrl: string | null;
  // Every picture of the album this row stands for, its own first, where it stands for a send of
  // several pictures; the other pictures of that send are not rows of their own. Absent otherwise.
  album?: AlbumPicture[];
  attachments?: ArchivedMessage["attachments"];
  expressions?: ArchivedMessage["expressions"];
  // The name of a file on its way that the browser cannot draw, so the row says what is going.
  fileName: string | null;
  // How long the room waited for this answer, in whole seconds. Null for everything the room
  // itself said, and for an answer of the chat agent's the archive holds no measurement of.
  answerSeconds: number | null;
  look: MessageLook;
  // The chat components take the AI SDK part shape; a Telegram message is one text part.
  parts: TextPart[];
  judgements: Judgement[];
  // What the round this message ended cost, on the last message a round of the chat agent's sent.
  spend: RoundSpend | null;
  // Where what that turn did is kept, on that same message; null on every other row.
  actions: TurnActionsRef | null;
  // How that round's draft process made the answer, on that same message; null on every other row.
  drafts: DraftSummary | null;
  // The voice briefing that speaks this line, which stands on its chip line rather than as a row.
  briefing: MessageBriefing | null;
  // Null for everything the archive holds; set while a message of the owner's own is still on
  // its way, or once it has failed to go.
  pending: PendingMark | null;
  // The turn this row is standing for, on the one row a room draws while the chat agent works, and null on
  // every row that is a message. A row is a row whichever of the two it holds: the side, the
  // picture, the header, the column the words read in and the chip line under them are the row's
  // and not either state's, so nothing about the row moves when the turn's row becomes the
  // answer's.
  run: RunState | null;
  // How many of the chat agent's turns read this message last and ended in silence. The room stands a line
  // for them under the row, which is not a row of its own and nothing chooses or copies.
  skipped: number;
  // Whether the bot sent this message as the service rather than as the chat agent, as the server says: the row
  // stands as a system line rather than an answer.
  notice: boolean;
  // On an agent's answer that went out in the owner's own account, the name of that account, which the row names
  // beside the agent's own; absent on every other row.
  voice?: string;
}

// A turn that went silent is written down as a judgement of this stage on the message it read.
export const SKIPPED_STAGE = "skipped";

export function skippedTurns(judgements: readonly Judgement[]): number {
  return judgements.filter((judgement) => judgement.stage === SKIPPED_STAGE).length;
}

// The line standing under a message the chat agent passed over. Silent turns never stand next to each other —
// each read a message of its own — so the only ones gathered are those over the same message, and
// those say how many they were. Only the chat agent's turns end in silence, so the line names it.
export function skippedLine(t: Translate, count: number): string {
  const subject = subjectOf(bmoLabel(t));

  return count === 1 ? t("room.status.outcome_skipped", { subject }) : t("room.status.outcome_skipped_times", { subject, n: countText(count) });
}

// What a message carried besides its words, as far as the marks the archive wrote for it go: the
// files kept with it, whether each can be drawn, and whether its picture is kept.
export interface CarriedMedia {
  attachments: readonly { kind: string; name: string; available: boolean }[];
  pictured: boolean;
}

// The marks the receiver writes at the head of a message for what it carried, where the row stands the thing
// itself, each its word from the data file in brackets: the file word and its name for a kept file, which stands
// as a line of its own; the picture word for a kept picture, which stands in place; the video word, the round
// note's or `GIF`, each with its length, for a kept video; and the voice word with its length, or the audio word
// with its name and length, for a kept sound, whose player shows it and its length and whose file line shows its
// name. A sound's mark naming what the file line does not — a performer and a title — stays.
const LENGTH = String.raw`(?: \d+:\d{2})?`;
const VIDEO_MARK = new RegExp(`^\\[(?:${markWords(MEDIA_MARKS.videoNote)}|${markWords(MEDIA_MARKS.video)}|GIF)${LENGTH}\\]`);

function mediaMarks(media: CarriedMedia): RegExp[] {
  const files = media.attachments
    .filter((attachment) => attachment.kind !== "sticker")
    .map((attachment) => new RegExp(`^\\[${markWords(MEDIA_MARKS.file)} ${escaped(attachment.name)}\\]`));
  const sounds = media.attachments.filter((attachment) => attachment.kind === "audio");
  const played = [
    ...(media.attachments.some((attachment) => attachment.kind === "video") ? [VIDEO_MARK] : []),
    ...(sounds.length > 0 ? [VOICE_MARK, new RegExp(`^\\[${markWords(MEDIA_MARKS.audio)}${LENGTH}\\]`)] : []),
    ...sounds.map((sound) => new RegExp(`^\\[${markWords(MEDIA_MARKS.audio)} ${escaped(sound.name)}${LENGTH}\\]`))
  ];

  return [...(media.pictured ? [new RegExp(`^\\[${markWords(MEDIA_MARKS.picture)}\\]`)] : []), ...files, ...played];
}

function escaped(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// A mark at the head of a message says nothing the file's line or the picture under it does not,
// so the bubble leaves it out and keeps the caption after it. The expressions are placed by their
// offset into the text, so they move back by what was taken off. A sticker carries no caption, so
// the words of a message whose sticker is drawn are its mark alone, and none of them is shown.
export function withoutMediaMark(
  text: string,
  media: CarriedMedia,
  expressions: readonly TelegramExpression[]
): { text: string; expressions: TelegramExpression[] } {
  if (media.attachments.some((attachment) => attachment.kind === "sticker" && attachment.available)) {
    return { text: "", expressions: [] };
  }

  for (const mark of mediaMarks(media)) {
    const found = mark.exec(text);

    if (found === null) {
      continue;
    }

    const rest = text.slice(found[0].length);
    const kept = rest.replace(/^\s+/, "");
    const cut = text.length - kept.length;

    return {
      text: kept,
      expressions: expressions
        .filter((expression) => expression.offset >= cut)
        .map((expression) => ({ ...expression, offset: expression.offset - cut }))
    };
  }

  return { text, expressions: [...expressions] };
}

// What a quote shows a small preview of: the picture the answered message kept, or the first file it
// kept — a sticker and a video by themselves, a sound and any other file by their mark.
export type QuoteMedia =
  | { kind: "picture" }
  | { kind: "sticker" | "video" | "voice" | "file"; attachment: MessageAttachment };

export interface QuoteLook {
  name: string;
  words: string;
  media: QuoteMedia | null;
}

function quoteMedia(quote: ReplyQuote): QuoteMedia | null {
  const attachment = quote.attachment ?? null;

  if (quote.pictured === true) {
    return { kind: "picture" };
  }

  if (attachment === null) {
    return null;
  }

  const kind = attachment.kind === "sticker" ? "sticker" : attachment.kind === "video" ? "video" : attachment.kind === "audio" ? "voice" : "file";

  return { kind, attachment };
}

// The length the archive's mark for a video or a sound carries, as it wrote it.
const MARKED_LENGTH = /^\[[^\]]*? (\d+:\d{2})\]/;

// What stands for a message that said nothing but what it carried: the kind of thing, with its
// length where the mark carries one, or a file's own name.
function carriedWords(t: Translate, media: QuoteMedia, text: string): string {
  const length = MARKED_LENGTH.exec(text)?.[1];
  const timed = (word: string): string => (length === undefined ? word : `${word} ${length}`);

  switch (media.kind) {
    case "picture":
      return t("room.label.quote_picture");
    case "sticker":
      return t("room.label.quote_sticker");
    case "video":
      return timed(t("room.label.quote_video"));
    case "voice":
      return timed(t("room.label.voice_message"));
    case "file":
      return media.attachment.name;
  }
}

// What a quote stands: who said the answered message, one line of what it said — its caption, the
// archive's mark for what it carried taken off — and what it carried, or the archive's mark for a
// message it no longer has.
export function quoteText(t: Translate, quote: ReplyQuote): QuoteLook {
  if (quote.senderName === null) {
    return { name: t("room.label.unknown_message"), words: "", media: null };
  }

  const media = quoteMedia(quote);
  const carried: CarriedMedia = { attachments: quote.attachment ? [quote.attachment] : [], pictured: quote.pictured === true };
  const caption = withoutMediaMark(quote.text, carried, []).text.replaceAll(/\s+/g, " ").trim();

  return { name: quote.senderName, words: caption === "" && media !== null ? carriedWords(t, media, quote.text) : caption, media };
}

// What of a row is taken when it is copied: the message itself, without anything the screen
// has put around it.
export function copyItemOf(item: FeedItem): CopyItem {
  return {
    senderName: item.senderName,
    senderId: item.senderId,
    messageId: item.messageId,
    sentAt: item.sentAt,
    text: item.text,
    judgements: item.judgements
  };
}

// Which read one piece of news calls for.
export type FeedRead =
  | { kind: "page" }
  | { kind: "one"; messageId: number }
  | { kind: "after"; after: number; limit: number };

/**
 * The bot's news names one message, so it is answered by reading that message rather than the end
 * of the room again. Four things this has to survive, and the feed's merge carries three of them:
 * a row announced twice is set by its own number and stays one row, a page keeps the order the
 * archive gave it, and news that never arrives is never asked for by name — the read past the
 * newest row held brings everything missed along with it.
 *
 * The fourth is here, and it turns on one question: does the room already hold that number? If it
 * does, the message was edited rather than said — an edit leaves the number where it was — and that
 * row is asked for by its own number, alone. If it does not, the message is new and stands past
 * everything the room holds, so the read is past the newest row held.
 *
 * What the room holds is the only way to tell the two apart. Comparing the announced number with
 * the newest number held cannot do it: a room mixes Telegram's numbers, counting up from one, with
 * the archive's own for what never went through Telegram, counting down below zero, and a number of
 * one ranks against a number of the other by nothing at all. Nor is a row asked for by name as a
 * cursor — past the number before it, for one — since the number before it belongs to neither
 * numbering and names no row, and a cursor that names no row has no position to read past.
 *
 * A room holding nothing has no position to read past either, so it reads the page.
 */
export function feedRead(
  held: readonly { messageId: number }[],
  announced: number | null,
  pageSize: number,
): FeedRead {
  const newest = held[held.length - 1]?.messageId ?? null;

  if (newest === null) {
    return { kind: "page" };
  }

  return announced !== null && held.some((message) => message.messageId === announced)
    ? { kind: "one", messageId: announced }
    : { kind: "after", after: newest, limit: pageSize };
}

// Whether what came back settles it. A gap wider than a page is the one shape that cannot be
// appended: the answer is the oldest of what was missed rather than the newest, and what the room
// wants is its end. That reads the page, which is what a room screen did for every message before
// and is still the right answer here. A row read by its own number is never a gap, so it never
// turns into a page read.
export function needsPage(read: FeedRead, hasMore: boolean): boolean {
  return read.kind === "after" && hasMore;
}

export interface RoomFeed {
  messages: Ref<ArchivedMessage[]>;
  // Archived and live together: what the room has been told about its messages so far.
  judgements: ComputedRef<Judgement[]>;
  older: Ref<boolean>;
  // Whether the room goes on past the newest row held: the feed stands around a message it was
  // taken to, away from the room's end, until reading down brings it back there.
  newer: Ref<boolean>;
  loading: Ref<boolean>;
  loadingOlder: Ref<boolean>;
  loadingNewer: Ref<boolean>;
  failure: Ref<string | null>;
  // The room's end, read fresh and put in the feed. A read of the end already under way is handed in
  // rather than asked again, so the end can be asked for before the screen knows it will open there.
  load: (read?: Promise<MessagePage>) => Promise<void>;
  // The room's end asked for and not put in the feed: what `load` is handed once it is wanted.
  readEnd: () => Promise<MessagePage>;
  loadOlder: () => Promise<number>;
  loadNewer: () => Promise<number>;
  // The feed replaced by the stretch of the room around one message: a page before it, the
  // message, and a page after it. False where the room holds no such message.
  loadAround: (messageId: number) => Promise<boolean>;
  refresh: () => Promise<void>;
  // What the room reads when the bot says one message landed. The number is the one the news
  // carried, or null where it carried none.
  catchUp: (messageId: number | null) => Promise<void>;
  addLiveJudgement: (judgement: Judgement) => void;
}

/**
 * The room's line after a page arrives. A page comes back in the order the archive keeps the room
 * in — by the moment each message was said, and for two said in the same second by the order the
 * archive stored them — and that order cannot be rebuilt from the numbers: a word from the console
 * is numbered below zero and one from Telegram above it, so sorting by number would stand every
 * console word ahead of the whole room. So a page keeps the order it came in, and the rows it
 * shares with what the room holds say where the rest of it stands (docs/web.md, 「A page joins the
 * room's line where its rows stand」). A row the room already holds is replaced where it stands
 * rather than moved, which is what an edited message is; a row before the page's first held row
 * stands before that row, and any other row right after the row before it in the page. The room's
 * end read over a stretch opened at an unread message begins before that stretch, and its earlier
 * rows go above it. Only a page sharing no row with the room is placed by what was asked: an older
 * page before everything held, a newer one after.
 */
export function mergedMessages(
  held: readonly ArchivedMessage[],
  arriving: readonly ArchivedMessage[],
  placement: "older" | "newer",
): ArchivedMessage[] {
  const replacing = new Map(arriving.map((message) => [message.messageId, message]));
  const holding = new Set(held.map((message) => message.messageId));
  // The page's new rows, by the held row they follow in it; null for those before its first.
  const following = new Map<number | null, ArchivedMessage[]>();
  let anchor: number | null = null;
  let first: number | null = null;

  for (const message of arriving) {
    if (holding.has(message.messageId)) {
      first ??= message.messageId;
      anchor = message.messageId;
      continue;
    }

    const after = following.get(anchor);

    if (after === undefined) {
      following.set(anchor, [message]);
    } else {
      after.push(message);
    }
  }

  const leading = following.get(null) ?? [];

  if (first === null) {
    return lastSpends(placement === "older" ? [...leading, ...held] : [...held, ...leading]);
  }

  return lastSpends(
    held.flatMap((message) => [
      ...(message.messageId === first ? leading : []),
      replacing.get(message.messageId) ?? message,
      ...(following.get(message.messageId) ?? [])
    ])
  );
}

// Whether a page and the rows held share a row, which is what places the page among them.
function sharesRow(held: readonly { messageId: number }[], page: readonly { messageId: number }[]): boolean {
  const holding = new Set(held.map((message) => message.messageId));

  return page.some((message) => holding.has(message.messageId));
}

// A round's figure stands on the last message the round sent, and so does its draft process. An answer sent in
// parts arrives a part at a time, and each part was the round's last when it was read, so every earlier part of a
// round gives its figure up to the part after it.
function lastSpends(messages: ArchivedMessage[]): ArchivedMessage[] {
  const carries = (message: ArchivedMessage): boolean => message.spend != null || message.actions != null || message.drafts != null;
  const last = new Map<string, number>();

  messages.forEach((message, index) => {
    if (message.round != null && carries(message)) {
      last.set(message.round, index);
    }
  });

  return messages.map((message, index) =>
    message.round != null && last.get(message.round) !== index && carries(message)
      ? { ...message, spend: null, actions: null, drafts: null }
      : message
  );
}

// One room's messages and the judgements made about them. The archive only ever gains rows,
// so a page that comes back is merged in by id rather than replacing what is already held.
export function useRoomFeed(t: Translate, chatId: number): RoomFeed {
  const describe = (error: unknown): string => failureText(error, t("room.error.read_failed"));

  const messages = ref<ArchivedMessage[]>([]);
  const judgements = ref<Judgement[]>([]);
  const failure = ref<string | null>(null);
  const older = ref(false);
  const newer = ref(false);
  const loading = ref(true);
  const loadingOlder = ref(false);
  const loadingNewer = ref(false);
  // Every read that replaces the feed counts itself, and a read that finished after a later one
  // began has nothing left to replace.
  let generation = 0;

  // A judgement the live stream announced. It stands where the archived row will stand and
  // steps aside the moment that row arrives.
  const live = ref<Judgement[]>([]);

  function merge(page: MessagePage, placement: "older" | "newer" = "newer"): number {
    const before = messages.value.length;

    messages.value = mergedMessages(messages.value, page.messages, placement);

    const added = messages.value.length - before;

    const byJudgement = new Map(judgements.value.map((judgement) => [judgement.id, judgement]));

    for (const judgement of page.judgements) {
      byJudgement.set(judgement.id, judgement);
    }

    judgements.value = [...byJudgement.values()];

    const archived = new Set(judgements.value.map(placeOf));

    live.value = live.value.filter((judgement) => !archived.has(placeOf(judgement)));

    return added;
  }

  async function fetchPage(before: number | null): Promise<MessagePage> {
    return await $fetch<MessagePage>(`/api/rooms/${chatId}/messages`, {
      query: { before: before ?? undefined, limit: PAGING.defaultSize }
    });
  }

  // Everything past a message the room already holds, which stands at that row's place in the
  // room's line rather than at its number.
  async function fetchAfter(after: number, limit: number): Promise<MessagePage> {
    return await $fetch<MessagePage>(`/api/rooms/${chatId}/messages`, { query: { after, limit } });
  }

  // One row by its own number, which is what an edited message is read as.
  async function fetchOne(messageId: number): Promise<MessagePage> {
    return await $fetch<MessagePage>(`/api/rooms/${chatId}/messages`, { query: { at: messageId } });
  }

  // The room's end, asked for. Nothing is put in the feed until it is handed to load.
  function readEnd(): Promise<MessagePage> {
    const read = fetchPage(null);

    // A read nobody hands to load is let go of quietly; one that is handed in still fails there.
    read.catch(() => undefined);

    return read;
  }

  // The room's end, read fresh. A feed standing somewhere back in the room is let go of first, so
  // what arrives is not a page stuck on after a gap.
  async function load(read?: Promise<MessagePage>): Promise<void> {
    const mine = ++generation;

    loading.value = true;
    failure.value = null;

    try {
      const page = await (read ?? fetchPage(null));

      if (mine !== generation) {
        return;
      }

      if (newer.value) {
        messages.value = [];
        judgements.value = [];
        newer.value = false;
      }

      merge(page);
      older.value = page.hasMore;
    } catch (error) {
      failure.value = describe(error);
    } finally {
      loading.value = false;
    }
  }

  // Returns how many messages were added, so the view can hold its scroll position.
  async function loadOlder(): Promise<number> {
    const oldest = messages.value[0];

    if (loadingOlder.value || !older.value || oldest === undefined) {
      return 0;
    }

    const mine = generation;

    loadingOlder.value = true;

    try {
      const page = await fetchPage(oldest.messageId);

      if (mine !== generation) {
        return 0;
      }

      const added = merge(page, "older");

      older.value = page.hasMore;

      return added;
    } catch (error) {
      failure.value = describe(error);

      return 0;
    } finally {
      loadingOlder.value = false;
    }
  }

  // What stands past the newest row held, for a feed standing back in the room that is read down.
  // Once nothing is left past it the feed stands at the room's end again, and news is taken in.
  async function loadNewer(): Promise<number> {
    const newest = messages.value[messages.value.length - 1];

    if (loadingNewer.value || !newer.value || newest === undefined) {
      return 0;
    }

    const mine = generation;

    loadingNewer.value = true;

    try {
      const page = await fetchAfter(newest.messageId, PAGING.defaultSize);

      if (mine !== generation) {
        return 0;
      }

      const added = merge(page);

      newer.value = page.hasMore;

      return added;
    } catch (error) {
      failure.value = describe(error);

      return 0;
    } finally {
      loadingNewer.value = false;
    }
  }

  async function loadAround(messageId: number): Promise<boolean> {
    const mine = ++generation;
    const half = Math.floor(PAGING.defaultSize / 2);

    try {
      const [one, before, after] = await Promise.all([
        fetchOne(messageId),
        $fetch<MessagePage>(`/api/rooms/${chatId}/messages`, { query: { before: messageId, limit: half } }),
        fetchAfter(messageId, half)
      ]);

      if (mine !== generation || one.messages.length === 0) {
        return false;
      }

      messages.value = [];
      judgements.value = [];
      merge(before);
      merge(one);
      merge(after);
      older.value = before.hasMore;
      newer.value = after.hasMore;
      failure.value = null;

      return true;
    } catch (error) {
      failure.value = describe(error);

      return false;
    }
  }

  // The newest page again: it carries both messages that arrived and judgements that were
  // recorded after a message the view already shows. A feed standing back in the room has no end
  // for that page to join, and reads its end when it is read down to it.
  //
  // It joins what is held rather than replacing it, so it counts no generation of its own unless a gap
  // too wide to read across leaves it the end alone; a read that replaced the feed while this one was
  // on its way leaves it nothing to add to (docs/web.md, 「Room screen」).
  async function refresh(): Promise<void> {
    if (newer.value) {
      return;
    }

    const mine = generation;

    try {
      const page = await fetchPage(null);

      if (mine !== generation) {
        return;
      }

      if (messages.value.length > 0 && page.messages.length > 0 && !sharesRow(messages.value, page.messages)) {
        await bridge(page, mine);
      } else {
        merge(page);
      }

      failure.value = null;
    } catch (error) {
      failure.value = describe(error);
    }
  }

  // The room's end read past messages the feed missed. What was missed is read past the newest row
  // held and the end joins on after it; a gap wider than one read may carry gives the feed the end
  // alone, as opening the room at its end does, so no stretch is ever missing between two rows.
  async function bridge(end: MessagePage, mine: number): Promise<void> {
    const newest = messages.value[messages.value.length - 1]!;
    const missed = await fetchAfter(newest.messageId, PAGING.maxSize);

    if (mine !== generation) {
      return;
    }

    if (missed.hasMore) {
      generation += 1;
      messages.value = [];
      judgements.value = [];
      merge(end);
      older.value = end.hasMore;

      return;
    }

    merge(missed);
    merge(end);
  }

  // The bot said a message landed in this room. What that costs is one row rather than the end of
  // the room again: what to ask for is worked out above, and on the ordinary turn it is that one
  // message.
  async function catchUp(messageId: number | null): Promise<void> {
    const read = feedRead(messages.value, messageId, PAGING.defaultSize);

    // A feed standing back in the room takes an edit of a row it holds and nothing past its end,
    // which it reads when it is read down to it.
    if (newer.value && read.kind !== "one") {
      return;
    }

    if (read.kind === "page") {
      await refresh();

      return;
    }

    const mine = generation;

    try {
      const page = read.kind === "one" ? await fetchOne(read.messageId) : await fetchAfter(read.after, read.limit);

      // Read past a row of a feed that has since been replaced, so it belongs to none of it.
      if (mine !== generation) {
        return;
      }

      if (needsPage(read, page.hasMore)) {
        await refresh();

        return;
      }

      merge(page);
      failure.value = null;
    } catch (error) {
      failure.value = describe(error);
    }
  }

  function addLiveJudgement(judgement: Judgement): void {
    if (judgements.value.some((held) => placeOf(held) === placeOf(judgement))) {
      return;
    }

    live.value = [...live.value.filter((held) => held.id !== judgement.id), judgement];
  }

  const allJudgements = computed<Judgement[]>(() => [...judgements.value, ...live.value]);

  return {
    messages,
    judgements: allJudgements,
    older,
    newer,
    loading,
    loadingOlder,
    loadingNewer,
    failure,
    load,
    readEnd,
    loadOlder,
    loadNewer,
    loadAround,
    refresh,
    catchUp,
    addLiveJudgement
  };
}


// Two judgements stand in the same place when they are the same stage's word about the same
// message; that is what tells a live row from the archived row it was standing in for.
function placeOf(judgement: Judgement): string {
  return `${judgement.messageId ?? "none"}:${judgement.stage}`;
}

export interface DayGroup {
  key: string;
  label: string;
  items: FeedItem[];
}

// The right is the owner's own side and nobody else's: the console is read by them, so what they
// themselves said stands where their own hand put it and every other voice in the room — the chat agent, another
// person, a notice — stands on the left, whether the room is their own chat or a group. What the
// row wears is a separate question from the side it stands on: an agent's answer — the chat agent's or a
// companion's, as the server says of each message — is markdown, the look the row standing for its
// turn already wore, and everything a person wrote is the characters it is. Each stands in a
// bubble, unless it is only what it carried.
//
// Where the console knows no sender as the signed-in person's there is nobody to put on the right,
// and the whole room reads down the left rather than guessing at a side.
function lookOf(message: ArchivedMessage, avatars: AvatarIndex, mine: readonly number[], bare: boolean): MessageLook {
  const agent = message.agent === true;

  return {
    role: agent ? "assistant" : "user",
    side: sideOf(message.senderId, mine),
    variant: bare ? "naked" : "soft",
    avatar: faceOf(message, avatars),
    markdown: agent
  };
}

// The name a message's row stands under: the agent's own where its answer went out in the owner's account, which
// the archive files under the owner's name, or where an agent's words stand under no number of their own — the record
// road's — whatever name the send was filed with; and the name it was filed with otherwise.
function shownSender(message: Pick<ArchivedMessage, "senderName" | "senderId" | "voicedBy" | "speaker">): string {
  if (message.voicedBy !== undefined) return agentRowName(message.voicedBy);

  return message.speaker !== undefined && message.senderId === null ? agentRowName(message.speaker) : message.senderName;
}

// The picture a message's row wears: an agent's words its own face in every room, an answer that went out in the
// owner's account among them, and a person's words their own picture (docs/web.md, 「An agent's words wear the agent's
// face in every room」).
function faceOf(message: Pick<ArchivedMessage, "senderId" | "senderName" | "voicedBy" | "speaker">, avatars: AvatarIndex): AvatarProps {
  const agent = message.voicedBy ?? message.speaker;

  return agent === undefined ? avatarFor(avatars, "person", message.senderId, message.senderName) : agentAvatar(avatars, agent);
}

// A chat agent's face by its registration name, where the index holds one under it, and otherwise its label's letter
// as everyone's (docs/web.md, 「Profile photos」): the one lookup an agent's finished rows and its running turn's row
// both wear.
export function agentAvatar(avatars: AvatarIndex, name: string): AvatarProps {
  const picture = avatars.get(agentKey(name));
  const label = agentRowName(name);

  return picture === undefined ? avatarFor(avatars, "person", null, label) : { src: picture, alt: label };
}

// Whether a message stands what it carried with no bubble round it: a sticker sent alone, which is a
// picture drawn to stand on the conversation's own ground. A picture, an album and a file stand in a
// bubble, running to its edges, and a message that carried nothing at all keeps its bubble, which
// holds the mark saying it is empty.
export function bareMedia(shownText: string, kinds: readonly string[]): boolean {
  return shownText === "" && kinds.length > 0 && kinds.every((kind) => kind === "sticker");
}

// Which side one message stands on, which is the one rule the feed has: the signed-in person's own — a sender linked to
// them, or the owner's for the administrator (docs/web.md, 「Which messages stand on the right」) — or the left.
export function sideOf(senderId: number | null, mine: readonly number[]): MessageSide {
  return senderId !== null && mine.includes(senderId) ? "right" : "left";
}

// The messages the owner has just sent, as the feed shows them while they go: their own name, their own
// side, the words they typed and the pictures they attached, and the mark that says they are on their
// way. The pictures of one press go as one album, so they stand as one row — the album's mosaic with
// the words under it — exactly as the archived album that takes the row's place will; a picture whose
// send failed stands alone, since resend sends it on its own.
export function pendingItems(outbox: readonly OutboxItem[], speaker: Speaker, avatars: AvatarIndex): FeedItem[] {
  const rows: FeedItem[] = [];
  const albums = new Map<string, FeedItem>();

  for (const held of outbox) {
    const preview = held.state === "failed" ? null : (held.file?.previewUrl ?? null);
    const gathered = preview === null ? undefined : albums.get(held.sendKey);

    if (preview !== null && gathered?.pending != null) {
      gathered.album = [...(gathered.album ?? []), { messageId: null, src: preview }];
      gathered.pending = {
        state: gathered.pending.state === "sending" ? held.state : gathered.pending.state,
        reason: null,
        sent: gathered.pending.sent && held.messageId !== null
      };
      continue;
    }

    const item = pendingItem(held, speaker, avatars);

    if (preview !== null) {
      item.album = [{ messageId: null, src: preview }];
      albums.set(held.sendKey, item);
    }

    rows.push(item);
  }

  return rows;
}

function pendingItem(held: OutboxItem, speaker: Speaker, avatars: AvatarIndex): FeedItem {
  return {
    key: held.key,
    messageId: 0,
    senderId: speaker.id,
    senderName: speaker.name,
    sentAt: held.startedAt,
    text: held.text,
    shownText: held.text,
    quote: held.reply,
    imageUrl: held.file?.previewUrl ?? null,
    fileName: held.file !== null && held.file.previewUrl === null ? held.file.file.name : null,
    // Nothing the owner says is an answer, so no row of theirs is measured.
    answerSeconds: null,
    look: {
      role: "user",
      side: "right",
      variant: "soft",
      avatar: avatarFor(avatars, "person", speaker.id, speaker.name),
      markdown: false
    },
    parts: [{ type: "text", text: held.text }],
    judgements: [],
    spend: null,
    actions: null,
    drafts: null,
    briefing: null,
    pending: { state: held.state, reason: held.reason, sent: held.messageId !== null },
    run: null,
    skipped: 0,
    notice: false
  };
}

// Who the console speaks as: the owner, under the name the record spells their messages with.
export interface Speaker {
  id: number | null;
  name: string;
}

// Who the answering agent is in this room. Its number is not written anywhere the console can ask for it, so it
// is taken from what an agent has already said here in its own voice — which is exactly the message the row
// waiting for an answer is about to become, so the two wear one picture. In a room no agent has spoken in there is
// nothing to take, and the chat agent's own name stands instead.
export function botSpeaker(messages: readonly ArchivedMessage[]): Speaker {
  const said = lastAnswer(messages);

  return { id: said?.senderId ?? null, name: said === undefined ? chatAgent().label : shownSender(said) };
}

function lastAnswer(messages: readonly ArchivedMessage[]): ArchivedMessage | undefined {
  return [...messages].reverse().find((message) => message.agent === true && message.notice !== true);
}

// What the row that stands while the chat agent works wears: the picture the answer it is waiting for will
// wear, on the side that answer will stand on.
export function botAvatar(messages: readonly ArchivedMessage[], avatars: AvatarIndex): AvatarProps {
  const said = lastAnswer(messages);

  return said === undefined ? agentAvatar(avatars, defaultAnswererName()) : faceOf(said, avatars);
}

// The row a room stands while its own turn runs. It is a feed row like any other and is drawn by
// the one component the messages are drawn by: what it holds is the turn rather than words, and
// everything around what it holds — the side, the picture, the header, the chip line — is the
// row's own. So the answer that ends the turn takes this row's place without a coordinate of it
// moving, which is the whole reason the turn is handed over as a row at all.
export function runItem(run: RunState, speaker: Speaker, avatar: AvatarProps): FeedItem {
  return {
    // One running row to a speaker: the chat agent's and a companion's can stand in the same room at once. The chat
    // agent's row is one key whether it holds a turn or only listens, so a turn beginning changes the row in place.
    key: `turn:${companionOf(run.speaker) === undefined ? "bmo" : runKey(run.speaker)}`,
    messageId: 0,
    senderId: speaker.id,
    senderName: speaker.name,
    sentAt: run.startedAt,
    text: "",
    shownText: "",
    quote: null,
    imageUrl: null,
    fileName: null,
    answerSeconds: null,
    look: { role: "assistant", side: "left", variant: "soft", avatar, markdown: true },
    parts: [],
    judgements: [],
    spend: null,
    actions: null,
    drafts: null,
    briefing: null,
    pending: null,
    run,
    skipped: 0,
    notice: false
  };
}

// A running row that has handed its place to its turn's answer: which answer took it, and what the
// turn last said of itself at that moment.
export interface HandOver {
  answer: number;
  said: string;
}

// What a running row's state line says, as one value: the row stands again only once this moves.
// The counts a turn keeps filling while it writes are left out, since they move on their own.
function turnSaid(run: RunState): string {
  return JSON.stringify([run.received, run.progress?.phase ?? null, run.progress?.tool ?? null]);
}

// The answer a turn's row gives its place to: the newest agent message of the row's own speaker since the turn
// began, or undefined while none is in the feed.
export function turnAnswer(run: RunState, senderId: number | null, messages: readonly ArchivedMessage[]): ArchivedMessage | undefined {
  return senderId === null ? undefined : messages.findLast((message) => message.agent === true && message.senderId === senderId && message.sentAt >= run.startedAt);
}

// Which running rows have handed their place over. A turn's answer reaches the feed by whichever
// read brings it first — the news of the message, or the read the turn's ending makes — and the row
// standing for the turn gives it its place in that same render, so the two never stand together
// (docs/web.md, the room screen's section on what is being done now). The answer is the newest agent message of the row's own speaker
// since the turn began; a newer one hands over afresh.
export function handOvers(rows: readonly FeedItem[], messages: readonly ArchivedMessage[], held: ReadonlyMap<string, HandOver>): Map<string, HandOver> {
  const next = new Map<string, HandOver>();

  for (const row of rows) {
    const run = row.run;

    // A row standing while the chat agent only listens is waiting on no answer, so nothing takes its place.
    if (run === null || run.listening !== undefined || row.senderId === null) {
      continue;
    }

    const answer = turnAnswer(run, row.senderId, messages);

    if (answer === undefined) {
      continue;
    }

    const before = held.get(row.key);

    next.set(row.key, before?.answer === answer.messageId ? before : { answer: answer.messageId, said: turnSaid(run) });
  }

  return next;
}

// The running rows that still stand: those whose answer has not come, and those whose turn has said
// something new of itself since — an answer in parts, more work after the words — which stand again
// under the answer.
export function standingRuns(rows: readonly FeedItem[], held: ReadonlyMap<string, HandOver>): FeedItem[] {
  return rows.filter((row) => {
    const over = held.get(row.key);

    return over === undefined || row.run === null || over.said !== turnSaid(row.run);
  });
}

// A running row as it stood before a change of the feed: enough to know whose turn it was.
export type StoodTurn = Pick<FeedItem, "key" | "senderId" | "senderName">;

// Which new rows are answers settling into the place of a running row that went in the same change
// (docs/web.md, the room screen's section on what is being done now), keyed by the answer's row and naming the turn's: for each running
// row gone, the first new message of its own speaker. A running row gone with no such message — a
// turn that ended saying nothing — takes no answer with it.
export function settledAnswers(gone: readonly StoodTurn[], fresh: readonly FeedItem[]): Map<string, string> {
  const settled = new Map<string, string>();

  for (const turn of gone) {
    const answer = fresh.find(
      (row) =>
        row.run === null &&
        !settled.has(row.key) &&
        (turn.senderId !== null || row.senderId !== null ? turn.senderId === row.senderId : turn.senderName === row.senderName)
    );

    if (answer !== undefined) {
      settled.set(answer.key, turn.key);
    }
  }

  return settled;
}

// The running rows as the feed stands them, kept in step with the feed as each read lands.
export function useHandOver(rows: Readonly<Ref<FeedItem[]>>, messages: Readonly<Ref<ArchivedMessage[]>>): ComputedRef<FeedItem[]> {
  const held = shallowRef<ReadonlyMap<string, HandOver>>(new Map());

  watch([rows, messages], ([standing, said]) => {
    held.value = handOvers(standing, said, held.value);
  }, { immediate: true, flush: "sync" });

  return computed(() => standingRuns(rows.value, held.value));
}

// The feed as the view walks it: one entry per day, each carrying its messages already
// paired with the judgements made about them. What is still on its way stands after them, in
// the day it was sent.
export function buildDays(
  t: Translate,
  messages: ArchivedMessage[],
  judgements: Map<number, Judgement[]>,
  imageUrlFor: (chatId: number, messageId: number) => string,
  avatars: AvatarIndex,
  pending: readonly FeedItem[] = [],
  mine: readonly number[] = []
): DayGroup[] {
  return groupDays(t, [...archivedRows(messages, judgements, imageUrlFor, avatars, mine), ...pending]);
}

// The archive's messages as the feed's rows, each paired with the judgements made about them. They
// are built apart from the messages still on their way, so a view keeping them between changes of
// its own sending hands every row already standing the same row again, and draws none of them anew
// (docs/web.md, 「What arrives comes in at the end」). A group room stands no line for a turn the chat agent passed
// over, so its rows count none (docs/web.md, 「A turn the chat agent chose not to answer」).
export function archivedRows(
  messages: ArchivedMessage[],
  judgements: Map<number, Judgement[]>,
  imageUrlFor: (chatId: number, messageId: number) => string,
  avatars: AvatarIndex,
  mine: readonly number[] = [],
  skipLines = true
): FeedItem[] {
  const items: FeedItem[] = [];
  // The row each album of the page stands as, by the album's number. The pictures of one send are
  // named as one album by whoever sent them, so they are gathered by that name and never by how
  // close together they came.
  const albums = new Map<number, FeedItem>();

  for (const message of messages) {
    // A voice briefing of a line in the room stands on that line's chip line, never as a row: the
    // line carries it whether or not the voice message is among the rows read so far. A summary
    // still awaiting its line stands nowhere until its round ends.
    if (message.briefs != null || message.awaitsLine === true) {
      continue;
    }

    const album = message.album ?? null;
    const gathered = album === null ? undefined : albums.get(album);

    if (gathered !== undefined && message.imagePath !== null) {
      gathered.album = [...(gathered.album ?? []), { messageId: message.messageId, src: imageUrlFor(message.chatId, message.messageId) }];
      // A turn reads the whole send and is pinned to its last picture, which stands in this row.
      gathered.skipped += skipLines ? skippedTurns(judgements.get(message.messageId) ?? []) : 0;
      continue;
    }

    const item = feedItemOf(message, judgements, imageUrlFor, avatars, mine);

    if (!skipLines) {
      item.skipped = 0;
    }

    if (album !== null && item.imageUrl !== null) {
      item.album = [{ messageId: item.messageId, src: item.imageUrl }];
      albums.set(album, item);
    }

    items.push(item);
  }

  return items;
}

// The archive's rows, each a message the owner sent wearing the key its line stood under while it went.
export function withLives(rows: readonly FeedItem[], lives: ReadonlyMap<number, string>): FeedItem[] {
  return rows.map((row) => {
    const life = lives.get(row.messageId);

    return life === undefined || row.pending != null ? row : { ...row, life };
  });
}

// The rows built again, each one that says what the row of its key already standing says handed back
// as that very row. A read of the archive brings every message it covers as a new object, changed or
// not, and only a row that changed is drawn again (docs/web.md, 「What arrives comes in at the end」).
export function keptRows(standing: readonly FeedItem[] | undefined, built: FeedItem[]): FeedItem[] {
  if (standing === undefined) {
    return built;
  }

  const byKey = new Map(standing.map((row) => [row.key, row]));

  return built.map((row) => {
    const was = byKey.get(row.key);

    return was !== undefined && sameData(was, row) ? was : row;
  });
}

// Whether two values read off the wire say the same: plain data, compared all the way down.
function sameData(one: unknown, other: unknown): boolean {
  if (Object.is(one, other)) {
    return true;
  }

  if (typeof one !== "object" || typeof other !== "object" || one === null || other === null || Array.isArray(one) !== Array.isArray(other)) {
    return false;
  }

  const keys = Object.keys(one);

  return (
    keys.length === Object.keys(other).length &&
    keys.every((key) => Object.hasOwn(other, key) && sameData((one as Record<string, unknown>)[key], (other as Record<string, unknown>)[key]))
  );
}

// The day each row was said on, read once for each row: a row kept between changes keeps its day,
// so grouping the feed again reads the clock of the new rows alone.
const rowDays = new WeakMap<FeedItem, string>();

function dayOf(item: FeedItem): string {
  let key = rowDays.get(item);

  if (key === undefined) {
    key = dayKey(item.sentAt);
    rowDays.set(item, key);
  }

  return key;
}

// The rows as the view walks them: one entry per day, in the order the rows stand.
export function groupDays(t: Translate, items: readonly FeedItem[]): DayGroup[] {
  const days: DayGroup[] = [];

  for (const item of items) {
    const key = dayOf(item);
    const last = days[days.length - 1];

    if (last !== undefined && last.key === key) {
      last.items.push(item);
      continue;
    }

    days.push({ key, label: formatDay(t, item.sentAt), items: [item] });
  }

  return days;
}

// The days with rows standing at their foot whatever day they began on: the turns still running and the
// lines on their way (docs/web.md, the running row and 「The line's day」). Such a row stands in its own
// day, or the last day where that is later, so a running row's answer opening a new day settles under a
// date mark already standing over it, and a line put up on an earlier day opens no date mark under the
// later ones.
export function atFoot(t: Translate, days: readonly DayGroup[], footed: readonly FeedItem[]): DayGroup[] {
  const joined = [...days];

  for (const row of footed) {
    const last = joined[joined.length - 1];
    const key = dayOf(row);

    if (last !== undefined && key <= last.key) {
      joined[joined.length - 1] = { ...last, items: [...last.items, row] };
      continue;
    }

    joined.push({ key, label: formatDay(t, row.sentAt), items: [row] });
  }

  return joined;
}

// One archived message as the row the feed draws.
function feedItemOf(
  message: ArchivedMessage,
  judgements: Map<number, Judgement[]>,
  imageUrlFor: (chatId: number, messageId: number) => string,
  avatars: AvatarIndex,
  mine: readonly number[]
): FeedItem {
  const attachments = message.attachments ?? [];
  const pictured = message.imagePath !== null;
  const shown = withoutMediaMark(message.text, { attachments, pictured }, message.expressions ?? []);
  const bare = bareMedia(shown.text, pictured ? ["picture"] : attachments.map((attachment) => attachment.kind));

  return {
    key: `m${message.messageId}`,
    messageId: message.messageId,
    senderId: message.senderId,
    senderName: shownSender(message),
    sentAt: message.sentAt,
    text: message.text,
    shownText: shown.text,
    quote: message.replyQuote ?? null,
    imageUrl: message.imagePath === null ? null : imageUrlFor(message.chatId, message.messageId),
    attachments: message.attachments,
    expressions: shown.expressions,
    fileName: null,
    answerSeconds: message.answerSeconds ?? null,
    look: lookOf(message, avatars, mine, bare),
    parts: [{ type: "text", text: message.text }],
    judgements: judgements.get(message.messageId) ?? [],
    spend: message.spend ?? null,
    actions: message.actions ?? null,
    drafts: message.drafts ?? null,
    briefing: message.briefing ?? null,
    pending: null,
    run: null,
    skipped: skippedTurns(judgements.get(message.messageId) ?? []),
    notice: message.notice === true,
    ...(message.voicedBy === undefined ? {} : { voice: message.senderName })
  };
}
