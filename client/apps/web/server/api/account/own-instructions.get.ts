import { ownInstructions } from "../../utils/own-agents";

import type { OwnInstructionsView } from "#shared/own-agents";

// The reader's own instructions to their agents (docs/web.md, 「Settings」, the own-agents section).
export default defineEventHandler(async (event): Promise<OwnInstructionsView> => await ownInstructions(await signedInUser(event)));
