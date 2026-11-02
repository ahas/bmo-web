// What opened a room's turns, read by the receiver (the receiver's `docs/boundary-api.md`, 「What opened a turn」) and
// worn by the judgements of those turns. One asking covers every round the judgements name; a receiver that cannot
// be reached leaves them as they were.
import { receiver, receiverCall } from "./receiver";

import type { Judgement, RoundOpening } from "#shared/types";

export async function withOpenings(chatId: number, judgements: Judgement[]): Promise<Judgement[]> {
  const rounds = [...new Set(judgements.flatMap((judgement) => (judgement.round === null || judgement.round === undefined ? [] : [judgement.round])))];

  if (rounds.length === 0) {
    return judgements;
  }

  let read: Map<string, RoundOpening["instructions"]>;

  try {
    const page = await receiverCall(
      receiver().GET("/rounds/openings", {
        params: { query: { room: chatId, rounds: rounds.join(",") } }
      })
    );

    read = new Map(page.items.map((opening) => [opening.round, opening.instructions]));
  } catch (error) {
    console.error(`openings of chat ${chatId} could not be read:`, error);

    return judgements;
  }

  return judgements.map((judgement) => {
    const instructions = judgement.round === null || judgement.round === undefined ? undefined : read.get(judgement.round);

    return instructions === undefined ? judgement : { ...judgement, opening: { instructions, offers: judgement.opening?.offers ?? [] } };
  });
}

// One instruction's whole text, for the room whose turn it opened.
export async function readInstructionText(chatId: number, id: number): Promise<{ id: number; text: string }> {
  return await receiverCall(
    receiver().GET("/rounds/openings/{instructionId}", { params: { path: { instructionId: id }, query: { room: chatId } } })
  );
}
