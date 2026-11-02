import type { WorkNodeView } from "#shared/axes";

// The nodes the agency places a repository's jobs on (the agency's `docs/work-nodes.md`, 「Which nodes take jobs」).
export default defineEventHandler(async (event): Promise<WorkNodeView[]> => {
  await requireUserSession(event);

  return await readWorkNodes();
});
