import { standRecordIdentities } from "../utils/console-rooms";
import { ownerStanding } from "../utils/owner";

// Every account's identity on the record road, stood and linked once each time this server starts (docs/accounts.md,
// 「Users and senders」), so an account that stood before the record road reads and speaks in the console as one made
// since does; and first the owner's sender linked to the owner's account where it stands linked to none (docs/accounts.md,
// 「The owner's account」), so the owner is his account from the start. The receiver and the account service may still be starting when this server does — a redeploy restarts
// them together — so the pass waits a moment first, and a pass that could not read the accounts at all is tried again
// on a growing wait until one does.

const FIRST_DELAY_MS = 5_000;
const RETRY_CAP_MS = 300_000;

export default defineNitroPlugin(() => {
  let wait = FIRST_DELAY_MS;

  const pass = (): void => {
    ownerStanding()
      .then((owner) => console.log(owner.linked ? `owner's account: user ${owner.account}` : "owner's account: the owner's sender stands linked to none"))
      .then(() => standRecordIdentities())
      .then(
        (stood) => console.log(`record identities: ${stood.linked} linked, ${stood.failed} failed`),
        (error: unknown) => {
          console.warn(`record identities: the accounts could not be read, trying again in ${wait / 1000} s: ${String(error)}`);
          setTimeout(pass, wait);
          wait = Math.min(wait * 2, RETRY_CAP_MS);
        }
      );
  };

  setTimeout(pass, FIRST_DELAY_MS);
});
