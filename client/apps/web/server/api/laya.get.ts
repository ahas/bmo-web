import { layaOf } from "../utils/gate";

import type { LayaRead } from "../utils/gate";

// The Laya server's last health check and every gate's standing beside it (docs/web.md, the agents page's gates
// tab).
export default defineEventHandler(async (event): Promise<LayaRead> => {
  await requireUserSession(event);

  return await layaOf();
});
