import { forgetGuideOpens } from "~/domain/guide";
import { forgetSectionAccess } from "~/domain/section-access";
import { useSignedLogin } from "~/domain/signed-login";

// What the tab knows of its reader belongs to the login it was read for (docs/web.md, 「Access」): as the login changes
// — a sign-in, a sign-out or one login handing over to another — the sections it reads and whether the start guide
// opens by itself for it are forgotten at once, before the page the login leads to asks either, so that page reads
// them for the login that stands now.
export default defineNuxtPlugin(() => {
  const login = useSignedLogin();

  watch(
    login,
    () => {
      forgetSectionAccess();
      forgetGuideOpens();
    },
    { flush: "sync" }
  );
});
