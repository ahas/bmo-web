import { catalogueSeen } from "../../../utils/app-catalogue";

// The signed-in reader's looking at what was shared with them kept (docs/web.md, 「App catalogue」, its notices).
export default defineEventHandler(async (event): Promise<{ at: number }> => await catalogueSeen(await signedInUser(event)));
