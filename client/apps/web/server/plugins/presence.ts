import { WATCH_REPORT_MS } from "#shared/config";

import { listUsers } from "../utils/account-service";
import { takeBackUntold, tellPresenceChanges } from "../utils/console-presence";
import { moveAdministratorKey } from "../utils/owner-key";
import { presenceSwitches } from "../utils/presence-switches";

// The console as a source of its accounts' presence (docs/web.md, 「Presence and typing」): the switches read as this
// server starts, a look every report interval that finds tabs gone silent, and the console's word taken back for every
// account no tab has reported since the start, so no account stands as it was before a restart. The database, the
// receiver and the account service may still be starting when this server does, so each start step waits a moment
// first and is tried again on a growing wait until it goes through.

const FIRST_DELAY_MS = 5_000;
const RETRY_CAP_MS = 300_000;

function untilDone(name: string, step: () => Promise<void>): void {
  let wait = FIRST_DELAY_MS;

  const attempt = (): void => {
    step().catch((error: unknown) => {
      console.warn(`presence: ${name} failed, trying again in ${wait / 1000} s: ${String(error)}`);
      setTimeout(attempt, wait);
      wait = Math.min(wait * 2, RETRY_CAP_MS);
    });
  };

  setTimeout(attempt, FIRST_DELAY_MS);
}

async function takeBackEveryAccount(): Promise<void> {
  const key = await moveAdministratorKey();

  if (key === null) return;

  const users = await listUsers({ key, role: "administrator" });

  await takeBackUntold(users.map((user) => Number(user.user)));
}

export default defineNitroPlugin(() => {
  untilDone("reading the switches", async () => {
    await presenceSwitches.read();
    tellPresenceChanges(Date.now(), true);
  });
  untilDone("taking back the console's word", takeBackEveryAccount);

  setInterval(() => tellPresenceChanges(Date.now(), true), WATCH_REPORT_MS);
});
