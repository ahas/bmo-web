import { signInWithCode } from "../../utils/account-security";
import { browserOf, rememberDevice, sealSignIn, securityFailure } from "../../utils/sign-in";

import { wording } from "#shared/wording";

import type { LoginAnswer } from "./login.post";

interface CodeBody {
  ticket?: unknown;
  code?: unknown;
  remember?: unknown;
  rememberDevice?: unknown;
}

// A sign-in finished with a code from the authenticator or a recovery code (docs/web.md, 「Access」): the session the
// service makes taken into the seal, and this browser remembered for 30 days where it was asked.
export default defineEventHandler(async (event): Promise<LoginAnswer> => {
  const body = await readBody<CodeBody>(event);
  const ticket = typeof body?.ticket === "string" ? body.ticket : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (ticket === "" || code === "") throw fail(401, wording("security.error.wrong_code"));

  let signed;

  try {
    signed = await signInWithCode(ticket, code, body?.rememberDevice === true, browserOf(event));
  } catch (error) {
    throw securityFailure(error);
  }

  await sealSignIn(event, signed, body?.remember === true);

  if (typeof signed.answer.deviceToken === "string") rememberDevice(event, signed.answer.deviceToken);

  const session = await getUserSession(event);

  return { user: { name: session.user?.name ?? "" }, enrol: signed.answer.enrol === true };
});
