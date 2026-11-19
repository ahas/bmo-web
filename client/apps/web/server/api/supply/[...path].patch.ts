import { supplyRelay } from "../../utils/supply-relay";

import type { H3Event } from "h3";

// One method of the supply relay (docs/web.md, the supply sections): the whole of it, guard and every head,
// stands in the relay module, which answers the request or the unit's refusal and never a typed shape of its own.
export default defineEventHandler(async (event: H3Event): Promise<unknown> => await supplyRelay(event));
