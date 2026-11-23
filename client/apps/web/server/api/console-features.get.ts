import { consoleFeatures } from "../utils/console-features";

import type { ConsoleFeatures } from "#shared/console-features";

// The deployment's features (docs/web.md, 「The console's features」), which every page reads once as it is drawn,
// behind the same session rule as everything else here.
export default defineEventHandler(async (event): Promise<ConsoleFeatures> => {
  await requireUserSession(event);

  return await consoleFeatures();
});
