import { WATCH_REPORT_MS } from "#shared/config";
import { appUrl } from "~/domain/urls";
import { shownRoom, watchReport } from "~/domain/watching";

import type { WatchReport } from "~/domain/watching";

// This tab telling the server which room it shows and whether it can be seen (docs/web.md,
// 「Notifications」): when a room opens, when the tab is hidden or shown, and every interval while it
// is open, hidden or not, since a tab can be closed with no word at all and a hidden one is still open. A tab going away says so on
// its way out. Every signed-in account's tab says it, since the same report is the account's presence in the
// console (docs/web.md, 「Presence and typing」).
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter();
  const { loggedIn } = useUserSession();
  const heard = loggedIn;
  const tab = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const path = appUrl("/api/push/watching");

  function room(): number | null {
    return shownRoom(router.currentRoute.value);
  }

  function send(report: WatchReport): void {
    if (!heard.value) {
      return;
    }

    // A report that does not land is followed by the next one; nothing waits on it.
    void $fetch(path, { method: "POST", body: report }).catch(() => undefined);
  }

  function say(): void {
    send(watchReport(tab, room(), document.visibilityState === "visible" ? "visible" : "hidden"));
  }

  nuxtApp.hook("app:mounted", say);
  router.afterEach(() => say());
  watch(loggedIn, say);
  document.addEventListener("visibilitychange", say);
  // A page kept whole by the browser on leaving comes back the tab it was.
  window.addEventListener("pageshow", say);

  setInterval(say, WATCH_REPORT_MS);

  // A page being taken down cannot wait on a request, so its last word goes as a beacon.
  window.addEventListener("pagehide", () => {
    if (heard.value) {
      navigator.sendBeacon(path, new Blob([JSON.stringify(watchReport(tab, room(), "gone"))], { type: "application/json" }));
    }
  });
});
