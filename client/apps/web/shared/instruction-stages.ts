// A supervisor's instruction stages as the console reads and sets them (the receiver's `docs/instruction.md`, 「The
// stage chain and its texts」 and 「The routes」): the chain of stages the message passes before it goes out, in order,
// and the texts of the supervisor's catalogue the chain may name. The shapes are the receiver's, as its document
// states them.

/** The longest name and text a stage takes, in characters, as the receiver checks them. */
export const STAGE_NAME_MAX = 40;
export const STAGE_TEXT_MAX = 4_000;

/** The names a round's fixed turns go by in its log, which the receiver lets no stage take. */
export const RESERVED_STAGE_NAMES: readonly string[] = ["message", "arrived", "audit"];

/** Where a chain or a stage's text comes from: set on the console for the supervisor, or the receiver's policy. */
export type StageSource = "set" | "default";

/** One stage of a supervisor's catalogue. */
export interface InstructionStageView {
  name: string;
  text: string;
  source: StageSource;
  // The policy's text of the stage, which stands again once the console's is taken away; null for a stage the console
  // added.
  policyText: string | null;
}

/** A supervisor's instruction stages as its settings read them: the chain it follows and whether it is its own, the
 * policy's chain, which it follows where it has none, and its catalogue. */
export interface SupervisorStagesView {
  source: StageSource;
  stages: string[];
  policy: string[];
  texts: InstructionStageView[];
}

/** One save of a supervisor's instruction stages; a part left out is left as it stands. */
export interface SupervisorStagesSave {
  // The chain the supervisor follows from now on, or null to take its own away so it follows the policy's.
  stages?: string[] | null;
  // The texts set, by the stage's name: a changed text or a stage added.
  texts?: Record<string, string>;
  // The stages whose console text is taken away.
  removed?: string[];
}
