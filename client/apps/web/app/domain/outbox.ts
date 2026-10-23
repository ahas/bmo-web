import { TELEGRAM_CAPTION_LENGTH, TELEGRAM_MESSAGE_LENGTH } from "#shared/config";

import type { ArchivedMessage, ReplyQuote, SendOutcomeRecord, SentMessage } from "#shared/types";
import type { PickedFile } from "./attachments";

// One message handed to the bot and not yet standing in the archive. It goes into the feed the
// moment send is pressed, and what becomes of it is written on it. A send the bot took and did not
// answer in time is checking: it may well have gone, so it waits for the archive or its key, not for
// a resend. A send that met no bot, or no app, is waiting: it goes again by itself once one answers.
export type OutboxState = "sending" | "waiting" | "checking" | "failed";

export interface OutboxItem {
  key: string;
  // The key the send it goes in carries, the same on every try of it, so the app hands it to the bot
  // once (docs/web.md, the room screen's section on a send going once). The messages of one press share it, since they go as one send.
  sendKey: string;
  // The words, or — for a file — the caption that goes with it.
  text: string;
  file: PickedFile | null;
  // When it was put up, in seconds, which is where it stands in the feed.
  startedAt: number;
  state: OutboxState;
  // Why it did not go, in the words the console says it in.
  reason: string | null;
  // What the bot numbered it, once the send has answered.
  messageId: number | null;
  // When the send's answer ran late, in seconds, while it is checking.
  checkingSince: number | null;
  // When this screen first found no bot to take it, in seconds, while it is waiting. A line kept by an
  // older screen may lack it, which reads as null.
  waitingSince?: number | null;
  // The message it answers, when it is a reply. It stays on the row, so sending it again is the
  // same reply.
  reply: ReplyQuote | null;
}

// A key no other row or send of any browser will draw. It is drawn from the browser's random source
// rather than its UUID maker, which a page served over plain HTTP does not have.
export function freshKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// What one press of send puts up: the words as one message, or one message a file, the first
// of them carrying the words as its caption — which is exactly what the send itself does. A reply
// is the first message's, the one the words go with.
export function outboxOf(text: string, files: readonly PickedFile[], now: number, reply: ReplyQuote | null = null): OutboxItem[] {
  const sendKey = freshKey();

  if (files.length === 0) {
    return text === "" ? [] : [item(text, null, now, reply, sendKey)];
  }

  return files.map((file, at) => item(at === 0 ? text : "", file, now, at === 0 ? reply : null, sendKey));
}

function item(text: string, file: PickedFile | null, now: number, reply: ReplyQuote | null, sendKey: string): OutboxItem {
  return {
    key: `out-${freshKey()}`,
    sendKey,
    text,
    file,
    startedAt: now,
    state: "sending",
    reason: null,
    messageId: null,
    checkingSince: null,
    waitingSince: null,
    reply
  };
}

export function withSent(items: readonly OutboxItem[], key: string, messageId: number): OutboxItem[] {
  return items.map((held) => (held.key === key ? { ...held, messageId, reason: null, state: "sending", waitingSince: null } : held));
}

export function withFailed(items: readonly OutboxItem[], key: string, reason: string): OutboxItem[] {
  return items.map((held) => (held.key === key ? { ...held, state: "failed", reason, waitingSince: null } : held));
}

export function withChecking(items: readonly OutboxItem[], key: string, now: number): OutboxItem[] {
  return items.map((held) =>
    held.key === key ? { ...held, state: "checking", reason: null, checkingSince: now, waitingSince: null } : held
  );
}

// The rows checked by asking their key: words, whose send answers with the one message they went out
// as. A file send answers file by file, and a file answered late is watched in the archive alone.
export function keyChecks(items: readonly OutboxItem[]): OutboxItem[] {
  return items.filter((held) => held.state === "checking" && held.file === null);
}

// What a checked row's key came to, written on the row: the message it went out as makes it sent, so the
// archived message takes its place by number, and a refusal makes it failed with the bot's reason. A
// send still going, or one the app has no record of, leaves it checking.
export function withKeyOutcome(items: readonly OutboxItem[], key: string, outcome: SendOutcomeRecord<SentMessage>): OutboxItem[] {
  const held = items.find((one) => one.key === key);

  if (held === undefined || held.state !== "checking") {
    return [...items];
  }

  if (outcome.state === "answered") {
    return withSent(items, key, outcome.answer.messageId);
  }

  return outcome.state === "failed" ? withFailed(items, key, outcome.reason) : [...items];
}

