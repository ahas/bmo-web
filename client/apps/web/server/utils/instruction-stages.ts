// A supervisor's instruction stages (the receiver's `docs/instruction.md`, 「The routes」): the chain it follows and the
// texts of its catalogue, read and set for the supervisor's settings. A refusal of a set is said by the pack's sentence
// for the receiver's code on these routes, which says what the receiver checks.
import { receiver, receiverCall } from "./receiver";

import { STAGE_NAME_MAX, STAGE_TEXT_MAX } from "#shared/instruction-stages";

import type { RefusalBody } from "./unit-answer";
import type { InstructionStageView, StageSource, SupervisorStagesSave, SupervisorStagesView } from "#shared/instruction-stages";

// A chain is refused for naming a stage outside the catalogue, and taken away only where the console set one; a text is
// refused for its name or its words, and taken away only where the console set one and no chain names a stage it added.
const CHAIN_CODES: Readonly<Record<string, string>> = { "bad-request": "agents.error.stage_chain_refused", "not-found": "agents.error.stage_chain_missing" };
const TEXT_CODES: Readonly<Record<string, string>> = {
  "bad-request": "agents.error.stage_text_refused",
  conflict: "agents.error.stage_in_chain",
  "not-found": "agents.error.stage_text_missing"
};

// A text's refusal says the bounds the receiver checks, as the console writes a count.
const bounded = (body: RefusalBody): RefusalBody => Object.assign({}, body, { name: STAGE_NAME_MAX.toLocaleString("ko-KR"), text: STAGE_TEXT_MAX.toLocaleString("ko-KR") });

// The key the receiver names its policy's chain by, which every supervisor follows until it sets one.
const POLICY_KEY = "*";

const sourceOf = (source: string): StageSource => (source === "set" ? "set" : "default");

/** A supervisor's instruction stages: the chain it follows, the policy's, and its catalogue with the policy's texts
 * beside its own. */
export async function readSupervisorStages(agentName: string): Promise<SupervisorStagesView> {
  const asking = receiver();
  const [own, every, texts] = await Promise.all([
    receiverCall(asking.GET("/instruction-stages", { params: { query: { agentName } } })),
    receiverCall(asking.GET("/instruction-stages")),
    receiverCall(asking.GET("/instruction-texts", { params: { query: { agentName } } }))
  ]);
  const chain = own.items[0];
  const policy = every.items.find((one) => one.agentName === POLICY_KEY);

  return {
    source: chain === undefined ? "default" : sourceOf(chain.source),
    stages: chain?.stages ?? policy?.stages ?? [],
    policy: policy?.stages ?? [],
    texts: texts.items.map((one): InstructionStageView => ({ name: one.name, text: one.text, source: sourceOf(one.source), policyText: one.policyText ?? null }))
  };
}

/** One save of a supervisor's instruction stages, in the order that keeps every chain naming a stage the receiver
 * holds: the texts set, then the chain, then the texts taken away. Answers the stages as the receiver now holds them. */
export async function writeSupervisorStages(agentName: string, save: SupervisorStagesSave): Promise<SupervisorStagesView> {
  const asking = receiver();

  for (const [name, text] of Object.entries(save.texts ?? {})) {
    await receiverCall(asking.PUT("/instruction-texts/{agentName}/{name}", { params: { path: { agentName, name } }, body: { text } }), { codes: TEXT_CODES, refusal: bounded });
  }

  if (save.stages === null) {
    await receiverCall(asking.DELETE("/instruction-stages/{agentName}", { params: { path: { agentName } } }), { codes: CHAIN_CODES });
  } else if (save.stages !== undefined) {
    await receiverCall(asking.PUT("/instruction-stages/{agentName}", { params: { path: { agentName } }, body: { stages: save.stages } }), { codes: CHAIN_CODES });
  }

  for (const name of save.removed ?? []) {
    await receiverCall(asking.DELETE("/instruction-texts/{agentName}/{name}", { params: { path: { agentName, name } } }), { codes: TEXT_CODES });
  }

  return await readSupervisorStages(agentName);
}

// A list of names, or null where it is not one.
function namesOf(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((one) => typeof one !== "string" || one.trim() === "")) return null;

  return (value as string[]).map((one) => one.trim());
}

/** One save a body names, or null where a part it names is of the wrong sort; a part it leaves out is left as it
 * stands. What the names and texts say is the receiver's to judge. */
export function stagesSaveOf(body: Record<string, unknown> | null | undefined): SupervisorStagesSave | null {
  if (typeof body !== "object" || body === null) return null;

  const save: SupervisorStagesSave = {};

  if (body.stages === null) {
    save.stages = null;
  } else if (body.stages !== undefined) {
    const stages = namesOf(body.stages);

    if (stages === null) return null;

    save.stages = stages;
  }

  if (body.texts !== undefined) {
    if (typeof body.texts !== "object" || body.texts === null || Array.isArray(body.texts)) return null;

    const texts = Object.entries(body.texts as Record<string, unknown>);

    if (texts.some(([name, text]) => name.trim() === "" || typeof text !== "string" || text.trim() === "")) return null;

    save.texts = Object.fromEntries(texts.map(([name, text]) => [name.trim(), text as string]));
  }

  if (body.removed !== undefined) {
    const removed = namesOf(body.removed);

    if (removed === null) return null;

    save.removed = removed;
  }

  return save;
}
