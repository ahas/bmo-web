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
  // The question of `rounds` from whose answer on a send is read, empty for the first; the table does not show it
  // and carries it as it stands.
  sendFrom: string;
  light: string[];
  lightChars: number;
  ceilingSeconds: number;
  // How long one turn runs before the room is told the agent is still at work, null for the policy's; carried as
  // it stands.
  turnSeconds: number | null;
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

/** How a round read one piece of the brain: whole as part of the turn's core, as a mark of a version the session
 * already held, or pulled by the agent itself through the index during the round. */
export type DraftReadHow = "attached" | "read" | "held";

/** One piece a round read from the brain: its path, and the index's words for it where the index lists it. */
export interface DraftRead {
  path: string;
  holds: string | null;
  how: DraftReadHow;
  // The brain's memory the piece is, where the round's end names it; absent where it does not.
  memoryId?: number | null;
}

/** One memory of the brain as a read piece's modal stands it (docs/web.md, the room screen's brain chip). */
export interface BrainMemoryView {
  id: number;
  brainId: number;
  key: string | null;
  type: string;
  text: string;
  layer: string | null;
  subjects: { type: string; key: string }[];
  // When this version was written, in unix seconds.
  writtenAt: number;
}

/** What a read piece's modal reads of it: the brain's memory where the read names one, else the gate's text of it
 * where the gate's index lists its path, else neither. */
export interface BrainPiece {
  memory: BrainMemoryView | null;
  text: string | null;
}

/** One turn of a round's draft process, or its end (the receiver's `docs/drafting.md`, 「The round log」). */
export interface DraftRow {
  id: number;
  number: number;
  question: string;
  kind: "supervisor" | "turn" | "question" | "item" | "check" | "end" | string;
  answerChars: number;
  changed: boolean;
  outcome: string;
  detail: string | null;
  ms: number;
  at: number;
  answer: string | null;
  // What the message stood as before this row rewrote it, where the round rewrote one; null on every other row.
  before?: string | null;
  // On the end, what the round read from the brain; empty on every other row.
  reads: DraftRead[];
}

/** What a round's draft process did, on the round's last message: the round, how many rounds it asked, how it
 * ended, where its end is written, and what it read from the brain, as its end names it. */
export interface DraftSummary {
  round: string;
  asked: number;
  end: string | null;
  reads: DraftRead[];
}
