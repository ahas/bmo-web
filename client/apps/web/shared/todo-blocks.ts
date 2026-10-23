// The shape an item's instruction is written in, and the reading of it back (bmo-job's docs/reading.md, 「The
// blocks of an instruction」). The shape is bmo-job's own, so it is read here as that document states it, under the
// labels bmo-job writes, which are data the reading matches on rather than words a person reads.

// The label a block of something the owner said carries, and the label a block of the chat agent's answer
// carries. Both are copies of what was said, so a screen reads them together as the conversation rather than as
// parts of their own.
export const SAID_LABELS = { instruction: "Instruction as said", reply: "Reply as said" } as const;

// The line that stands over the copied conversation, so the parts read as parts rather than as prose with
// quotations in it.
export const CONVERSATION_HEAD = "The conversation, word for word:";

// The parts of an item's instruction the chat agent writes itself, in the order an item is read in.
export const PART_ORDER = ["What the work is", "Conclusion", "What to do"] as const;

export interface InstructionBlock {
  label: string;
  source: string;
  text: string;
  start: number;
  end: number;
}

// A stretch of the instruction that is not a block: the line over the conversation, or the whole
// of an instruction written before items were composed of blocks.
export interface InstructionLoose {
  label: null;
  text: string;
  start: number;
  end: number;
}

export type InstructionSegment = InstructionBlock | InstructionLoose;

// The instruction, from the top, as the blocks and the loose paragraphs it stands in. It is read
// block by block rather than searched: a copied message may itself quote a line that looks like
// a block's head, and only a head met between blocks is one. Nothing is dropped — a paragraph that
// is not a block comes back as loose text — so a reader that lays the parts out loses no word of
// an instruction that is not made of them.
export function instructionSegments(instruction: string): InstructionSegment[] {
  const head = /(.+?) \(([^\n]*)\):\n(`{3,})text\n/y;
  const segments: InstructionSegment[] = [];
  let at = 0;

  const loose = (start: number, end: number): void => {
    const text = instruction.slice(start, end).trim();

    if (text !== "") {
      segments.push({ label: null, text, start, end });
    }
  };

  while (at < instruction.length) {
    head.lastIndex = at;
    const matched = head.exec(instruction);

    if (matched === null) {
      const gap = instruction.indexOf("\n\n", at);

      if (gap === -1) {
        loose(at, instruction.length);
        break;
      }

      loose(at, gap);
      at = gap + 2;
      continue;
    }

    const [whole, label = "", source = "", fence = ""] = matched;
    const bodyStart = at + whole.length;
    let close = instruction.indexOf(`\n${fence}`, bodyStart - 1);

    // The fence is longer than any run of backticks inside it, so the first line that is the
    // fence and nothing more is where the block ends.
    while (close !== -1 && instruction[close + 1 + fence.length] === "`") {
      close = instruction.indexOf(`\n${fence}`, close + 1);
    }

    if (close === -1) {
      loose(at, instruction.length);
      break;
    }

    const end = close + 1 + fence.length;

    segments.push({ label, source, text: instruction.slice(bodyStart, Math.max(bodyStart, close)), start: at, end });
    at = instruction.startsWith("\n\n", end) ? end + 2 : end;
  }

  return segments;
}

// The blocks standing at the top level of an instruction, in order.
export function topLevelBlocks(instruction: string): InstructionBlock[] {
  return instructionSegments(instruction).filter((segment): segment is InstructionBlock => segment.label !== null);
}

// The one order an item is read in, wherever it is read: the conversation it came out of, what kind of work it
// is, what that conversation came to, and what the work has to achieve before anyone can call it finished.
// Anything the list does not name keeps the place it stands in, after the parts that are named.
const partOrder: readonly string[] = PART_ORDER;

const conversationRank = 0;
const unnamedRank = partOrder.length + 1;

// Where one segment stands. Everything the conversation is made of — the line that heads it and
// every copied message under it — ranks as one part, so the talk arrives contiguous however the
// instruction it came out of was written.
function partRank(segment: InstructionSegment): number {
  if (segment.label === null) {
    return segment.text === CONVERSATION_HEAD ? conversationRank : unnamedRank;
  }

  if (segment.label === SAID_LABELS.instruction || segment.label === SAID_LABELS.reply) {
    return conversationRank;
  }

  const at = partOrder.indexOf(segment.label);

  return at === -1 ? unnamedRank : at + 1;
}

// The segments in the reading order, with everything else left where it was. The sort is stable,
// so the copied messages keep the order they were said in and two parts of equal rank keep theirs.
export function orderedSegments(segments: readonly InstructionSegment[]): InstructionSegment[] {
  return [...segments].sort((one, other) => partRank(one) - partRank(other));
}

// An instruction written out in the reading order. Each part comes back as the instruction's own
// text rather than as anything composed again, so a copied message is moved and never rewritten.
export function orderedInstruction(instruction: string): string {
  return orderedSegments(instructionSegments(instruction))
    .map((segment) => instruction.slice(segment.start, segment.end).trim())
    .join("\n\n");
}

// The instruction in the reading order with its copied conversation left out: the chat agent's own parts and
// whatever else stood beside them.
export function ownSections(instruction: string): string {
  return orderedSegments(instructionSegments(instruction).filter((segment) => partRank(segment) !== conversationRank))
    .map((segment) => instruction.slice(segment.start, segment.end).trim())
    .join("\n\n");
}

// Whether a work order's draft still says only what the item itself already shows. A draft is
// seeded out of the item's own parts, so until somebody writes it apart it is those words again:
// printing it under the item, or standing it in a field beside them, puts the same text on the
// page twice. Once either field says something the item does not, the draft is part of what the
// work is and stands on its own account.
export function draftRepeatsItem(
  instruction: string,
  draft: { intent: string; instruction: string },
): boolean {
  const own = new Set(topLevelBlocks(instruction).map((block) => block.text));

  return own.has(draft.intent) && own.has(draft.instruction);
}
