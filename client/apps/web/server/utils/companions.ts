import { receiver, receiverCall } from "./receiver";
import { within } from "./unit-answer";

import type { CompanionRequest, Companions } from "@bmo/receiver-client";
import type { UnitAnswerCall } from "./unit-answer";
import type { CompanionView } from "#shared/agency";

/** A companion as the unit lists it: its name, the label it is called by, and what answers for it. */
export interface ListedCompanion {
  name: string;
  label: string;
  provider?: string;
  model?: string;
  workerName?: string | null;
}

/**
 * A listed companion as the companions screen stands it. The agency and the receiver list a companion by its
 * name and what answers for it; the settings beside it are read by no route of either (docs/boundary.md, 「Gaps
 * the console meets」), so they stand empty and the screen offers a change through the routes that take one.
 */
export function companionViewOf(companion: ListedCompanion): CompanionView {
  return {
    agent: companion.name,
    label: companion.label,
    icon: null,
    builtin: false,
    registration: companion.provider === undefined || companion.model === undefined ? null : `${companion.provider}::${companion.model}`,
    registrations: [],
    entries: [],
    serving: companion.model ?? null,
    modelUse: null,
    settings: {
      agent: companion.name,
      referenceOn: false,
      pieces: null,
      ownPieces: {},
      persona: null,
      generation: {},
      updatedAt: null,
      updatedBy: null
    },
    generationSettings: [],
    thinking: null,
    pieces: [],
    personaFile: "",
    basePrompt: null,
    basePrompts: [],
    system: { text: "", characters: 0, hash: "" },
    sessions: []
  };
}

// A companion added with a room of the console's own, and taken out again, as the receiver carries both
// (the receiver's `docs/api.md`, 「Companions」): the receiver writes the room's half and asks the agency for the
// agent's. Its refusals are its `CompanionRefusal` codes (the receiver's `docs/codes.md`), each said by the
// pack's sentence, and a refusal about one field names it so the form says it there.

const COMPANION_CODES: Readonly<Record<string, string>> = {
  "not-companion": "agents.error.companion_not_companion",
  name: "agents.error.companion_name",
  "name-taken": "agents.error.companion_name_taken",
  label: "agents.error.companion_label",
  provider: "agents.error.companion_provider",
  model: "agents.error.companion_model",
  worker: "agents.error.companion_worker",
  room: "agents.error.companion_room",
  "seeded-companion": "agents.error.companion_seeded",
  action: "agents.error.companion_change"
};

// The form field each refusal is about.
const FIELD_OF: Readonly<Record<string, string>> = {
  name: "name",
  "name-taken": "name",
  label: "label",
  provider: "provider",
  model: "model",
  worker: "worker",
  room: "room"
};

async function renamed<T, E extends { code?: string; error?: string; field?: string }>(asked: Promise<{ data?: T; error?: E; response: Response }>, call: UnitAnswerCall): Promise<T> {
  try {
    return await receiverCall(asked, call);
  } catch (error) {
    const refused = error as { statusCode?: number; message?: string; data?: { code?: string } } | null;
    const code = typeof refused?.data?.code === "string" ? refused.data.code : null;

    throw code !== null && code in FIELD_OF
      ? createError({ statusCode: refused?.statusCode ?? 400, message: refused?.message ?? "", data: { field: FIELD_OF[code] } })
      : error;
  }
}

/** A companion added with the room the console names. */
export async function addCompanion(body: CompanionRequest, timeoutMs: number): Promise<Companions> {
  return await renamed(receiver().POST("/companions", { body, signal: within(timeoutMs) }), { codes: COMPANION_CODES, passStatus: [409] });
}

/** A companion taken out, with its room and everything it kept. */
export async function removeCompanion(companionName: string, by: string, timeoutMs: number): Promise<Companions> {
  return await renamed(
    receiver().DELETE("/companions/{companionName}", { params: { path: { companionName }, query: { by } }, signal: within(timeoutMs) }),
    { codes: COMPANION_CODES, passStatus: [409] }
  );
}