// How long a send answered late is watched for in the archive, in seconds, before it is called
// failed. The bot keeps what it sent the moment the road answers, so a send that went shows up well
// inside it.
export const OUTBOX_CHECKING_SECONDS = 120;

// The checking rows the archive has not carried for the whole of the watch.
export function overdueChecks(items: readonly OutboxItem[], now: number): string[] {
  return items
    .filter((held) => held.state === "checking" && held.checkingSince !== null && now - held.checkingSince >= OUTBOX_CHECKING_SECONDS)
    .map((held) => held.key);
}

// Sending it again is the same message once more: the failure and the number it never got are
// forgotten, and it stands as it did when it was first put up. It is a send of its own, so it takes a
// key of its own: the key it went under answers with what became of it then.
export function withResending(items: readonly OutboxItem[], key: string): OutboxItem[] {
  return items.map((held) =>
    held.key === key
      ? { ...held, sendKey: freshKey(), state: "sending", reason: null, messageId: null, checkingSince: null, waitingSince: null }
      : held
  );
}

// Rows that found no bot to take them: each keeps when it first did, which bounds how long it waits.
export function withWaiting(items: readonly OutboxItem[], keys: readonly string[], now: number): OutboxItem[] {
  const waiting = new Set(keys);

  return items.map((held) =>
    waiting.has(held.key) ? { ...held, state: "waiting", reason: null, waitingSince: held.waitingSince ?? now } : held
  );
}

// How long a send no bot takes is tried on one screen, in seconds, before it is called failed: a
// deployment restarts the bot within a minute or two, so a send still not taken is not going by itself.
export const OUTBOX_WAITING_SECONDS = 600;

// The waiting rows no bot has taken for the whole of their wait.
export function overdueWaits(items: readonly OutboxItem[], now: number): string[] {
  return items
    .filter((held) => held.state === "waiting" && held.waitingSince != null && now - held.waitingSince >= OUTBOX_WAITING_SECONDS)
    .map((held) => held.key);
}

// Rows put back from the browser's store: their wait starts afresh on this screen, since opening the room
// again is asking for them to be tried again.
export function restored(items: readonly OutboxItem[]): OutboxItem[] {
  return items.map((held) => ({ ...held, waitingSince: null }));
}

// How long the screen waits on a call that sends words, in milliseconds: past the app's own wait on the
// bot, so a call this app answered is always heard, and a call lost on the way is tried again under its
// key, which hands back what became of the first.
export const OUTBOX_SAY_CALL_MS = 60_000;

// Whether a row still has a send ahead of it: nothing has answered for it yet.
function unanswered(held: OutboxItem): boolean {
  return (held.state === "sending" || held.state === "waiting") && held.messageId === null;
}

// The send that goes next: the rows of the first unanswered row's send, in the order they stand. Sends
// go one at a time in the order they were pressed, so the room carries them in that order.
export function nextSend(items: readonly OutboxItem[]): OutboxItem[] {
  const first = items.find(unanswered);

  return first === undefined ? [] : items.filter((held) => held.sendKey === first.sendKey && unanswered(held));
}

// What a send that did not answer with a message comes to. A call this app never answered — a browser
// offline, an app stopped, a proxy answering in its place with a page of its own — or this app's 503
// of a bot that did not take it, or a login to be made again, is waiting: nothing went, and the same
// send goes again. This app's 504 is a send that ran late and is checked for in the archive. Anything
// else this app said is the send refused.
export type SendOutcome = "waiting" | "checking" | "failed";

export function sendOutcome(error: unknown): SendOutcome {
  const failure = error as { statusCode?: unknown; data?: unknown } | null;
  const status = typeof failure?.statusCode === "number" ? failure.statusCode : null;
  // This app answers a refusal with its own error body; a proxy answers with a page.
  const ours = typeof failure?.data === "object" && failure.data !== null && "statusCode" in failure.data;

  if (status === null || status === 401 || (status === 503 && ours) || (status >= 500 && !ours)) {
    return "waiting";
  }

  return status === 504 ? "checking" : "failed";
}

