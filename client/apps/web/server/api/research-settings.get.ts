import { readResearchSettings } from "../utils/research-settings";

import type { ResearchSettingsView } from "#shared/research";

// The settings every research run is held to and the search engines' state (docs/web.md, 「Research screen」, its settings tab).
export default defineEventHandler(async (event): Promise<ResearchSettingsView> => {
  await requireUserSession(event);

  return await readResearchSettings();
});
