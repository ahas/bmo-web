import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { createApp, eventHandler, toWebHandler, unsealSession, useSession } from "h3";

import { BROWSER_LOGIN_HOURS, BROWSER_LOGIN_SECONDS, REMEMBER_LOGIN_DAYS, REMEMBER_LOGIN_SECONDS } from "../../../apps/web/shared/config";
import { SESSION_SLIDE_SECONDS, sessionLapsed, sessionLife, sessionRemembers, sessionWantsSlide } from "../../../apps/web/server/utils/session-life";

// The two lives a login can have, and what tells them apart. What they are held to: the switch
// off names no expiry for the cookie, which is what leaves it the browser's own session, and an
// end of 12 hours for the seal; the switch on names a span from the moment of the write, which is
// both the cookie's expiry and the expiry the seal carries; a kept login in use is resealed so the
// span counts from the last visit; and a seal older than its span is past it whatever it carries.

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "a-session-password-long-enough-for-iron-seals";

afterEach(() => {
  setSystemTime();
});

describe("sessionLife", () => {
  test("a login not kept names no age and no cookie expiry, so the cookie dies with the browser", () => {
    expect("maxAge" in sessionLife(false)).toBe(false);
    expect("cookie" in sessionLife(false)).toBe(false);
  });

  test("a login not kept still names an end for the seal, 12 hours on", () => {
    expect(sessionLife(false)).toEqual({ seal: { ttl: BROWSER_LOGIN_SECONDS * 1000 } } as ReturnType<typeof sessionLife>);
    expect(BROWSER_LOGIN_HOURS).toBe(12);
    expect(BROWSER_LOGIN_SECONDS).toBe(12 * 60 * 60);
  });

  test("a kept login names the span, and the cookie's expiry a span from the write", () => {
    expect(sessionLife(true, 1000)).toEqual({ maxAge: REMEMBER_LOGIN_SECONDS, cookie: { expires: new Date(1000 + REMEMBER_LOGIN_SECONDS * 1000) } });
  });

  test("the span is seven days", () => {
    expect(REMEMBER_LOGIN_DAYS).toBe(7);
    expect(REMEMBER_LOGIN_SECONDS).toBe(7 * 24 * 60 * 60);
  });
});

describe("sessionRemembers", () => {
  test("only the switch having been on reads as kept", () => {
    expect(sessionRemembers({ remember: true })).toBe(true);
    expect(sessionRemembers({ remember: false })).toBe(false);
  });

  test("a session written before this existed is not a kept one", () => {
    expect(sessionRemembers({})).toBe(false);
    expect(sessionRemembers({ remember: "true" })).toBe(false);
  });
});

describe("sessionWantsSlide", () => {
  const user = { name: "owner" };
  const interval = SESSION_SLIDE_SECONDS * 1000;

  test("a kept login slides once the interval since the login has passed", () => {
    expect(sessionWantsSlide({ user, remember: true, loggedInAt: 0 }, interval)).toBe(true);
    expect(sessionWantsSlide({ user, remember: true, loggedInAt: 0 }, interval - 1)).toBe(false);
  });

  test("the last slide, not the login, is what the interval counts from", () => {
    expect(sessionWantsSlide({ user, remember: true, loggedInAt: 0, touchedAt: 5 * DAY }, 5 * DAY + interval - 1)).toBe(false);
    expect(sessionWantsSlide({ user, remember: true, loggedInAt: 0, touchedAt: 5 * DAY }, 5 * DAY + interval)).toBe(true);
  });

  test("a browser-session login and an empty session never slide", () => {
    expect(sessionWantsSlide({ user, remember: false, loggedInAt: 0 }, 10 * DAY)).toBe(false);
    expect(sessionWantsSlide({ remember: true, loggedInAt: 0 }, 10 * DAY)).toBe(false);
  });
});

