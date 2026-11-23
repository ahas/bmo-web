import { ownPersonalApps } from "../../utils/personal-apps";

import type { PersonalApps } from "#shared/personal-apps";

// The signed-in reader's personal apps (docs/web.md, 「Settings」, the personal apps section).
export default defineEventHandler(async (event): Promise<PersonalApps> => await ownPersonalApps(await signedInUser(event)));
