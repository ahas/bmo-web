import { wording } from "#shared/wording";

import { publishConsoleEvent } from "./console-events";
import { useWebSql } from "./db";
import { fail } from "./fail";
import { receiver, receiverCall } from "./receiver";

import type { DocumentTalkTurn, TalkSpeaker } from "#shared/types";

// The talk about each document (docs/documents-viewer.md, 「The record」): the console's own `document_talk`
// table, tied to the document's name. The receiver's talk takes the earlier turns from its caller, so the
// thread is kept here: the owner's words as soon as they are sent, with the passage, heading and version
// selected then, and the chat agent's answer when the talk answers. A second is the time a turn keeps.

/** Where the owner stood in a document as they said their words. */
export interface SaidOver {
  passage: string | null;
  heading: string | null;
  version: string | null;
  translated: boolean;
}

// A row as the database answers it, its whole numbers as the text of the number.
interface TalkRow extends Omit<DocumentTalkTurn, "id" | "speaker" | "saidAt" | "translated"> {
  id: number | string;
  speaker: string;
  saidAt: number | string;
  translated: number | string;
}

/** The talk one document carries, oldest first. */
export async function readDocumentTalk(document: string): Promise<DocumentTalkTurn[]> {
  const rows = await useWebSql().all(`SELECT id, speaker, text, said_at AS "saidAt", passage, heading, version, translated
       FROM document_talk WHERE document = $1 ORDER BY id`, document) as TalkRow[];

  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    speaker: row.speaker as TalkSpeaker,
    saidAt: Number(row.saidAt),
    translated: Number(row.translated) === 1
  }));
}

async function say(document: string, speaker: TalkSpeaker, text: string, saidAt: number, over: SaidOver | null): Promise<number> {
  const row = await useWebSql().get(`INSERT INTO document_talk (document, speaker, text, said_at, passage, heading, version, translated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, document, speaker, text, Math.floor(saidAt / 1000),
  over?.passage ?? null, over?.heading ?? null, over?.version ?? null, over?.translated === true ? 1 : 0) as { id: number | string };

  return Number(row.id);
}

/** The owner's words written as they are sent, with where they stood in the document; the turn's id answers. */
export async function writeOwnerWords(document: string, text: string, over: SaidOver, now: number = Date.now()): Promise<number> {
  return await say(document, "owner", text, now, over);
}

/** The chat agent's answer written as the talk answers it; the turn's id answers. */
export async function writeAgentAnswer(document: string, text: string, now: number = Date.now()): Promise<number> {
  return await say(document, "bmo", text, now, null);
}

// A turn of the talk is the receiver's (its `docs/boundary-api.md`, `POST /talks`): a round of the owner's private
// chat on the chat agent's session, behind whatever round is running there, so the owner's words are answered at
// once and the agent's answer is written when the talk comes back. One turn of a document's talk is answered at a
// time; where each talk stands is this process's to hold, and every tab hears that it moved.

// A turn waits its place behind the rounds already running, then a model's turn, and the call waits for all of it.

/** The document a turn is about, as the receiver's topic names it. */
export interface TalkedDocument {
  document: string;
  label: string;
  writer: string;
  // The file the agent opens with its tools.
  file: string;
  version: string;
}

/** Where a document's talk stands: whether a turn is being answered, and why the last came back with nothing. */
export interface TalkState {
  answering: boolean;
  failure: string | null;
}

const answering = new Set<string>();
const failures = new Map<string, string>();

// Why a turn came back with nothing, by the receiver's code for it.
const UNANSWERED: Readonly<Record<string, string>> = {
  resting: "documents.message.unanswered_resting",
  limit: "documents.message.unanswered_limit",
  outage: "documents.message.unanswered_outage"
};

function unansweredWords(error: unknown): string {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;

  return wording(typeof code === "string" ? (UNANSWERED[code] ?? "documents.message.unanswered_other") : "documents.message.unanswered_other");
}

/** Where one document's talk stands. */
export function talkState(document: string): TalkState {
  return { answering: answering.has(document), failure: failures.get(document) ?? null };
}

async function answer(about: TalkedDocument, over: SaidOver, earlier: DocumentTalkTurn[], said: string): Promise<void> {
  const topic = {
    kind: "document",
    document: about.document,
    label: about.label,
    writer: about.writer,
    file: about.file,
    version: about.version,
    ...(over.heading === null ? {} : { heading: over.heading }),
    ...(over.passage === null ? {} : { passage: over.passage }),
    translated: over.translated
  };
  const turns = earlier.map((turn) => ({ owner: turn.speaker === "owner", text: turn.text }));

  try {
    const answered = await receiverCall(
      receiver().POST("/talks", { body: { topic, turns, said } })
    );
    const words = answered.answer?.trim() ?? "";

    if (words === "") {
      failures.set(about.document, wording("documents.message.unanswered_silent"));
    } else {
      await writeAgentAnswer(about.document, words);
    }
  } catch (error) {
    failures.set(about.document, unansweredWords(error));
  } finally {
    answering.delete(about.document);
    publishConsoleEvent("document-talk", { document: about.document });
  }
}

/**
 * The owner's words about a document: written down at once, and the turn handed to the receiver, whose answer is
 * written when it comes. Words said while the last are still being answered are refused.
 */
export async function sayAboutDocument(about: TalkedDocument, said: string, over: SaidOver): Promise<void> {
  if (answering.has(about.document)) {
    throw fail(409, wording("documents.error.talk_busy"));
  }

  answering.add(about.document);
  failures.delete(about.document);

  let earlier: DocumentTalkTurn[];

  try {
    earlier = await readDocumentTalk(about.document);
    await writeOwnerWords(about.document, said, over);
  } catch (error) {
    answering.delete(about.document);
    throw error;
  }

  publishConsoleEvent("document-talk", { document: about.document });
  void answer(about, over, earlier, said);
}
