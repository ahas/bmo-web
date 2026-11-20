// A round's instruction pipeline as the console reads it for the room's draft chip (the receiver's
// `docs/instruction.md`, 「The round log」): what each turn of a round wrote, what the round read from the brain and
// how its pipeline ended. The shapes are the receiver's, as its document states them.

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

/** One turn of a round's pipeline, or its end (the receiver's `docs/instruction.md`, 「The round log」). */
export interface DraftRow {
  id: number;
  number: number;
  question: string;
  // `supervisor`, the agent's own judgement before the round; `turn`, the round's message turn; `arrived`, the check of
  // the words that arrived meanwhile; `stage`, an instruction stage; or `end`.
  kind: "supervisor" | "turn" | "arrived" | "stage" | "end" | string;
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
  // On a turn's row whose turn spanned more than one turn of the agent's program, each answer it wrote in order;
  // empty or absent on every other row.
  versions?: DraftVersion[];
}

/** One answer a turn of a round wrote: its words, and whether words handed over opened it or the program's own
 * notice did. */
export interface DraftVersion {
  text: string;
  opened: "handed" | "program";
}

/** What a round's pipeline did, on the round's last message: the round, how many turns it asked once the message
 * stood, how it ended, and what it read from the brain, as its end names it. */
export interface DraftSummary {
  round: string;
  asked: number;
  end: string | null;
  reads: DraftRead[];
  // How many pieces this room's earlier rounds of the same session read in full before this one; null where the
  // end does not say.
  loaded?: number | null;
}
