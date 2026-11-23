import { signedInUser } from "../../utils/accounts";
import { agentLoginNeeded } from "../../utils/agent-login";

// Whether the signed-in person must set up a login of their own before they start (docs/web.md, 「The join page」):
// their runs only their own supply can carry, and they hold none that is on.
export default defineEventHandler(async (event): Promise<{ needed: boolean }> => {
  const signed = await signedInUser(event);

  return { needed: signed.administrator || signed.id === null ? false : await agentLoginNeeded(signed.id) };
});
