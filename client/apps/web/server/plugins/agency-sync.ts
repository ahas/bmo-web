import { AGENCY_SYNC_MS } from "#shared/config";

import { syncAgency } from "../utils/agency-sync";

// The agency's view of the organisation kept up to date (docs/web.md, 「The agency's organisation」): written as the
// console starts, then on the timer, a run that fails said in the log and tried again at the next.
export default defineNitroPlugin(() => {
  const run = () =>
    void syncAgency().catch((error: unknown) => {
      console.error(`the agency's organisation was not written: ${String(error)}`);
    });

  setTimeout(run, 5_000);
  setInterval(run, AGENCY_SYNC_MS);
});
