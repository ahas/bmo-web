import { wording } from "#shared/wording";

import { unitAt, unitBytes, unitFetch } from "./units";

import type { VoiceBriefing } from "#shared/types";

// The voice engine's briefings as the console reads them (the voice engine's `docs/boundary-api.md`, 「Briefings」;
// docs/web.md, the voice briefing chip and the player): a line's summary and its full reading, one briefing waited on,
// and its sound. The engine's address and token stand in the console's environment as `VOICE_ADDRESS` and
// `VOICE_TOKEN`; a console that names none reads no briefing and plays nothing.

const UNIT = "VOICE";

// How many of a room's briefings one read takes, the newest first, which reaches every line a page shows.
const ROOM_BRIEFINGS = 200;

interface EngineBriefing {
  id: number | string;
  chatId: number;
  messageId: number | null;
  kind: string;
  title: string | null;
  state: string;
  durationMs: number | null;
  plays: boolean;
  voiceMessageId: number | null;
  synthesisId: number | string | null;
  startedAt: number;
  finishedAt: number | null;
}

/** Whether the console names a voice engine. */
export function voiceNamed(): boolean {
  return unitAt(UNIT) !== null;
}

/** One briefing in the screens' words. */
export function voiceBriefingOf(row: EngineBriefing): VoiceBriefing {
  return {
    id: Number(row.id),
    chatId: Number(row.chatId),
    messageId: row.messageId === null ? null : Number(row.messageId),
    kind: row.kind === "full" ? "full" : "summary",
    title: row.title ?? null,
    state: row.state === "done" ? "done" : row.state === "failed" ? "failed" : "waiting",
    durationMs: row.durationMs ?? null,
    plays: row.plays !== false,
    voiceMessageId: row.voiceMessageId === null || row.voiceMessageId === undefined ? null : Number(row.voiceMessageId),
    spoken: row.synthesisId !== null && row.synthesisId !== undefined,
    finishedAt: row.finishedAt ?? null
  };
}

/** A room's briefings, the newest first; none where the console names no engine or the engine does not answer. */
export async function roomBriefings(chatId: number): Promise<VoiceBriefing[]> {
  if (!voiceNamed()) return [];

  try {
    const page = await unitFetch<{ items?: EngineBriefing[] }>(UNIT, `/briefings?chatId=${chatId}&limit=${ROOM_BRIEFINGS}`);

    return (page?.items ?? []).map(voiceBriefingOf);
  } catch {
    return [];
  }
}

/** One briefing, as a chip waits on it. */
export async function readBriefing(id: number): Promise<VoiceBriefing> {
  if (!voiceNamed()) throw fail(503, wording("briefing.error.no_engine"));

  return voiceBriefingOf(await unitFetch<EngineBriefing>(UNIT, `/briefings/${id}`, undefined, { codes: { "not-found": "briefing.error.not_found" } }));
}

/** A briefing's sound handed on whole, the stretch a player asked for among it. */
export async function briefingSound(id: number, range: string | undefined): Promise<Response> {
  if (!voiceNamed()) throw fail(503, wording("briefing.error.no_engine"));

  return await unitBytes(UNIT, `/briefings/${id}/sound`, {
    headers: range === undefined ? {} : { range },
    codes: { "not-found": "briefing.error.not_found" }
  });
}
