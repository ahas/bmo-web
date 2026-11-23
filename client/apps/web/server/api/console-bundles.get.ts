import { appGateOf } from "../utils/app-gate";
import { attachedBundles, readerMay, readerOf, screenOf, sharePage } from "../utils/console-manifests";

import type { ConsoleScreen } from "#shared/console-bundles";

// The console bundles a reader may open (docs/web.md, 「Screens a unit brings」): those whose manifest's role the
// signed-in reader's role allows, leaving out one that asks for the owner key where the login has no user, each in the
// section its manifest names for the reader's role, and leaving out every app the delegation chain does not stand on
// for them. With no session, the one bundle whose share page the asked `path` stands under — the one with the longest
// screen path, where one screen path stands under another (bmo-ui's `docs/console-bundles.md`, 「Share pages」) — and
// nothing else of any manifest.
export default defineEventHandler(async (event): Promise<ConsoleScreen[]> => {
  const baseURL = useRuntimeConfig().app.baseURL;
  const session = await getUserSession(event);

  if (session.user === undefined) {
    const path = String(getQuery(event).path ?? "");

    return attachedBundles()
      .filter((bundle) => sharePage(bundle.manifest, path))
      .toSorted((one, other) => other.manifest.screenPath.length - one.manifest.screenPath.length)
      .slice(0, 1)
      .map((bundle) => ({ ...screenOf(bundle, baseURL, null), title: "", icon: "" }));
  }

  const signed = await signedInUser(event);
  const reader = readerOf(signed);
  const allowed = attachedBundles().filter((bundle) => readerMay(reader, bundle.manifest));

  return (await appGateOf(event, signed).openBundles(allowed)).map((bundle) => screenOf(bundle, baseURL, reader.role));
});
