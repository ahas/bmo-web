import { wording } from "#shared/wording";
import { completionsAddress, testReasonKey } from "#shared/guide";

import { fail } from "./fail";
import { supplyAgency } from "./supply";

import type { AgencyCall } from "./agency";
import type { LocalAi, LocalAiAsk, LocalAiView } from "#shared/local-ai";
import type { H3Event } from "h3";

// A person's own local AI on the console's server (docs/web.md, 「Organisation」, the supply tab's local AIs at the
// reader's own node, and 「The
// start guide」): the agency's `/personal-models` and its test, asked in the signed-in person's own name, so the agency
// keeps every call to their own (its `docs/supply.md`, 「A person's local AI」). A local AI is tried from their PC
// before it is kept, and one that does not answer is never kept.

/** The agency's refusals of a person's local AI, each with the pack's key for its sentence. */
const LOCAL_AI_CALL: AgencyCall = {
  codes: {
    "personal-local-ai-withheld": "supply.error.local_ai_withheld",
    "no-pc": "supply.error.local_ai_no_pc",
    "no-port": "supply.error.local_ai_no_port",
    "unknown-model": "supply.error.local_ai_gone",
    "access-unchecked": "supply.error.local_ai_unchecked",
    conflict: "supply.error.local_ai_failed",
    forbidden: "supply.error.forbidden"
  },
  fields: {
    name: "guide.error.local_name",
    url: "supply.error.local_ai_url",
    modelName: "guide.error.local_model",
    keyName: "supply.error.local_ai_key",
    local: "guide.error.local_fields"
  }
};

interface Tested {
  ok: boolean;
  reasonCode?: string | null;
}

/** The reader's local AIs, and whether their organisation lets them add one. */
export async function localAis(event: H3Event): Promise<LocalAiView> {
  const read = await supplyAgency<{ allowed?: boolean; items?: LocalAi[] }>(event, "GET", "/personal-models", undefined, LOCAL_AI_CALL);

  return {
    allowed: read.allowed === true,
    items: (read.items ?? []).map((one) => ({ name: one.name, model: one.model, url: one.url, modelName: one.modelName, keyName: one.keyName ?? null, enabled: one.enabled }))
  };
}

/** A local AI tried from the reader's PC before it is kept: whether it answered, and the agency's reason where not. */
export async function tryLocalAi(event: H3Event, ask: LocalAiAsk): Promise<{ ok: boolean; reasonCode: string | null }> {
  const local = { url: completionsAddress(ask.url), modelName: ask.modelName, ...(ask.keyName === null ? {} : { keyName: ask.keyName }) };
  const tried = await supplyAgency<Tested>(event, "POST", "/supply-test", { road: "registered", local }, LOCAL_AI_CALL);

  return { ok: tried.ok, reasonCode: tried.reasonCode ?? null };
}

/** A local AI tried from the reader's PC and kept once it answers; one that does not is refused with the agency's
 * reason, said in the pack's words, and nothing is kept. */
export async function keepLocalAi(event: H3Event, ask: LocalAiAsk): Promise<LocalAi> {
  const tried = await tryLocalAi(event, ask);

  if (!tried.ok) throw fail(422, wording(testReasonKey(tried.reasonCode)));

  return await supplyAgency<LocalAi>(
    event,
    "PUT",
    `/personal-models/${encodeURIComponent(ask.name)}`,
    { url: completionsAddress(ask.url), modelName: ask.modelName, keyName: ask.keyName },
    LOCAL_AI_CALL
  );
}

/** One of the reader's local AIs turned on or off. */
export async function switchLocalAi(event: H3Event, name: string, enabled: boolean): Promise<LocalAi> {
  return await supplyAgency<LocalAi>(event, "PATCH", `/personal-models/${encodeURIComponent(name)}`, { enabled }, LOCAL_AI_CALL);
}

/** One of the reader's local AIs taken away; its key's secret stays in their store. */
export async function removeLocalAi(event: H3Event, name: string): Promise<void> {
  await supplyAgency<void>(event, "DELETE", `/personal-models/${encodeURIComponent(name)}`, undefined, LOCAL_AI_CALL);
}

/** What a body says of a local AI to try or keep, or null where a field it needs is missing. */
export function localAiAsked(body: Record<string, unknown> | undefined, name?: string): LocalAiAsk | null {
  const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
  const named = name ?? text(body?.name);
  const url = text(body?.url);
  const modelName = text(body?.modelName ?? body?.model);
  const keyName = text(body?.keyName ?? body?.keyFile);

  if (named === "" || url === "" || modelName === "") return null;

  return { name: named, url, modelName, keyName: keyName === "" ? null : keyName };
}

/** A refusal of a body missing a field a local AI needs. */
export function localAiIncomplete(): Error {
  return fail(400, wording("guide.error.local_fields"));
}
