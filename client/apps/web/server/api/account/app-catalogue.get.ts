import { readCatalogue } from "../../utils/app-catalogue";

import type { Catalogue } from "#shared/app-catalogue";

// The signed-in reader's company's catalogue as they see it, the administrator's of the company `company` names
// (docs/web.md, 「App catalogue」).
export default defineEventHandler(async (event): Promise<Catalogue> => await readCatalogue(await signedInUser(event), getQuery(event).company));
