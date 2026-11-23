import { ownMemoryView } from "../../../utils/org-memory";

import type { OwnMemoryView } from "#shared/org-memory";

// The signed-in person's own shared memories in their home unit's org brain (docs/web.md, 「Settings」).
export default defineEventHandler(async (event): Promise<OwnMemoryView> => ownMemoryView(await signedInUser(event)));
