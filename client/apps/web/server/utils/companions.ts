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

const seconds = (ms: unknown): number | null => (typeof ms === "number" ? Math.floor(ms / 1000) : null);
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/**
 * A companion as the companions screen stands it. The agency answers a companion whole (its `docs/api.md`,
 * 「companions」): its registration and every registration it may be pinned to, the files behind it, its settings,
 * base prompt, system prompt and room sessions, each moment in milliseconds, which the screen reads in
 * seconds. The receiver lists one by its name and what answers for it alone, and what neither says stands empty.
 */
export function companionViewOf(companion: ListedCompanion | Record<string, unknown>): CompanionView {
  const held = companion as Record<string, unknown>;
  const agent = text(held.agent) ?? text(held.name) ?? "";
  const settings = (held.settings ?? {}) as Record<string, unknown>;
  const provider = text(held.provider);
  const model = text(held.model);
  const method = held.method === "route" ? "route" : "fixed";

  return {
    agent,
    label: text(held.label) ?? agent,
    icon: text(held.icon),
    builtin: held.builtin === true,
    method,
    provider,
    model,
    registration: method === "route" ? null : (text(held.registration) ?? (provider === null || model === null ? null : `${provider}::${model}`)),
    registrations: list(held.registrations),
    entries: list(held.entries),
    serving: text(held.serving) ?? (method === "fixed" ? model : null),
    modelUse: (held.modelUse ?? null) as CompanionView["modelUse"],
    settings: {
      agent,
      referenceOn: settings.referenceOn === true,
      persona: text(settings.persona),
      generation: (settings.generation ?? {}) as Record<string, number | boolean>,
      updatedAt: seconds(settings.updatedAt),
      updatedBy: text(settings.updatedBy)
    },
    generationSettings: list(held.generationSettings),
    thinking: typeof held.thinking === "boolean" ? held.thinking : null,
    personaFile: text(held.personaFile) ?? "",
    basePrompt: text(held.basePrompt),
    basePrompts: list(held.basePrompts),
    system: (held.system ?? { text: "", characters: 0, hash: "" }) as CompanionView["system"],
    sessions: list<Record<string, unknown>>(held.sessions).map((one) => ({
      chatId: Number(one.chatId),
      title: text(one.title),
      generation: typeof one.generation === "number" ? one.generation : 0,
      systemResetAt: seconds(one.systemResetAt),
      resetWaiting: one.resetWaiting === true,
      lastResetAt: seconds(one.lastResetAt)
    }))
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
