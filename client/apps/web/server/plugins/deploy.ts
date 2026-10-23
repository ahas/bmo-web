import { publishConsoleEvent } from "../utils/console-events";
import { processAlive, readDeployReadings } from "../utils/deploy";

// The console's word that a deployment moved (docs/web.md, 「Deployment in the title bar」). Every listed unit's
// progress record is looked at every second — its last write, and whether the run that began it still runs — and
// every open tab's stream is told `deploy` when any changed; the tab reads the deployment again itself, so the word carries
// nothing. Nothing here goes through a unit, so the word goes on while the units restart under the deployment.
const LOOK_MS = 1_000;

export default defineNitroPlugin((nitro) => {
  let seen: string | null = null;

  const look = (): void => {
    const now = readDeployReadings()
      .map(({ unitName, record, writtenAt }) => (record === null ? `${unitName}:none` : `${unitName}:${writtenAt}:${record.ending === null && processAlive(record.pid)}`))
      .join("|");

    if (seen !== null && now !== seen) publishConsoleEvent("deploy", {});

    seen = now;
  };

  const looking = setInterval(look, LOOK_MS);

  nitro.hooks.hook("close", () => clearInterval(looking));
});
