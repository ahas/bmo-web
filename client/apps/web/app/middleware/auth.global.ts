import { MEMBER_HOME, MEMBER_LAYOUT, isAdministrator } from "~/domain/access";
import { openScreen, screenAt, screenOpened, sharePath, useConsoleScreens } from "~/domain/console-screens";
import { loginRoute, returnPath } from "~/domain/login-end";

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
    const loaded = await openScreen(useRouter(), screen).then(() => true, () => false);

    if (loaded) return navigateTo(to.fullPath, { replace: true });
  }

  // A share link is the one road with no session behind it. Each bundle's share page stands below its
  // own screen path, and the page reaches what it opens by the token in the address alone; the relay
  // lets that one read through without a session.
  if (sharePath(screens, to.path)) return;

  const { loggedIn, session } = useUserSession();

  if (to.path === "/login") {
    return loggedIn.value ? navigateTo(returnPath(to.query.to)) : undefined;
  }

  if (!loggedIn.value) return navigateTo(loginRoute(to.fullPath, import.meta.server && useRequestEvent()?.context.sessionEnded === true));

  if (isAdministrator(session.value)) return;

  // A member opens only the screens that say a member may, and the screens units bring whose manifest opens to
  // them, each in the member's own shell; any other address would open onto routes that answer them as absent
  // (docs/web.md, 「Access」).
  if (to.meta.member !== true && screen === null) return navigateTo(MEMBER_HOME);

  setPageLayout(MEMBER_LAYOUT);
});
