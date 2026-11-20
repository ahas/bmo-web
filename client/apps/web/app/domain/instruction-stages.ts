import { RESERVED_STAGE_NAMES, STAGE_NAME_MAX, STAGE_TEXT_MAX } from "#shared/instruction-stages";
import { countText } from "./numbers";

import type { InstructionStageView, SupervisorStagesSave, SupervisorStagesView } from "#shared/instruction-stages";
import type { Translate } from "#shared/wording";

// What a supervisor's draft block holds while its instruction stages are edited, how its fields are checked, and what
// its save sends (docs/web.md, 「Agent management screen」, the settings dialog's draft block; the receiver's
// `docs/instruction.md`, 「The stage chain and its texts」).

export { STAGE_NAME_MAX, STAGE_TEXT_MAX };

// A stage's name, as the receiver checks it: a lowercase letter, then lowercase letters, digits and dashes.
const STAGE_NAME = /^[a-z][a-z0-9-]*$/;

/** Why a new stage's name cannot be sent, or null where it can. */
export function stageNameFault(t: Translate, name: string, taken: readonly string[]): string | null {
  if (!STAGE_NAME.test(name) || [...name].length > STAGE_NAME_MAX) return t("agents.error.stage_name", { max: countText(STAGE_NAME_MAX) });
  if (RESERVED_STAGE_NAMES.includes(name)) return t("agents.error.stage_name_reserved");
  if (taken.includes(name)) return t("agents.error.stage_name_taken");

  return null;
}

/** Why a stage's text cannot be sent, or null where it can. */
export function stageTextFault(t: Translate, text: string): string | null {
  return text.trim() === "" || [...text].length > STAGE_TEXT_MAX ? t("agents.error.stage_text", { max: countText(STAGE_TEXT_MAX) }) : null;
}

// The chain: an ordered list of stage names, each named once.

/** The chain with a stage added at its end; one it holds stays where it stands. */
export function withStage(chain: readonly string[], name: string): string[] {
  return chain.includes(name) ? [...chain] : [...chain, name];
}

/** The chain with a stage taken out. */
export function withoutStage(chain: readonly string[], name: string): string[] {
  return chain.filter((one) => one !== name);
}

/** The chain with one stage moved up (-1) or down (+1). */
export function movedStage(chain: readonly string[], name: string, by: -1 | 1): string[] {
  const moved = [...chain];
  const at = moved.indexOf(name);
  const to = at + by;

  if (at < 0 || to < 0 || to >= moved.length) return moved;

  [moved[at], moved[to]] = [moved[to]!, moved[at]!];

  return moved;
}

/** The chain with the stage at `from` carried to the place of the one at `to`. */
export function placedStage(chain: readonly string[], from: number, to: number): string[] {
  const placed = [...chain];

  if (from < 0 || from >= placed.length) return placed;

  const [carried] = placed.splice(from, 1);

  placed.splice(Math.min(Math.max(to, 0), placed.length), 0, carried!);

  return placed;
}

// The block while it is edited.

/** What the block holds: the chain, whether the supervisor keeps a chain of its own whatever it says, and its
 * catalogue as it will stand. */
export interface StagesForm {
  keepOwn: boolean;
  stages: string[];
  texts: InstructionStageView[];
}

/** The block as the receiver holds it. */
export function stagesFormOf(view: SupervisorStagesView): StagesForm {
  return { keepOwn: view.source === "set", stages: [...view.stages], texts: view.texts.map((one) => ({ ...one })) };
}

const sameList = (one: readonly string[], other: readonly string[]): boolean => one.length === other.length && one.every((name, at) => name === other[at]);

/** Whether the supervisor follows a chain of its own as the block stands: one it keeps, or one that differs from the
 * policy's. */
export function chainOwn(form: StagesForm, policy: readonly string[]): boolean {
  return form.keepOwn || !sameList(form.stages, policy);
}

/** The block with its chain put back to the policy's, the supervisor keeping none of its own; the texts stand as they
 * are. */
export function chainToPolicy(form: StagesForm, policy: readonly string[]): StagesForm {
  return { ...form, keepOwn: false, stages: [...policy] };
}

/** Whether a stage of the block carries a text of the console's: one the console added, or one whose text is not the
 * policy's. */
export function stageTextSet(stage: InstructionStageView): boolean {
  return stage.policyText === null || stage.text !== stage.policyText;
}

/** The block with a stage added under a new name: it joins the catalogue and the chain's end. */
export function withAddedStage(form: StagesForm, name: string, text: string): StagesForm {
  return { ...form, stages: withStage(form.stages, name), texts: [...form.texts, { name, text, source: "set", policyText: null }] };
}

/** The block with a stage of the policy's standing again in the policy's text. */
export function stageToPolicy(form: StagesForm, name: string): StagesForm {
  return {
    ...form,
    texts: form.texts.map((one) => (one.name === name && one.policyText !== null ? { ...one, text: one.policyText, source: "default" as const } : one))
  };
}

/** The block with a stage the console added taken away: it leaves the catalogue and the chain. A stage the policy
 * holds is never taken away. */
export function withoutAddedStage(form: StagesForm, name: string): StagesForm {
  if (!form.texts.some((one) => one.name === name && one.policyText === null)) return form;

  return { ...form, stages: withoutStage(form.stages, name), texts: form.texts.filter((one) => one.name !== name) };
}

/** What the block says as the receiver would hold it once saved, which is what tells whether it holds a change: the
 * chain where it is the supervisor's own, and each stage's text where it is the console's. How the block came to it —
 * a text put back to the policy's and typed again, a chain put back and ordered again — plays no part. */
export function stagesHeld(form: StagesForm, policy: readonly string[]): { stages: string[] | null; texts: { name: string; text: string | null }[] } {
  return {
    stages: chainOwn(form, policy) ? [...form.stages] : null,
    texts: form.texts.map((one) => ({ name: one.name, text: stageTextSet(one) ? one.text : null }))
  };
}

/** What a save of the block sends, against what the receiver holds: the texts set, the chain set or taken away, and
 * the texts taken away; a part with no change is left out. */
export function stagesChange(view: SupervisorStagesView, form: StagesForm): SupervisorStagesSave {
  const save: SupervisorStagesSave = {};
  const held = new Map(view.texts.map((one) => [one.name, one]));
  const texts: Record<string, string> = {};
  const removed: string[] = [];

  for (const stage of form.texts) {
    const before = held.get(stage.name);

    if (!stageTextSet(stage)) {
      if (before?.source === "set") removed.push(stage.name);
    } else if (before === undefined || before.text !== stage.text) {
      texts[stage.name] = stage.text;
    }
  }

  for (const before of view.texts) {
    if (before.source === "set" && !form.texts.some((one) => one.name === before.name)) removed.push(before.name);
  }

  if (Object.keys(texts).length > 0) save.texts = texts;

  if (!chainOwn(form, view.policy)) {
    if (view.source === "set") save.stages = null;
  } else if (view.source === "default" || !sameList(form.stages, view.stages)) {
    save.stages = [...form.stages];
  }

  if (removed.length > 0) save.removed = removed;

  return save;
}
