import { BROWSER_LOGIN_SECONDS, REMEMBER_LOGIN_SECONDS } from "#shared/config";

import type { SessionConfig } from "h3";

// How long the session cookie a write makes is to stand, in the shape the session layer takes it.
//
// Two lives, and the switch on the login screen picks between them. Every seal carries an end of its own
// either way, past which the server refuses it even where a copy of the cookie is presented: a login kept
// only in the browser would be a login the server had no end for.
//
// Left off, the cookie names no expiry, which is what makes it the browser's own session cookie and gone
// the moment the browser closes, and the seal alone carries the browser-session span. The span is handed
// to the seal rather than as the session's age, since the session layer writes an age onto the cookie as
// well and would turn it into one that outlives the browser.
//
// Switched on, the span is named from the moment of the write, so the login survives the browser closing
// and reopening, and stops on its own once the span passes with no write after it. The span does two jobs
// at once, which is why it is one number rather than two: the cookie is written to expire that far from
// now, and the seal itself carries the same expiry. The cookie's expiry is named outright rather than left
// to the session layer, which would count it from when the session was first made and so never let it
// slide.
//
// It is asked for at every place that writes the session, not only at the login, because the session
// is resealed whenever it is written and a write that says nothing turns a kept login back into a
// browser-session one, and a browser-session one into a seal with no end.
export type SessionLife = Pick<SessionConfig, "maxAge" | "seal"> & { cookie?: { expires: Date } };

export function sessionLife(remember: boolean, now: number = Date.now()): SessionLife {
  // The session layer lays the seal options it is handed over its own defaults, so the end alone is named; its
  // type asks for every option.
  return remember
    ? { maxAge: REMEMBER_LOGIN_SECONDS, cookie: { expires: new Date(now + REMEMBER_LOGIN_SECONDS * 1000) } }
    : { seal: { ttl: BROWSER_LOGIN_SECONDS * 1000 } as SessionConfig["seal"] };
}

// Whether a session now standing was one the reader asked to keep. Anything that is not the switch
// having been on reads as off, so a session written before this existed is a browser-session login.
export function sessionRemembers(session: { remember?: unknown }): boolean {
  return session.remember === true;
}

// How often a kept login is resealed while it is being used. Each reseal moves the end of the span
// to a full span from then; resealing on every request would put a new cookie on every answer the
// console fetches for no difference anyone could measure against days.
export const SESSION_SLIDE_SECONDS = 60;

// Whether the request carrying this session should reseal it so its span counts again from now. Only
// a kept login slides — a browser-session one has no span to move — and only once the last write is
// older than the slide interval. The last write is the slide's own mark where there is one and the
// login otherwise.
export function sessionWantsSlide(session: { user?: unknown; remember?: unknown; loggedInAt?: unknown; touchedAt?: unknown }, now: number = Date.now()): boolean {
  if (session.user === undefined || !sessionRemembers(session)) {
    return false;
  }

  const last = typeof session.touchedAt === "number" ? session.touchedAt : typeof session.loggedInAt === "number" ? session.loggedInAt : 0;

  return now - last >= SESSION_SLIDE_SECONDS * 1000;
}

// Whether a session has stood longer than its span, whatever its seal carries. A kept login counts from its
// last reseal and a browser-session one from the login, as the seal's own end does; a session that names
// neither has no start to count from and is past its span. A seal written with no end of its own is held to
// the same span by this.
export function sessionLapsed(session: { remember?: unknown; loggedInAt?: unknown; touchedAt?: unknown }, now: number = Date.now()): boolean {
  const remembers = sessionRemembers(session);
  const since = remembers && typeof session.touchedAt === "number" ? session.touchedAt : session.loggedInAt;

  if (typeof since !== "number") {
    return true;
  }

  return now - since > (remembers ? REMEMBER_LOGIN_SECONDS : BROWSER_LOGIN_SECONDS) * 1000;
}
