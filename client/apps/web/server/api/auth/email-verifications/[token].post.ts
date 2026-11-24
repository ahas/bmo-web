import { verifyByLink } from "../../../utils/account-security";
import { securityFailure } from "../../../utils/sign-in";

// An email verified by its link, with no sign-in (docs/web.md, 「Pages with no sign-in」).
export default defineEventHandler(async (event): Promise<{ address: string }> => {
  const token = String(getRouterParam(event, "token") ?? "");

  try {
    return { address: await verifyByLink(token) };
  } catch (error) {
    throw securityFailure(error);
  }
});
