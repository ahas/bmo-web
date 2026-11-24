import { getRequestHeader, getRequestURL } from "h3";
import { joinURL } from "ufo";

import { AccountRefusal, AccountServiceDown, sessionUser, userNode, userOf } from "./account-service";
import { HeldRefusal } from "./account-security";
import { followPersonName } from "./account-standing";
import { browserAddress, forgetSession } from "./accounts";
import { settleMachine, standPersonNode } from "./person-node";
import { sessionLife, sessionRemembers } from "./session-life";
import { wording } from "#shared/wording";

import type { Browser, SignInAnswer } from "./account-security";
import type { H3Event } from "h3";

// The console's half of the sign-in (docs/web.md, 「Access」; docs/accounts.md, 「Signing in」): the browser handed
// to the account service by its address and its user agent, the browser remembered for the second factor kept in a
// cookie of this app's own, the session the service made taken into this app's seal, and the service's refusals said
// in the pack's words.

/** The cookie a browser remembered for the second factor is kept in. */
export const DEVICE_COOKIE = "bmo.device";

/** How long a browser stays remembered, the service's own span. */
const DEVICE_SECONDS = 30 * 24 * 60 * 60;

/** The browser a request came from. */
export function browserOf(event: H3Event): Browser {
  return { address: browserAddress(event), userAgent: getRequestHeader(event, "user-agent") ?? "" };
}

/** The token of the browser remembered for the second factor, where this browser holds one. */
export function rememberedDevice(event: H3Event): string | null {
  const token = getCookie(event, DEVICE_COOKIE) ?? "";

  return token === "" ? null : token;
}

/** A browser remembered for the second factor, its token kept where no script reads it. */
export function rememberDevice(event: H3Event, token: string): void {
  setCookie(event, DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getRequestURL(event, { xForwardedProto: true }).protocol === "https:",
    path: "/",
    maxAge: DEVICE_SECONDS
  });
}

/**
 * The console's public address a link is written under: the one its settings name, and, where `ownAddress` allows
 * it, the address the request reached where none is named. A link asked by nobody signed in is written under the
 * named address alone, since the address a request reached is the asker's to choose.
 */
export function linkBase(event: H3Event, ownAddress: boolean): string | null {
  const configured = String(useRuntimeConfig(event).public.consoleAddress ?? "").trim();

  if (configured !== "") return configured.replace(/\/+$/, "");
  if (!ownAddress) return null;

  return joinURL(getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin, useRuntimeConfig(event).app.baseURL).replace(/\/+$/, "");
}

// The service's codes a sign-in answers, each with the pack's key for its sentence.
const SIGN_IN_CODES: Readonly<Record<string, string>> = {
  "wrong-credentials": "app.error.wrong_credentials",
  "account-disabled": "security.error.disabled",
  "wrong-code": "security.error.wrong_code",
  "ticket-gone": "security.error.ticket_gone",
  "weak-password": "security.error.weak_password",
  "link-gone": "security.message.link_gone",
  "no-email": "security.error.no_email",
  "mail-unset": "security.message.mail_unset",
  "second-factor-required": "security.error.required",
  "wrong-password": "security.error.wrong_password",
  "own-account": "security.error.own_account",
  left: "security.error.left",
  "bad-mail": "security.error.bad_mail",
  forbidden: "security.error.forbidden",
  "no-session": "security.error.failed"
};

/** A refusal or failure of the account service, said in the pack's words; a wait said with its seconds or minutes. */
export function securityFailure(error: unknown): Error {
  if (error instanceof HeldRefusal) {
    return error.code === "locked"
      ? fail(423, wording("security.error.locked", { minutes: Math.max(1, Math.ceil(error.seconds / 60)) }))
      : fail(429, wording("security.error.throttled", { seconds: error.seconds }));
  }

  if (error instanceof AccountRefusal) {
    if (error.code === "mail-failed") return fail(502, wording("security.error.mail_failed", { reason: error.detail }));

    const key = SIGN_IN_CODES[error.code];

    return fail(error.status, wording(key ?? "security.error.failed"));
  }

  if (error instanceof AccountServiceDown) return fail(503, wording("app.error.accounts_down"));

  if (error instanceof Error && "statusCode" in error) return error;

  return fail(500, wording("security.error.failed"));
}

/**
 * The session a sign-in made taken into this app's seal, as the console has always held a sumida session: an account
 * bound to a machine is let in only while the hub holds it, and the person's BMO follows their name.
 */
export async function sealSignIn(event: H3Event, signed: SignInAnswer, remember: boolean): Promise<void> {
  const sid = signed.cookie;

  if (sid === null) throw fail(401, wording("app.error.wrong_credentials"));

  const address = browserAddress(event);
  const session = await sessionUser(sid, address);
  const user = session === null ? null : await userOf(session.id);

  if (session === null || user === null) throw fail(401, wording("app.error.wrong_credentials"));

  // An account bound to a machine is used only while the hub holds that machine (docs/accounts.md, 「Invitations and
  // a person's machine」).
  if (!user.administrator) {
    const node = await userNode(user.id);

    if (node.agent !== undefined && !node.attached) {
      throw fail(403, wording("app.error.machine_gone"));
    }

    // A machine the administrator bound the account to is proven, and set as its node, at the first sign-in after it
    // attaches; nobody reads a refusal here, so it goes to the log.
    if (typeof node.agent === "string" && (node.provenAt ?? null) === null) {
      await settleMachine(user.id).catch((error: unknown) => console.error(`account ${user.id}: its machine could not be settled: ${String(error)}`));
    } else if (typeof node.agent === "string") {
      // Every sign-in sets the node again, so one the node service listed late, past its round of asks, lands now.
      void standPersonNode(user.id).catch((error: unknown) => console.error(`account ${user.id}: its node could not be set: ${String(error)}`));
    }
  }

  void followPersonName(Number(user.id)).catch((error: unknown) => console.error(`account ${user.id}: its BMO could not follow its name: ${String(error)}`));

  const fullName = user.fullName === "" ? {} : { fullName: user.fullName };

  await setUserSession(
    event,
    { user: { name: session.name, id: Number(user.id), ...fullName }, sid, administrator: user.administrator, loggedInAt: Date.now(), remember },
    sessionLife(remember)
  );
}

/** The seal's session replaced by the fresh one the service answered for this device, everything else kept. */
export async function sealFreshSession(event: H3Event, fresh: string): Promise<void> {
  const session = await getUserSession(event);

  if (session.user === undefined || session.sid === undefined) return;

  forgetSession(session.sid);

  const remember = sessionRemembers(session);

  await replaceUserSession(
    event,
    {
      user: session.user,
      sid: fresh,
      administrator: session.administrator === true,
      loggedInAt: session.loggedInAt ?? Date.now(),
      remember,
      ...(session.touchedAt === undefined ? {} : { touchedAt: session.touchedAt })
    },
    sessionLife(remember)
  );
}
