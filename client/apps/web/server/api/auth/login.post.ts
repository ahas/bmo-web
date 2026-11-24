import { signInWith } from "../../utils/account-security";
import { browserOf, rememberedDevice, sealSignIn, securityFailure } from "../../utils/sign-in";

import { wording } from "#shared/wording";

import type { AccountUser } from "#shared/types";

interface LoginBody {
  name?: unknown;
  password?: unknown;
  remember?: unknown;
}

/** What a sign-in answers: the user signed in, or the ticket a code is asked with; and whether to lead to enrolment. */
export interface LoginAnswer {
  user?: AccountUser;
  ticket?: string;
  enrol?: boolean;
}

export default defineEventHandler(async (event): Promise<LoginAnswer> => {
  const body = await readBody<LoginBody>(event);
  const name = normalizeName(body?.name);
  const password = normalizePassword(body?.password);
  // Keeping the login is off unless the switch was on, so a request that says nothing about it —
  // an older screen, a road taken by hand — gets the browser-session login rather than the kept one.
  const remember = body?.remember === true;

  if (name === null || password === null) {
    throw fail(401, wording("app.error.wrong_credentials"));
  }

  const model = await consoleModel();

  // On the multi-user model the sign-in is the account service's, and its session is held inside
  // this console's own seal (docs/web.md, 「Access」); a service that does not answer signs nobody in.
  if (model === "down") {
    throw fail(503, wording("app.error.accounts_down"));
  }

  if (model === "on") {
    let signed;

    try {
      signed = await signInWith(name, password, rememberedDevice(event), browserOf(event));
    } catch (error) {
      throw securityFailure(error);
    }

    // The password matched and the account asks a code: the ticket goes back for the code to finish with.
    if (signed.answer.outcome === "second-factor") return { ticket: signed.answer.ticket ?? "" };

    await sealSignIn(event, signed, remember);

    return { user: { name }, enrol: signed.answer.enrol === true };
  }

  const user = await findWebUser(name);

  if (!(await checkPassword(user, password))) {
    throw fail(401, wording("app.error.wrong_credentials"));
  }

  await setUserSession(event, { user: { name }, loggedInAt: Date.now(), remember }, sessionLife(remember));

  return { user: { name } };
});
