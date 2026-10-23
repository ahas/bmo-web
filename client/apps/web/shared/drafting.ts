// The receiver's draft process as the console reads and sets it (the receiver's `docs/drafting.md`): the table
// that says which questions a round's answer is asked before it goes out, the questions themselves, and what a
// round's process wrote. The shapes are the receiver's, as its document states them.

/** `*` in a key's place stands for any provider, tier or agent. */
export const ANY_KEY = "*";

/** The last question of every list that holds one. */
export const FINAL_QUESTION = "final";

/** What becomes of a turn once the process's ceiling has passed. */
export type PastCeiling = "send" | "skip";

/** Where a row or a question comes from: set on the console, or the receiver's policy. */
export type DraftSource = "set" | "default";

/** A row's key: a provider, a tier and an agent, each a name or `*`. */
export interface DraftKey {
  provider: string;
  tier: string;
  agentName: string;
}

/** What a row holds besides its key, as a set sends it. */
export interface DraftProcessValues {
  rounds: string[];
  light: string[];
  lightChars: number;
  ceilingSeconds: number;
  pastCeiling: PastCeiling;
}

/** One row of the process table. */
export interface DraftProcessView extends DraftKey, DraftProcessValues {
  source: DraftSource;
}

/** One question of the catalogue. */
export interface DraftQuestionView {
  name: string;
  text: string;
  source: DraftSource;
}

/** The table and the catalogue, as the agents screen reads them together. */
export interface DraftProcessesView {
  rows: DraftProcessView[];
  questions: DraftQuestionView[];
}

/** One turn of a round's draft process, or its end (the receiver's `docs/drafting.md`, 「The round log」). */
export interface DraftRow {
  id: number;
  number: number;
  question: string;
  kind: "turn" | "question" | "item" | "check" | "end" | string;
  answerChars: number;
  changed: boolean;
  outcome: string;
  detail: string | null;
  ms: number;
  at: number;
  answer: string | null;
}

/** What a round's draft process did, on the round's last message: the round, how many rounds it asked, and how it
 * ended, where its end is written. */
export interface DraftSummary {
  round: string;
  asked: number;
  end: string | null;
}
