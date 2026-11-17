import { presenceSwitches } from "../../utils/presence-switches";

// Whether the logged-in account shows its presence (docs/web.md, 「Presence and typing」): on unless it turned it off.
// A console login standing before the account model has no account, and shows nothing to turn off.
export default defineEventHandler(async (event): Promise<{ shown: boolean }> => {
  const signed = await signedInUser(event);

  return { shown: signed.id === null ? true : await presenceSwitches.shown(signed.id) };
});
