import type { DraftProcessesView } from "#shared/drafting";

// The draft process table and its questions, as the receiver holds them (the receiver's `docs/drafting.md`, 「The
// routes」).
export default defineEventHandler(async (event): Promise<DraftProcessesView> => {
  await requireUserSession(event);

  return await readDraftProcesses();
});
