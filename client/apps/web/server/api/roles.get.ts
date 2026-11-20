import { listedRole } from "../utils/agent-ownership";

import type { RolesView } from "#shared/axes";

// Every role, every bundle a role may give and every line a role may name (the agency's `docs/api.md`, 「roles」), each
// role with only its agents that are the reader's own or the deployment's (docs/web.md, 「Access」).
export default defineEventHandler(async (event): Promise<RolesView> => {
  const signed = await signedInUser(event);

  return await readRoles((role) => listedRole(role, signed.id), event);
});
