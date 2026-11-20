import type { StandingNote } from "#shared/types";

// Every finished item whose unfinished note still stands, with its numbered strands: what the raising form reads as it
// opens, for the other notes a new line may take up beside the one being viewed (docs/web.md, the TODO panel's
// section).
export default defineEventHandler(async (event): Promise<StandingNote[]> => {
  await requireUserSession(event);

  return readStandingNotes();
});
