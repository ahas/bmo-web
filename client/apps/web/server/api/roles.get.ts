import type { RolesView } from "#shared/axes";

// Every role, every bundle a role may give and every line a role may name (the agency's `docs/api.md`, 「roles」).
export default defineEventHandler(async (event): Promise<RolesView> => {
  await requireUserSession(event);

  return await readRoles();
});
