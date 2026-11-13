import { mayWrite } from "#shared/sections";

import type { ComputedRef } from "vue";
import type { SectionAccessMap } from "#shared/sections";

// What the console shows a member, a signed-in user other than the platform administrator
// (docs/web.md, 「Access」). The routes refuse them on the server either way; this is what keeps a
// screen from opening onto routes that answer them as absent.

declare module "#app" {
  interface PageMeta {
    // Whether a member may open the screen. A screen that does not say so is the administrator's.
    member?: boolean;
  }
}

// The layout a member's screens stand in, beside the administrator's own.
export const MEMBER_LAYOUT = "member";

// A member's home: the rooms they may read. The console's own home is the administrator's board.
export const MEMBER_HOME = "/rooms";

/**
 * Whether the one signed in is the platform administrator, read off the session the browser holds.
 * A sign-in on the account service names it in the seal; a seal that does not is a console login or
 * one written before the model, and the routes read both as the administrator's.
 */
export function isAdministrator(session: { administrator?: boolean } | null): boolean {
  return session?.administrator !== false;
}

export function useAdministrator(): ComputedRef<boolean> {
  const { session } = useUserSession();

  return computed(() => isAdministrator(session.value));
}

/**
 * The account service's user the one signed in is, read off the session the browser holds; null for a console
 * login, which names none. Whose own space a secret saved here goes to (docs/web.md, the secret store section).
 */
export function useSignedUser(): ComputedRef<number | null> {
  const { user } = useUserSession();

  return computed(() => user.value?.id ?? null);
}

/**
 * Whether the room screen writes for a reader (docs/web.md, 「Access」): the platform administrator always,
 * and a member whose rooms section writes once that permission has been read. Nothing is granted before it
 * is read, so a member keeps the read-only screen rather than a box the routes would refuse.
 */
export function roomMayWrite(access: SectionAccessMap, administrator: boolean, ready: boolean): boolean {
  return administrator || (ready && mayWrite(access, "rooms"));
}
