import { ownModels } from "../../../../utils/own-agents";

import type { OwnModel } from "#shared/own-agents";

// The models of a provider the reader may stand an agent on (docs/web.md, 「Settings」, the own-agents section).
export default defineEventHandler(async (event): Promise<OwnModel[]> => await ownModels(await signedInUser(event), getRouterParam(event, "provider") ?? ""));
