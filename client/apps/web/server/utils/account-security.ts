// Account security as the console reaches it on the account service (docs/accounts.md, 「Account security」;
// docs/boundary.md, 「Account security」): the sign-in with its second factor, a password set again by a link, an
// email's verification, the second factor's enrolment, the devices a person ends, the record of tries, the
// administrator's and a head's acts on an account, and the system mail. The service decides; this module asks it
// through the client generated from its OpenAPI document and reads its answers into the console's shapes.

import {
  AccountRefusal,
  accountAnswered as answered,
  accountClientOf as clientOf,
  accountRefusalOf as refusalOf,
  accountSent as sent,
  accountUserPath as userPath
} from "./account-service";

import type { ProfileCaller, ServiceOptions } from "./account-service";
import type {
  AccountSecurity,
  Devices,
  Enrolment,
  RecoveryCodes,
  ResetMade,
  SignedIn,
  SignInTries,
  SystemMail
} from "@web/server-client";

/** The browser a sign-in or a fresh session is made for: its address and its user agent. */
export interface Browser {
  address: string;
  userAgent: string;
}

/** A refusal that names how long to wait, as a throttled or a locked sign-in answers. */
export class HeldRefusal extends AccountRefusal {
  constructor(
    status: number,
    code: string,
    detail: string,
    readonly seconds: number
  ) {
    super(status, code, detail);
  }
}

function browserHeaders(browser: Browser): { "X-Real-IP": string; "User-Agent": string } {
  return { "X-Real-IP": browser.address, "User-Agent": browser.userAgent };
}

/** The session cookie an answer set, as `name=value`, or null. */
function cookieOf(response: Response): string | null {
  const cookie = response.headers.get("set-cookie")?.split(";")[0]?.trim() ?? "";

  return cookie === "" ? null : cookie;
}

/** The value of a session cookie held as `name=value`, which `Session-Id` names. */
export function sessionValue(cookie: string): string {
  const at = cookie.indexOf("=");

  return at < 0 ? cookie : cookie.slice(at + 1);
}

/** A sign-in's answer with the session cookie it set, where it set one. */
export interface SignInAnswer {
  answer: SignedIn;
  cookie: string | null;
}

// A sign-in answer read, a throttled or locked one refused with its wait.
function signInRead(reply: { data?: SignedIn; error?: Parameters<typeof refusalOf>[1]; response: Response }): SignInAnswer {
  if (!reply.response.ok) {
    const refusal = refusalOf(reply.response, reply.error);
    const seconds = Number(reply.response.headers.get("retry-after") ?? "");

    if (Number.isFinite(seconds) && seconds > 0) throw new HeldRefusal(refusal.status, refusal.code, refusal.detail, seconds);

    throw refusal;
  }

  if (reply.data === undefined) throw new AccountRefusal(reply.response.status, "failed", "the sign-in answered with nothing");

  return { answer: reply.data, cookie: cookieOf(reply.response) };
}

/** A sign-in with a login and a password, and the token of a browser remembered for the second factor. */
export async function signInWith(login: string, password: string, deviceToken: string | null, browser: Browser, options: ServiceOptions = {}): Promise<SignInAnswer> {
  const reply = await sent(
    options,
    clientOf(options).POST("/sign-ins", {
      params: { header: browserHeaders(browser) },
      body: { login, password, deviceToken }
    })
  );

  return signInRead(reply);
}

/** A sign-in finished with a code. */
export async function signInWithCode(ticket: string, code: string, remember: boolean, browser: Browser, options: ServiceOptions = {}): Promise<SignInAnswer> {
  const reply = await sent(
    options,
    clientOf(options).POST("/sign-ins/second-factor", { params: { header: browserHeaders(browser) }, body: { ticket, code, remember } })
  );

  return signInRead(reply);
}

/** A reset link asked from the login screen; the service answers the same whatever was asked. */
export async function askReset(who: string, linkBase: string, address: string, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(options, clientOf(options).POST("/password-resets", { params: { header: { "X-Real-IP": address } }, body: { who, linkBase } }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** The login a reset link stands for, or null where it is used or past its time. */
export async function resetLogin(token: string, options: ServiceOptions = {}): Promise<string | null> {
  const reply = await sent(options, clientOf(options).GET("/password-resets/{token}", { params: { path: { token } } }));

  if (reply.response.status === 404) return null;

  return answered(reply).login;
}

/** A new password set by a reset link. */
export async function setPasswordByLink(token: string, password: string, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(options, clientOf(options).POST("/password-resets/{token}", { params: { path: { token } }, body: { password } }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** An email verified by its link: the address. */
export async function verifyByLink(token: string, options: ServiceOptions = {}): Promise<string> {
  const reply = await sent(options, clientOf(options).POST("/email-verifications/{token}", { params: { path: { token } } }));

  return answered(reply).address;
}

/** A verification link mailed to a user's email. */
export async function mailVerification(user: number, linkBase: string, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(
    options,
    clientOf(options).POST("/users/{user}/email/verification", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } }, body: { linkBase } })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** What stands of an account's security. */
export async function accountSecurity(user: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<AccountSecurity> {
  return answered(
    await sent(options, clientOf(options).GET("/users/{user}/security", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } } }))
  );
}

/** A second factor waiting to be confirmed. */
export async function enrolFactor(user: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<Enrolment> {
  return answered(
    await sent(options, clientOf(options).POST("/users/{user}/second-factor", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } } }))
  );
}

/** The waiting factor confirmed: its recovery codes. */
export async function confirmFactor(user: number, code: string, caller: ProfileCaller, options: ServiceOptions = {}): Promise<string[]> {
  const codes: RecoveryCodes = answered(
    await sent(
      options,
      clientOf(options).POST("/users/{user}/second-factor/confirm", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } }, body: { code } })
    )
  );

  return codes.recoveryCodes;
}

