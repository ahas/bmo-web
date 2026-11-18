import type { DeployView } from "#shared/types";

// The deployment as the title bar reads it (docs/web.md, 「Deployment in the title bar」). Every tab
// asks on the stream's `deploy` word and whenever its stream opens; a member is handed nothing of a
// run, the hold or the line, only the release.
export default defineEventHandler(async (event): Promise<DeployView> => {
  const signed = await signedInUser(event);
  const readings = readDeployReadings();
  const reading = shownReading(readings);
  const release = useRuntimeConfig().app.buildId;

  if (!signed.administrator) return deployViewFor(reading, release, null);

  const [hold, line] = await Promise.all([readDeployHoldRow(), readDeployLine(readings)]);

  return deployViewFor(reading, release, { hold, brings: readDeployCommits(reading), runs: runningDeployRuns(readings), line });
});
