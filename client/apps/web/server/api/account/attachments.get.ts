import { readAttachments } from "../../utils/attachments";

import type { Attachments } from "#shared/attachments";

// The signed-in reader's agents with what each is given, and every skill and MCP item they may give (docs/web.md,
// 「System and organisation」, the agents tab at the reader's own node).
export default defineEventHandler(async (event): Promise<Attachments> => await readAttachments(await signedInUser(event)));
