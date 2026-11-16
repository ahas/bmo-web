import { publishConsoleEvent } from "../utils/console-events";
import { processAlive, readDeployReadings } from "../utils/deploy";
import { deployUnitsStanding } from "../utils/deploy-line";

// The console's word that a deployment moved (docs/web.md, 「Deployment in the title bar」). Every listed unit's
// progress record is looked at every second — its last write, and whether the run that began it still runs — with the
// deploy units standing, whose coming and going is the line moving, and every open tab's stream is told `deploy` when
// any changed; the tab reads the deployment again itself, so the word carries
// nothing. Nothing here goes through a unit, so the word goes on while the units restart under the deployment.
const LOOK_MS = 1_000;

export default defineNitroPlugin((nitro) => {
  let seen: string | null = null;

  // A look still waiting on the user manager is not begun again over it.
  let looking = false;

  const look = async (): Promise<void> => {
    if (looking) return;

    looking = true;

    try {
      const records = readDeployReadings()
        .map(({ unitName, record, writtenAt }) => (record === null ? `${unitName}:none` : `${unitName}:${writtenAt}:${record.ending === null && processAlive(record.pid)}`))
        .join("|");
      const now = `${records}|${(await deployUnitsStanding()).join(",")}`;

      if (seen !== null && now !== seen) publishConsoleEvent("deploy", {});

      seen = now;
    } finally {
      looking = false;
    }
  };

  const timer = setInterval(() => void look(), LOOK_MS);

  nitro.hooks.hook("close", () => clearInterval(timer));
});
