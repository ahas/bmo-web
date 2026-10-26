import { formatStamp, formatTime } from "bmo-ui/app/domain/time";

import { stageLabel } from "./judgements";

import type { Judgement } from "#shared/types";
import type { Translate } from "#shared/wording";

// What the room screen copies of its messages: the record of several with every judgement left on them, the bare
// words of one, or the line that points at one.

// One message as the owner hands it on: when it was said, who said it, what it says, and every judgement the run
// left on it — all of them, whatever the screen is showing at the time.
export interface CopyItem {
  senderName: string;
  senderId: number | null;
  messageId: number;
  sentAt: number;
  text: string;
  judgements: Judgement[];
}

// Anything that carries words: the copy of a message, or the row standing for it.
export interface Said {
  text: string;
}

// What stands in for a sender whose id was never learned.
const MISSING = "-";

const DETAIL_INDENT = "      ";

export function reportOf(t: Translate, title: string, chatId: number, items: CopyItem[]): string {
  return [`# ${title} (${chatId})`, ...items.map((item) => blockOf(t, item))].join("\n\n");
}

function blockOf(t: Translate, item: CopyItem): string {
  const head = `[${formatStamp(item.sentAt)}] ${item.senderName}(${item.senderId ?? MISSING}) #${item.messageId}: ${item.text}`;
  const sorted = [...item.judgements].sort((left, right) => left.createdAt - right.createdAt || left.id - right.id);

  return [head, ...sorted.flatMap((judgement) => linesOf(t, judgement))].join("\n");
}

// The verdicts that are the answer a message drew: what they carry is the answering message's own words.
const ANSWER_MARKERS = new Set(["REPLY", "SENT"]);

// The detail is the whole of what the stage said; when the verdict already is that whole, repeating it under
// itself says nothing. A verdict that is the message's answer stands as its word alone, since the answer's words
// are another message's (docs/web.md, 「What a copy holds」).
function linesOf(t: Translate, judgement: Judgement): string[] {
  const marker = /^([A-Z][A-Z-]*)(?::|$)/.exec(judgement.verdict.trim())?.[1] ?? null;
  const label = `  - ${stageLabel(t, judgement.stage)} (${formatTime(judgement.createdAt)})`;

  if (marker !== null && ANSWER_MARKERS.has(marker)) {
    return [`${label}: ${marker}`];
  }

  const head = `${label}: ${judgement.verdict}`;
  const detail = judgement.detail?.trim() ?? "";

  if (detail === "" || detail === judgement.verdict.trim()) {
    return [head];
  }

  return [head, ...detail.split("\n").map((line) => `${DETAIL_INDENT}${line}`)];
}

// The bare words of one message, with nothing the screen stands around them: no room, no name, no time, no
// judgement. What is taken when the words themselves are wanted somewhere else, rather than the record of the
// message.
export function bodyOf(item: Said): string {
  return item.text;
}

// Which room and which message a row is, and nothing of what it says: the line the owner hands an agent to point
// at one message. The two numbers are what find it; the name is for whoever reads the line.
export function messageRef(t: Translate, room: string, chatId: number, messageId: number): string {
  return t("room.message.message_ref", { room, chatId, messageId });
}

// A message kept with no words has nothing to take.
export function hasBody(item: Said): boolean {
  return item.text.trim() !== "";
}
