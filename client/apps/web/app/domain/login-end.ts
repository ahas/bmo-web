import type { RouteLocationRaw } from "vue-router";

// A login that ends while a tab holds it, and the road to the login screen and back (docs/web.md,
// 「Access」).

/** The pages that stand with no sign-in: a forgotten password asked and set by its link, and an email's link used
 * (docs/web.md, 「Pages with no sign-in」). */
export const NO_SIGN_IN_PAGES: readonly string[] = ["/forgot-password", "/reset-password", "/verify-email"];

/** The login screen, carrying the address to return to and whether a login ended on the way. */
export function loginRoute(from: string, ended: boolean): RouteLocationRaw {
  const query: Record<string, string> = {};

  if (returnPath(from) !== "/") query.to = from;
  if (ended) query.ended = "1";

  return { path: "/login", query };
}

/**
 * Where the next login goes: the address the login screen carries where it is one of this app's own
 * screens, and home otherwise. An address that leaves the app — another host, the login screen
 * itself — is never followed.
 */
export function returnPath(carried: unknown): string {
  if (typeof carried !== "string" || !carried.startsWith("/") || carried.startsWith("//") || carried.startsWith("/\\")) return "/";
  if (carried === "/login" || carried.startsWith("/login?") || carried.startsWith("/login#")) return "/";

  return carried;
}

/** What the tab is to the question: whether it holds a login, how to ask the server, and where it goes. */
export interface LoginTab {
  signedIn: () => boolean;
  // The session as the server reads it: whether it names a user, or null where the server did not say.
  asked: () => Promise<boolean | null>;
  forget: () => void;
  here: () => string;
  go: (to: RouteLocationRaw) => unknown;
}

let tab: LoginTab | null = null;
let asking: Promise<void> | null = null;

/** The tab this page is, handed over once it stands. */
export function holdLoginTab(held: LoginTab | null): void {
  tab = held;
}

/**
 * A call or a stream was refused for the login: the tab asks whether its session still stands, once
 * for a burst of refusals. A session gone sends the tab to the login screen; one still standing, or
 * a server that did not say, leaves it where it is.
 */
export function askWhetherLoginEnded(): Promise<void> {
  asking ??= ask().finally(() => {
    asking = null;
  });

  return asking;
}

async function ask(): Promise<void> {
  const held = tab;

  if (held === null || !held.signedIn()) return;
  if ((await held.asked()) !== false || !held.signedIn()) return;

  held.forget();
  await held.go(loginRoute(held.here(), true));
}
