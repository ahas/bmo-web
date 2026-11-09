import { useIsland } from "bmo-ui/app/domain/island";

import type { Translate } from "#shared/wording";

// A window that stands open is told when a newer build is live (docs/web.md, 「Running as a service」): it keeps
// the build it loaded, so a deployment changes nothing it shows until it is loaded again. Nuxt reads the newest
// build's name on the interval the configuration names and says so here; the window says it in the notice
// island, with the button that loads it again, and the notice stands until it is pressed or put away.
export default defineNuxtPlugin((nuxtApp) => {
  const t = (nuxtApp.$i18n as { t: Translate }).t;
  const island = useIsland(t);

  nuxtApp.hook("app:manifest:update", () => {
    // One notice however many builds went live while it stood: a later one takes the earlier one's place.
    island.say({
      key: "new-build",
      tone: "info",
      title: t("app.message.new_build"),
      actions: [{ label: t("app.action.reload"), tone: "primary", press: () => window.location.reload() }],
      duration: null
    });
  });
});