/** Ten new recovery codes. */
export async function freshCodes(user: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<string[]> {
  const codes: RecoveryCodes = answered(
    await sent(options, clientOf(options).POST("/users/{user}/recovery-codes", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } } }))
  );

  return codes.recoveryCodes;
}

/** The second factor turned off with the password. */
export async function factorOff(user: number, password: string, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(
    options,
    clientOf(options).POST("/users/{user}/second-factor/off", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } }, body: { password } })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** A person's second factor reset by the administrator or a head. */
export async function resetFactor(user: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(options, clientOf(options).DELETE("/users/{user}/second-factor", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } } }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** The account's devices, the one `cookie` names marked. */
export async function accountDevices(user: number, cookie: string | null, caller: ProfileCaller, options: ServiceOptions = {}): Promise<Devices> {
  return answered(
    await sent(
      options,
      clientOf(options).GET("/users/{user}/devices", {
        params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key, ...(cookie === null ? {} : { "Session-Id": sessionValue(cookie) }) } }
      })
    )
  );
}

/** One device ended. */
export async function endDevice(user: number, device: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(
    options,
    clientOf(options).DELETE("/users/{user}/devices/{device}", { params: { path: { user: userPath(user), device }, header: { "Owner-Key": caller.key } } })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** Every other device ended: the fresh session cookie for this one. */
export async function endOtherDevices(user: number, cookie: string, browser: Browser, caller: ProfileCaller, options: ServiceOptions = {}): Promise<string> {
  const reply = await sent(
    options,
    clientOf(options).POST("/users/{user}/devices/others", {
      params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key, "Session-Id": sessionValue(cookie), ...browserHeaders(browser) } }
    })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);

  const fresh = cookieOf(reply.response);

  if (fresh === null) throw new AccountRefusal(reply.response.status, "failed", "the service answered no fresh session");

  return fresh;
}

/**
 * A user's password changed on the strength of the current one, every other session ending: false where the
 * current one does not match, else the fresh session cookie answered for the caller's own, null where none was named.
 */
export async function changePasswordKeeping(
  user: number,
  current: string,
  next: string,
  cookie: string | null,
  browser: Browser,
  options: ServiceOptions = {}
): Promise<false | { cookie: string | null }> {
  const reply = await sent(
    options,
    clientOf(options).POST("/users/{user}/password", {
      params: { path: { user: userPath(user) }, header: { ...(cookie === null ? {} : { "Session-Id": sessionValue(cookie) }), ...browserHeaders(browser) } },
      body: { current, next }
    })
  );

  if (reply.response.ok) return { cookie: cookieOf(reply.response) };
  if (reply.error?.code === "wrong-password") return false;

  throw refusalOf(reply.response, reply.error);
}

/** The account's newest sign-ins tried. */
export async function triesOf(user: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<SignInTries> {
  return answered(await sent(options, clientOf(options).GET("/users/{user}/sign-ins", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } } })));
}

/** A password reset made for a person. */
export async function resetPassword(user: number, linkBase: string, caller: ProfileCaller, options: ServiceOptions = {}): Promise<ResetMade> {
  return answered(
    await sent(
      options,
      clientOf(options).POST("/users/{user}/password-reset", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } }, body: { linkBase } })
    )
  );
}

/** An account disabled or enabled. */
export async function setEnabled(user: number, enabled: boolean, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(
    options,
    clientOf(options).PUT("/users/{user}/enabled", { params: { path: { user: userPath(user) }, header: { "Owner-Key": caller.key } }, body: { enabled } })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** The system mail as set. */
export async function systemMail(caller: ProfileCaller, options: ServiceOptions = {}): Promise<SystemMail> {
  return answered(await sent(options, clientOf(options).GET("/mail", { params: { header: { "Owner-Key": caller.key } } })));
}

/** The system mail written whole. */
export async function setSystemMail(
  mail: { server: string | null; from: string; fromName: string; secret: string | null },
  caller: ProfileCaller,
  options: ServiceOptions = {}
): Promise<SystemMail> {
  return answered(await sent(options, clientOf(options).PUT("/mail", { params: { header: { "Owner-Key": caller.key } }, body: mail })));
}

/** One test mail sent. */
export async function testSystemMail(to: string, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(options, clientOf(options).POST("/mail/test", { params: { header: { "Owner-Key": caller.key } }, body: { to } }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}
