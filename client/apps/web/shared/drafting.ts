// The receiver's draft process as the console reads and sets it (the receiver's `docs/drafting.md`): for one
// supervisor, which questions a round's one draft turn follows before it writes the message and the questions'
// texts, and what a round's process wrote. The shapes are the receiver's, as its document states them.

/** `*` in a key's place stands for any provider or tier; a supervisor's row names the supervisor under both. */
export const ANY_KEY = "*";

/** The last question of every list that holds one. */
export const FINAL_QUESTION = "final";

/** The catalogue's name for the supervisor's own judgement of whether to answer, asked before any process: its text
 * is set like a question's, and no list names it. */
export const SUPERVISOR_QUESTION = "supervisor";

/** What becomes of a turn once the process's ceiling has passed. */
export type PastCeiling = "send" | "skip";

/** Where a process or a question's text comes from: set on the console for the supervisor, or the receiver's policy. */
export type DraftSource = "set" | "default";

/** What a supervisor's process holds, as a set sends it. */
export interface DraftProcessValues {
  // The questions every turn's round follows in its one draft turn, in order.
  rounds: string[];
  // A value the receiver reads no more; the table does not show it and carries it as it stands.
  sendFrom: string;
  // The questions of the list that are switched off: each keeps its place and is not followed.
  off: string[];
  // Values the receiver reads no more; the table does not show them and carries them as they stand.
  ceilingSeconds: number;
  pastCeiling: PastCeiling;
}

/** One question of a supervisor's catalogue. */
export interface DraftQuestionView {
  name: string;
  text: string;
  source: DraftSource;
  // The policy's text of the question, which stands again once the console's is taken away; null for a question the
  // console added.
  policyText: string | null;
}

/** A supervisor's draft process as its settings read it: the process it follows and whether it is its own, the
 * policy's process, which it follows where it has none, and its catalogue. */
export interface SupervisorDraftView {
  source: DraftSource;
  process: DraftProcessValues;
  policy: DraftProcessValues;
  questions: DraftQuestionView[];
}

/** One save of a supervisor's draft settings; a part left out is left as it stands. */
export interface SupervisorDraftSave {
  // The process the supervisor follows from now on, or null to take its own away so it follows the policy's.
  process?: DraftProcessValues | null;
  // The texts set, by the question's name: a changed text or a question added.
  texts?: Record<string, string>;
  // The questions whose console text is taken away.
  removed?: string[];
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
  // On the end, the session the round's turn ran on, and how many pieces this room's earlier rounds of that
  // session read in full before this round; null on every other row and on a row kept before they were counted.
  session?: string | null;
  loaded?: number | null;
}

/** What a round's draft process did, on the round's last message: the round, how many rounds it asked, how it
 * ended, where its end is written, and what it read from the brain, as its end names it. */
export interface DraftSummary {
  round: string;
  asked: number;
  end: string | null;
  reads: DraftRead[];
  // How many pieces this room's earlier rounds of the same session read in full before this one; null where the
  // end does not say.
  loaded?: number | null;
}
