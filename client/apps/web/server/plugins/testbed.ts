import { publishConsoleEvent } from "../utils/console-events";
import { readTestbedLanes } from "../utils/testbed-turns";

// The console's word that the testbed's queue changed (docs/web.md, the TODO panel's section). The queue is read
// every two seconds and every open tab's stream is told `testbed` when any lane's holders or line differ from the
// last reading; the tab reads its rows' testbed lines again itself, so the word carries nothing.
const LOOK_MS = 2_000;

export default defineNitroPlugin((nitro) => {
  let seen: string | null = null;
  let looking = false;

  const look = async (): Promise<void> => {
    // A reading still under way is not overtaken by the next.
    if (looking) return;

    looking = true;

    try {
      const now = JSON.stringify(await readTestbedLanes());

      if (seen !== null && now !== seen) publishConsoleEvent("testbed", {});

      seen = now;
    } finally {
      looking = false;
    }
  };

  const timer = setInterval(() => void look(), LOOK_MS);

  nitro.hooks.hook("close", () => clearInterval(timer));
});
