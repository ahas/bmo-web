import { SKIPPED_STAGE } from "#shared/types";

import { gateReadings, judgementsOf, judgementsWithin, READINGS_PER_CALL } from "./gate";

import type { JudgementSpan } from "./gate";
import type { Judgement, LatestSkipReason, SkipReason } from "#shared/types";

// Why a supervisor's silent turn sent nothing, in the reader's language (docs/web.md, 「A turn the chat agent chose not
// to answer」). The receiver writes the reason the turn's skip named, one English line, as the words of its `skipped`
// verdict, and the gate holds the verdict. Each reason is handed to the gate's translator and every whole translation
// is kept here by its text and language, so a reason is translated once while the server runs; a translation that
// fails or comes back not whole stands as the English line, and is asked for again on the next read.

// The receiver's words for a skip that named no reason (the receiver's `docs/instruction.md`, 「What it is」).
export const NO_REASON_GIVEN = "none given";

// The role the translator is asked for: the reasons are a verdict's words, which the administrator alone reads.
const READER_ROLE = "administrator";

// How many translations are kept at once; the one kept first goes first.
const MOST_KEPT = 1_000;

const kept = new Map<string, string>();

function keyOf(language: string, reason: string): string {
  return `${language}\u0000${reason}`;
}

function keep(key: string, text: string): void {
  if (kept.size >= MOST_KEPT) kept.delete(kept.keys().next().value!);

  kept.set(key, text);
}

/** Each reason as the reader reads it in `language`, by the reason as the receiver wrote it. */
export async function readReasons(reasons: readonly string[], language: string): Promise<Map<string, SkipReason>> {
  const read = new Map<string, SkipReason>();
  const asking: string[] = [];

  for (const reason of new Set(reasons)) {
    const held = kept.get(keyOf(language, reason));

    if (reason === NO_REASON_GIVEN) read.set(reason, { kind: "unnamed" });
    else if (held !== undefined) read.set(reason, { kind: "named", text: held });
    else asking.push(reason);
  }

  for (let at = 0; at < asking.length; at += READINGS_PER_CALL) {
    const part = asking.slice(at, at + READINGS_PER_CALL);
    const readings = await gateReadings(language, part, READER_ROLE).catch(() => []);

    part.forEach((reason, place) => {
      const reading = readings[place];

      if (reading?.whole === true) keep(keyOf(language, reason), reading.text);

      read.set(reason, { kind: "named", text: reading?.whole === true ? reading.text : reason });
    });
  }

  return read;
}

// The reason a silent turn's verdict carries, or null where it carries none.
function reasonOf(judgement: Judgement): string | null {
  const reason = judgement.detail?.trim() ?? "";

  return reason === "" ? null : reason;
}

/** The reasons of a room's silent turns `ids` names, written within `span`, by their verdicts' numbers; a verdict
 * carrying no reason, or one the gate does not hold within the span, is left out. */
export async function skipReasonsOf(chatId: number, ids: readonly number[], span: JudgementSpan, language: string): Promise<Record<string, SkipReason>> {
  const asked = new Set(ids);
  const reasoned = (await judgementsWithin(chatId, span, SKIPPED_STAGE)).flatMap((judgement) => {
    const reason = reasonOf(judgement);

    return asked.has(judgement.id) && reason !== null ? [{ id: judgement.id, reason }] : [];
  });
  const read = await readReasons(reasoned.map((one) => one.reason), language);

  return Object.fromEntries(reasoned.map((one) => [String(one.id), read.get(one.reason)!]));
}

/** The reason of a room's newest silent turn, or none where the room has none or that turn carries none. */
export async function latestSkipReason(chatId: number, language: string): Promise<LatestSkipReason> {
  const newest = (await judgementsOf(chatId, null, 1, undefined, SKIPPED_STAGE)).judgements[0];
  const reason = newest === undefined ? null : reasonOf(newest);

  if (newest === undefined || reason === null) return { latest: null };

  return { latest: { id: newest.id, reason: (await readReasons([reason], language)).get(reason)! } };
}
