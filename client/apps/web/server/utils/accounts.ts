import { getRequestIP } from "h3";

import { AccountServiceDown, modelState, sessionUser } from "./account-service";
import { wording } from "#shared/wording";

import { useWebSql } from "./db";

import type { H3Event } from "h3";

// The signed-in user as the multi-user model reads them (docs/accounts.md; docs/web.md, 「Access」).
// Before the model is in force the console's own accounts are the administrator's, as they always were;
// once it is, a sign-in is sumida's, its session is held inside the console's own seal and asked about on
// every request, and a seal written before the model stays readable as the administrator's own.

/** Where the model stands for the console: `off` before the data move, `on` once it is in force, `down` where the server does not answer. */
export type ConsoleModel = "off" | "on" | "down";

// How long one reading of where the model stands holds.
const standingHoldMs = 15_000;
let standing: { at: number; model: ConsoleModel } | null = null;

export async function consoleModel(now: number = Date.now()): Promise<ConsoleModel> {
  if (standing !== null && now - standing.at < standingHoldMs) return standing.model;

  const state = await modelState().catch(() => null);
  const model: ConsoleModel = state === null ? "down" : state.inForce ? "on" : "off";

  standing = { at: now, model };

  return model;
}

/** The address of the browser a request came from, which a ban on the service reads. */
export function browserAddress(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? "127.0.0.1";
}

/** Who is signed in: their name, their user where the model names one, and whether they are the administrator. */
export interface SignedIn {
  name: string;
  id: number | null;
  administrator: boolean;
}

/** The user a console account's name is on the model, read off sumida's own rows in the server's database. */
export async function userNamed(name: string): Promise<number | null> {
  const row = await useWebSql().get("SELECT id FROM users WHERE username = $1", name) as { id: number } | null;

  return row === null ? null : Number(row.id);
}

/** The signed-in user of a request, refused as anywhere where nobody is signed in. */
export async function signedInUser(event: H3Event): Promise<SignedIn> {
  return await signedInOf(await requireUserSession(event));
}

/** Who a session's seal says is signed in, read the same way wherever the seal is opened. */
export async function signedInOf(session: { sid?: string; administrator?: boolean; user: { name: string; id?: number } }): Promise<SignedIn> {
  if (session.sid !== undefined) {
    return { name: session.user.name, id: session.user.id ?? null, administrator: session.administrator === true };
  }

  // A console login: the administrator's before the model, and on the model a seal written before it,
  // which only the administrator's own account could have signed.
  if (await consoleModel() !== "on") return { name: session.user.name, id: null, administrator: true };

  return { name: session.user.name, id: await userNamed(session.user.name), administrator: true };
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

/** A session the console signed out of, forgotten at once. */
export function forgetSession(cookie: string): void {
  asked.delete(cookie);
}
