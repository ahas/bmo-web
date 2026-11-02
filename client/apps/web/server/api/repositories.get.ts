import type { RepositoryView } from "#shared/axes";

// Every repository with its checkouts (the agency's `docs/api.md`, 「repositories, prefix-checks and room-holdings」).
export default defineEventHandler(async (event): Promise<RepositoryView[]> => {
  await requireUserSession(event);

  return await readRepositories();
});
