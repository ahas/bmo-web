import { getRequestHeader } from "h3";

import { AccountServiceDown, modelState, sessionUser, userOf } from "./account-service";
import { isOwnerLogin } from "./owner";
import { sessionLapsed, sessionLife, sessionRemembers } from "./session-life";
import { wording } from "#shared/wording";

import type { H3Event } from "h3";

// The signed-in user as the multi-user model reads them (docs/accounts.md; docs/web.md, 「Access」).
// Before the model is in force the console's own accounts are the administrator's; once it is, a sign-in
// is sumida's, its session is held inside the console's own seal and asked about on every request and
// every socket, and a seal holding no sumida session signs nobody in.

/** Where the model stands for the console: `off` before the data move, `on` once it is in force, `down` where the server does not answer. */
export type ConsoleModel = "off" | "on" | "down";

// How long one reading of where the model stands holds, and for the service it was read from alone: a reading
// of one address says nothing of another.
const standingHoldMs = 15_000;
let standing: { at: number; model: ConsoleModel; address: string } | null = null;

export async function consoleModel(now: number = Date.now()): Promise<ConsoleModel> {
  const address = process.env.WEB_SERVER_ADDRESS ?? "";

  if (standing !== null && standing.address === address && now - standing.at < standingHoldMs) return standing.model;

  const state = await modelState().catch(() => null);
  const model: ConsoleModel = state === null ? "down" : state.inForce ? "on" : "off";

  standing = { at: now, model, address };

  return model;
}

/**
 * The browser's address as the reverse proxy in front of the console names it in `X-Real-IP`, which a ban
 * and the login lockout on the service read (docs/accounts.md, 「sumida's own routes」). `X-Forwarded-For` is
 * never read: its first entries are whatever the browser wrote. Where the proxy named none, the address is
 * the loopback one.
 */
export function proxiedAddress(realIp: string | null | undefined): string {
  const named = realIp?.trim() ?? "";

  return named === "" ? "127.0.0.1" : named;
}

/** The address of the browser a request came from, as `proxiedAddress` reads it. */
export function browserAddress(event: H3Event): string {
  return proxiedAddress(getRequestHeader(event, "x-real-ip"));
}

/** Who is signed in: their name, their user where the model names one, and whether they are the administrator. */
export interface SignedIn {
  name: string;
  id: number | null;
  administrator: boolean;
}

/** The signed-in user of a request, refused as anywhere where nobody is signed in. */
export async function signedInUser(event: H3Event): Promise<SignedIn> {
  return await signedInOf(await requireUserSession(event));
}

/** What a session's seal holds of the one signed in, as every reader of the seal opens it. */
export interface Sealed {
  sid?: string;
  administrator?: boolean;
  user: { name: string; id?: number; fullName?: string };
  remember?: unknown;
  loggedInAt?: unknown;
  touchedAt?: unknown;
}

/** Whether a session's user is a platform administrator, as the account service says; null where it cannot say. */
export type AdministratorStanding = (sid: string, user: number) => Promise<boolean | null>;

/**
 * Who a session's seal says is signed in, read the same way wherever the seal is opened. A seal holding no
 * sumida session is a console login, the administrator's. Whether the seal still stands is `sealState`'s to
 * say, asked before the seal is read: by the session middleware for a request, by the relay for a socket.
 * Whether a sumida login is the administrator is the account service's word each time (docs/web.md, 「Access」):
 * every platform administrator is, whatever the seal recorded at sign-in; where the service cannot say, the
 * seal's own word stands.
 */
export async function signedInOf(session: Sealed, standing: AdministratorStanding = administratorStanding): Promise<SignedIn> {
  if (session.sid !== undefined) {
    const id = session.user.id ?? null;
    const named = id === null ? null : await standing(session.sid, id).catch(() => null);

    return { name: session.user.name, id, administrator: named ?? session.administrator === true };
  }

  return { name: session.user.name, id: null, administrator: true };
}

/**
 * The account a chat service's call is for, as bmo-chat's contract names it: the signed-in person's user id, or none
 * for the owner, whose account is the deployment's own, and for a login the account model names no user for, so the
 * service's own account answers (docs/web.md, the room add's contacts). The owner is a platform administrator, so only
 * an administrator is asked whether they are the owner; any other administrator's call is for their own account.
 */