describe("sessionLapsed", () => {
  const HOUR = 60 * 60 * 1000;

  test("a login not kept is past its span 12 hours after the login, however recent its last visit", () => {
    expect(sessionLapsed({ remember: false, loggedInAt: 0, touchedAt: 11 * HOUR }, 12 * HOUR)).toBe(false);
    expect(sessionLapsed({ remember: false, loggedInAt: 0, touchedAt: 11 * HOUR }, 12 * HOUR + 1)).toBe(true);
  });

  test("a kept login is past its span 7 days after its last reseal, or the login where it has none", () => {
    expect(sessionLapsed({ remember: true, loggedInAt: 0, touchedAt: 5 * DAY }, 12 * DAY)).toBe(false);
    expect(sessionLapsed({ remember: true, loggedInAt: 0, touchedAt: 5 * DAY }, 12 * DAY + 1)).toBe(true);
    expect(sessionLapsed({ remember: true, loggedInAt: 0 }, 7 * DAY + 1)).toBe(true);
  });

  test("a session that names no login is past its span", () => {
    expect(sessionLapsed({}, 0)).toBe(true);
    expect(sessionLapsed({ remember: true, loggedInAt: "0" }, 0)).toBe(true);
  });
});

// The life handed to the real session layer, so what is held is what the browser and the server
// actually get: the cookie's Expires and the seal's own expiry.
async function write(remember = true): Promise<string> {
  const app = createApp();

  app.use(
    eventHandler(async (event) => {
      const session = await useSession(event, { password: PASSWORD, name: "s", ...sessionLife(remember) });

      await session.update({ remember });
      return "ok";
    })
  );

  const response = await toWebHandler(app)(new Request("http://localhost/"));

  return response.headers.get("set-cookie") ?? "";
}

function seal(cookie: string): string {
  return decodeURIComponent(/s=([^;]+)/.exec(cookie)?.[1] ?? "");
}

function expires(cookie: string): number {
  return Date.parse(/Expires=([^;]+)/i.exec(cookie)?.[1] ?? "");
}

async function opens(sealed: string): Promise<boolean> {
  // The read side names no age, as every reader of the session in the console does; the seal
  // refuses on its own expiry.
  return unsealSession({} as never, { password: PASSWORD }, sealed).then(
    () => true,
    () => false
  );
}

describe("a session not kept written through the session layer", () => {
  test("sets a cookie with no expiry and no age, the browser's own session", async () => {
    const cookie = await write(false);

    expect(cookie).not.toMatch(/Expires=/i);
    expect(cookie).not.toMatch(/Max-Age=/i);
  });

  test("the server refuses its seal once 12 hours have passed since it was written, and not before", async () => {
    setSystemTime(new Date(Date.UTC(2026, 0, 1)));
    const sealed = seal(await write(false));

    setSystemTime(new Date(Date.UTC(2026, 0, 1) + BROWSER_LOGIN_SECONDS * 1000 - 60_000));
    expect(await opens(sealed)).toBe(true);

    setSystemTime(new Date(Date.UTC(2026, 0, 1) + BROWSER_LOGIN_SECONDS * 1000 + 60_000));
    expect(await opens(sealed)).toBe(false);
  });
});

describe("a kept session written through the session layer", () => {
  test("a write sets the cookie to expire a span from that write, and again from the next", async () => {
    setSystemTime(new Date(Date.UTC(2026, 0, 1)));
    const first = await write();

    expect(expires(first)).toBe(Date.UTC(2026, 0, 1) + REMEMBER_LOGIN_SECONDS * 1000);

    setSystemTime(new Date(Date.UTC(2026, 0, 4)));
    const second = await write();

    expect(expires(second)).toBe(Date.UTC(2026, 0, 4) + REMEMBER_LOGIN_SECONDS * 1000);
  });

  test("the server refuses a seal once a span has passed since it was written, and not before", async () => {
    setSystemTime(new Date(Date.UTC(2026, 0, 1)));
    const sealed = seal(await write());

    setSystemTime(new Date(Date.UTC(2026, 0, 1) + REMEMBER_LOGIN_SECONDS * 1000 - 60_000));
    expect(await opens(sealed)).toBe(true);

    setSystemTime(new Date(Date.UTC(2026, 0, 1) + REMEMBER_LOGIN_SECONDS * 1000 + 60_000));
    expect(await opens(sealed)).toBe(false);
  });
});
