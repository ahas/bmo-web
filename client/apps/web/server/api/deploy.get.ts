import type { DeployView } from "#shared/types";

// The deployment as the title bar reads it (docs/web.md, 「Deployment in the title bar」). Every tab
// asks on the stream's `deploy` word and whenever its stream opens; a member is handed only that a
// run is under way.
export default defineEventHandler(async (event): Promise<DeployView> => {
  const signed = await signedInUser(event);
  const hold = signed.administrator ? await readDeployHoldRow() : null;

  return deployViewFor(shownReading(readDeployReadings()), hold, useRuntimeConfig().app.buildId, signed.administrator);
});
