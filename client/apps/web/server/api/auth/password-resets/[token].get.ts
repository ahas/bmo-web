import { resetLogin } from "../../../utils/account-security";
import { securityFailure } from "../../../utils/sign-in";

import { wording } from "#shared/wording";

// Whether a reset link stands, and the login it is for (docs/web.md, 「Pages with no sign-in」).
export default defineEventHandler(async (event): Promise<{ login: string }> => {
  const token = String(getRouterParam(event, "token") ?? "");
  let login: string | null;

  try {
    login = await resetLogin(token);
  } catch (error) {
    throw securityFailure(error);
  }

  if (login === null) throw fail(404, wording("security.message.link_gone"));

  return { login };
});
