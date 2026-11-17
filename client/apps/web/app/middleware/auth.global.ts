import { MEMBER_HOME, MEMBER_LAYOUT, isAdministrator } from "~/domain/access";
import { openScreen, screenAt, screenOpened, sharePath, useConsoleScreens, useScreensReader } from "~/domain/console-screens";
import { standUnavailable, unavailableRoute } from "~/domain/screen-unavailable";
import { loginRoute, returnPath } from "~/domain/login-end";
import { ensureSectionAccess } from "~/domain/section-access";
import { screensWithBundles } from "~/domain/screens";
import { homeFor, inConsoleSections, screenMayRead } from "#shared/sections";

// Nothing but the login page is readable without a session; the API refuses on its own side. The
// login screen carries the address asked for, so the next login returns there, and says the login
// ended where a page drawn on the server found its session gone (docs/web.md, 「Access」).
export default defineNuxtRouteMiddleware(async (to) => {
  const screens = useConsoleScreens().value;
  // The screen a unit brings that the address stands under, among those the reader may open; its bundle is loaded
  // the first time the address is opened, and the address asked again so it finds the bundle's route (docs/web.md,
  // 「Screens a unit brings」).
  const screen = screenAt(screens, to.path);

  if (import.meta.client && screen !== null && !screenOpened(screen)) {
    const router = useRouter();
    const reader = useScreensReader();
    const loaded = await openScreen(router, screen, () => reader(to.path)).then(() => true, () => false);

    if (loaded) return navigateTo(to.fullPath, { replace: true });

    // A module that would not load leaves the console's own page at the address, never nothing.
    if (!router.hasRoute(unavailableRoute(screen))) {
      standUnavailable(router, screen);

      return navigateTo(to.fullPath, { replace: true });
    }
  }

  // A share link is the one road with no session behind it. Each bundle's share page stands below its
  // own screen path, and the page reaches what it opens by the token in the address alone; the relay
  // lets that one read through without a session.
  if (sharePath(screens, to.path)) return;

  // An invitation's link is opened by a person who has no account yet.
  if (to.path.startsWith("/join/")) return;

  const { loggedIn, session } = useUserSession();

  if (to.path === "/login") {
    return loggedIn.value ? navigateTo(returnPath(to.query.to)) : undefined;
  }

  if (!loggedIn.value) return navigateTo(loginRoute(to.fullPath, import.meta.server && useRequestEvent()?.context.sessionEnded === true));

  // A page every signed-in login opens as it stands, the desktop pairing page among them (docs/web.md, 「The desktop
  // pairing page」): no section is asked and no shell is put around it.
  if (to.meta.everyLogin === true) return;

  if (isAdministrator(session.value)) return;

  // A member opens only the sections their permission opens, each in the member's own shell; any other
  // address would open onto routes that answer them as absent (docs/web.md, 「Access」). The account service
  // holds the permission; a console that cannot read it falls back to the screens a member has always had.
  const access = await ensureSectionAccess().catch(() => null);

  // A person's own BMO's page opens to them whatever sections they hold (docs/web.md, 「Access」).
  if (await ownAgentPage(to.path)) {
    setPageLayout(MEMBER_LAYOUT);

    return;
  }

  if (access !== null) {
    // A console page opens on its section's read, a page under no section where it says a member may, and a unit's
    // screen where its manifest opens it to them.
    const page = inConsoleSections(to.path) ? to.matched.length > 0 : to.meta.member === true;
    const opens = screenMayRead(access, to.path) && (page || screen !== null);
    const home = homeFor(access, screensWithBundles(screens).map((one) => one.to));

    // The way to the first screen they may open never leads back to the address refused, which stands instead.
    if (!opens && home !== to.path) return navigateTo(home);

    setPageLayout(MEMBER_LAYOUT);

    return;
  }

  // A member opens only the screens that say a member may, and the screens units bring whose manifest opens to
  // them, each in the member's own shell; any other address would open onto routes that answer them as absent
  // (docs/web.md, 「Access」).
  if (to.meta.member !== true && screen === null) return navigateTo(MEMBER_HOME);

  setPageLayout(MEMBER_LAYOUT);
});

// Whether a path is the page of one of the reader's own supervisors, as the console's server answers them.
async function ownAgentPage(path: string): Promise<boolean> {
  const name = /^\/agents\/([^/]+)$/.exec(path)?.[1];

  if (name === undefined) return false;

  const own = await $fetch<string[]>("/api/me/agents").catch(() => [] as string[]);

  return own.includes(decodeURIComponent(name));
}