// How long a waiting send rests before it goes again: a second, then twice as long each time, up to
// fifteen seconds — the bot's restart takes a few, and one that stays down is not asked in a flood.
export const SEND_RETRY_MAX_MS = 15_000;

export function sendRetryMs(tries: number): number {
  return Math.min(1000 * 2 ** Math.max(0, tries - 1), SEND_RETRY_MAX_MS);
}

export function without(items: readonly OutboxItem[], keys: readonly string[]): OutboxItem[] {
  const going = new Set(keys);

  return items.filter((held) => !going.has(held.key));
}

// How far before a row was put up an archived message may be dated and still be that row's own.
// The clock is the browser's and the date is Telegram's, and the two need not agree to the
// second.
const MATCH_SLACK_SECONDS = 10;

// Whether one archived message is what a row was standing for. It has to be the owner's own,
// from about when the row went up, and then: words are known by their words, and a file by the
// picture it left, with its caption when it had one.
function matches(held: OutboxItem, message: ArchivedMessage, speakerId: number | null): boolean {
  if (speakerId !== null && message.senderId !== speakerId) {
    return false;
  }

  if (message.sentAt < held.startedAt - MATCH_SLACK_SECONDS) {
    return false;
  }

  if (held.file !== null) {
    // Words too long for a caption went ahead of the file, and the file went bare.
    const caption = held.text.length > TELEGRAM_CAPTION_LENGTH ? "" : held.text;

    return message.imagePath !== null && (caption === "" || message.text === caption);
  }

  if (message.text === "") {
    return false;
  }

  // Words longer than one message went as several, and the first of them stands for the row.
  return held.text.length > TELEGRAM_MESSAGE_LENGTH
    ? held.text.startsWith(message.text)
    : message.text === held.text;
}

// Which put-up messages the archive has caught up with, so the feed never shows one twice. The
// number the send answered with is one way: it is the archived message's own number wherever
// the room numbers a message once for everyone. In the owner's private chat it is not — their
// account and the bot number that conversation each for themselves — so what the archive
// carries is matched instead, and one archived message answers for one row and no more. A row
// that failed is nobody's message and stays where it is, and so is one no send has answered for yet:
// its send may still be waiting its turn, and the same words said a moment before are not it.
//
// The messages of one press go as one send, which the room carries as one album, so a send lands as
// a whole: once the archive carries any one of its rows, every row of it the bot answered for goes
// with it. Which archived picture a captionless row is matched with then decides nothing.
export function landedKeys(
  items: readonly OutboxItem[],
  messages: readonly ArchivedMessage[],
  speakerId: number | null
): string[] {
  return [...caughtUp(items, messages, speakerId, false)];
}

// Which put-up messages the feed stands no longer because the archive already carries them: the ones it has caught up
// with, and words whose send is still out but which the bot has already filed. The bot files the owner's words before
// it carries them on to the room's other providers and only then answers the send, so the archive can carry them while
// the send is still out (docs/web.md, the room screen's section on a message being sent). Such a row is known by its
// words under the owner's name, filed no earlier than a moment before it was pressed and taken by no other row; it
// stays on its way until its send answers, so the order sends go in and what becomes of one are untouched, and only its
// standing in the feed is given up.
export function echoedKeys(
  items: readonly OutboxItem[],
  messages: readonly ArchivedMessage[],
  speakerId: number | null
): Set<string> {
  return caughtUp(items, messages, speakerId, true);
}

function caughtUp(items: readonly OutboxItem[], messages: readonly ArchivedMessage[], speakerId: number | null, echoes: boolean): Set<string> {
  const landed = landings(items, messages, speakerId, echoes);
  const sends = new Set(items.filter((held) => landed.has(held.key)).map((held) => held.sendKey));

  return new Set(
    items
      .filter((held) => landed.has(held.key) || (sends.has(held.sendKey) && held.state !== "failed" && !unanswered(held)))
      .map((held) => held.key)
  );
}

// How long before a send was pressed the archive may date the words the bot filed for it while the send is still
// out. The bot dates them as it takes the send, after the press, so the slack is only the two clocks' difference,
// and the same words said a moment earlier are not taken for them.
const ECHO_SLACK_SECONDS = 3;

