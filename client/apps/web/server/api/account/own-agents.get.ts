import { ownAgents } from "../../utils/own-agents";

import type { OwnAgentsView } from "#shared/own-agents";

// The reader's agents: the set their organisation supplies and their own changes over it (docs/web.md, 「Settings」, the
// own-agents section).
export default defineEventHandler(async (event): Promise<OwnAgentsView> => await ownAgents(await signedInUser(event)));
