import type { ComputedRef } from "vue";

// The login a tab stands for now (docs/web.md, 「Access」): what the tab knows of its reader is read for one login,
// and is read again whenever the login changes — a sign-in, a sign-out, or one login handing over to another in the
// same tab.

/** The login the tab stands for, by the user the session names, else its login name; null with nobody signed in. */
export function useSignedLogin(): ComputedRef<string | null> {
  const { loggedIn, user } = useUserSession();

  return computed(() => {
    if (!loggedIn.value) return null;

    const id = user.value?.id;

    return id === undefined ? `login:${user.value?.name ?? ""}` : `user:${id}`;
  });
}