// The archived message each row the archive has caught up with landed as, by its key: the rows the send numbered
// first, then the rows found by what the archive carried, then — where echoes are asked for — the words of a send
// still out, each taking only a message no row before it took.
function landings(items: readonly OutboxItem[], messages: readonly ArchivedMessage[], speakerId: number | null, echoes = false): Map<string, number> {
  const numbered = new Set(messages.map((message) => message.messageId));
  const taken = new Set<number>();
  const landed = new Map<string, number>();
  const answered = items.filter((held) => held.state !== "failed" && !unanswered(held));

  for (const held of answered) {
    if (held.messageId !== null && numbered.has(held.messageId)) {
      taken.add(held.messageId);
      landed.set(held.key, held.messageId);
    }
  }

  for (const held of answered) {
    if (landed.has(held.key)) {
      continue;
    }

    const said = messages.find((message) => !taken.has(message.messageId) && matches(held, message, speakerId));

    if (said !== undefined) {
      taken.add(said.messageId);
      landed.set(held.key, said.messageId);
    }
  }

  if (!echoes || speakerId === null) {
    return landed;
  }

  for (const held of items) {
    if (!unanswered(held) || held.file !== null) {
      continue;
    }

    const said = messages.find(
      (message) => !taken.has(message.messageId) && message.sentAt >= held.startedAt - ECHO_SLACK_SECONDS && matches(held, message, speakerId)
    );

    if (said !== undefined) {
      taken.add(said.messageId);
      landed.set(held.key, said.messageId);
    }
  }

  return landed;
}

// A picture on its way that the archive has caught up with: the preview the row was drawing and the
// archived message that takes its place, which draws that preview until its own copy has loaded
// (docs/web.md, 「What arrives comes in at the end」).
export interface LandedPicture {
  messageId: number;
  previewUrl: string;
}

export function landedPictures(items: readonly OutboxItem[], messages: readonly ArchivedMessage[], speakerId: number | null): LandedPicture[] {
  const landed = landings(items, messages, speakerId);

  return items.flatMap((held) => {
    const messageId = landed.get(held.key);
    const previewUrl = held.file?.previewUrl ?? null;

    return messageId === undefined || previewUrl === null ? [] : [{ messageId, previewUrl }];
  });
}

// How long a message that went may stand as still going, in seconds. Nothing hangs on this in
// the ordinary run of things — the archived message arrives in a second or two and takes the
// row's place — but no row is left standing for ever because its message never came.
export const OUTBOX_GRACE_SECONDS = 30;

// Whether the archive keeps a message of its own for this one. Words and pictures are archived
// as messages; a file of any other kind reaches the room, and the room's record of it is the
// file itself, so no row will ever come back for it.
export function expectsArchive(item: OutboxItem): boolean {
  return item.file === null || item.file.file.type.startsWith("image/");
}

// Which put-up messages the feed is done with: the ones the archive has caught up with, the
// ones that went but leave the archive no message to catch up with, and — as a last resort —
// the ones that went so long ago that waiting for a row is waiting for nothing.
export function settledKeys(
  items: readonly OutboxItem[],
  messages: readonly ArchivedMessage[],
  speakerId: number | null,
  now: number
): string[] {
  const settled = new Set(landedKeys(items, messages, speakerId));

  for (const held of items) {
    if (held.state !== "sending" || held.messageId === null) {
      continue;
    }

    if (!expectsArchive(held) || now - held.startedAt >= OUTBOX_GRACE_SECONDS) {
      settled.add(held.key);
    }
  }

  return [...settled];
}

// When, in seconds, the first row still standing for a message that went has stood out its grace,
// or null where none is waiting on one. The feed is settled again then, archive read or not, so a
// row never outstays its grace for want of something new arriving.
export function graceEndsAt(items: readonly OutboxItem[]): number | null {
  const ends = items
    .filter((held) => held.state === "sending" && held.messageId !== null)
    .map((held) => held.startedAt + OUTBOX_GRACE_SECONDS);

  return ends.length === 0 ? null : Math.min(...ends);
}

// The previews a browser was holding for the rows that are going.
export function previewsOf(items: readonly OutboxItem[], keys: readonly string[]): string[] {
  const going = new Set(keys);

  return items
    .filter((held) => going.has(held.key) && held.file?.previewUrl != null)
    .map((held) => held.file?.previewUrl ?? "");
}