export async function chatAccountOf(signed: SignedIn): Promise<{ accountId?: number }> {
  if (signed.id === null || (signed.administrator && (await isOwnerLogin(signed)))) return {};

  return { accountId: signed.id };
}

/** The signed-in user where they are the platform administrator; anyone else is refused. */
export async function requireAdministrator(event: H3Event): Promise<SignedIn> {
  const signed = await signedInUser(event);

  if (!signed.administrator) throw fail(403, wording("common.error.administrator_only"));

  return signed;
}

// The sessions asked about lately, so a screen's burst of requests asks the service once.
const sessionHoldMs = 30_000;
const asked = new Map<string, { at: number; user: { id: string; name: string } | null }>();

// What the service said lately of whether a session's user is a platform administrator, held as a session's standing
// is, and for the service and the user it was read of alone.
const standings = new Map<string, { at: number; address: string; user: number; administrator: boolean }>();

/**
 * Whether the account service names a session's user a platform administrator (docs/accounts.md, 「The platform
 * administrators」), asked at most once a window for a session. A service that does not answer, or holds no such
 * user, says nothing: null, held nowhere, and asked again on the next request.
 */
export async function administratorStanding(sid: string, user: number, now: number = Date.now()): Promise<boolean | null> {
  const address = process.env.WEB_SERVER_ADDRESS ?? "";
  const held = standings.get(sid);

  if (held !== undefined && held.address === address && held.user === user && now - held.at < sessionHoldMs) return held.administrator;

  const named = await userOf(user).catch(() => null);

  if (named === null) return null;

  standings.set(sid, { at: now, address, user, administrator: named.administrator });

  return named.administrator;
}

export type SessionState = "stands" | "gone" | "unanswered";

/**
 * Whether the sumida session a seal carries still stands. A session the service says is gone is
 * gone; a service that does not answer is no answer, neither trusted nor taken for an ended session,
 * and is asked again on the next request.
 */
export async function sessionState(cookie: string, address: string, now: number = Date.now()): Promise<SessionState> {
  const held = asked.get(cookie);

  if (held !== undefined && now - held.at < sessionHoldMs) return held.user !== null ? "stands" : "gone";

  let user: { id: string; name: string } | null;

  try {
    user = await sessionUser(cookie, address);
  } catch (error) {
    if (!(error instanceof AccountServiceDown)) throw error;

    return "unanswered";
  }

  asked.set(cookie, { at: now, user });

  return user !== null ? "stands" : "gone";
}

/**
 * Whether the login a seal holds still stands, as a request and a socket both ask it: a seal past its span
 * is gone; one holding a sumida session stands while the service says it does; one holding none stands
 * only while the model is not in force, and a service that cannot say whether it is gives no answer.
 */
export async function sealState(session: Omit<Sealed, "user">, address: string, now: number = Date.now()): Promise<SessionState> {
  if (sessionLapsed(session, now)) return "gone";

  if (session.sid !== undefined) return await sessionState(session.sid, address, now);

  const model = await consoleModel(now);

  return model === "off" ? "stands" : model === "on" ? "gone" : "unanswered";
}

/** A session the console signed out of, forgotten at once. */
export function forgetSession(cookie: string): void {
  asked.delete(cookie);
  standings.delete(cookie);
}

/** The reader's own session written again with the person's name they now read by, empty for none; everything else
 * it holds, its life among it, stands as it was (docs/web.md, 「Settings」, the account section). */
export async function followSessionName(event: H3Event, fullName: string): Promise<void> {
  const session = await getUserSession(event);

  if (session.user === undefined) return;

  const { name, id } = session.user;
  const remember = sessionRemembers(session);

  await replaceUserSession(event, {
    user: { name, ...(id === undefined ? {} : { id }), ...(fullName === "" ? {} : { fullName }) },
    ...(session.sid === undefined ? {} : { sid: session.sid, administrator: session.administrator === true }),
    loggedInAt: session.loggedInAt ?? Date.now(),
    remember,
    ...(session.touchedAt === undefined ? {} : { touchedAt: session.touchedAt })
  }, sessionLife(remember));
}
