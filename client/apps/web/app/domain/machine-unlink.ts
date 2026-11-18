import type { UserNode } from "@web/server-client";

// What taking an account's machine away does to the machine itself (docs/accounts.md, 「Invitations and a person's
// machine」): only a machine the hub holds and nobody shares it with is sent a leave, and the leave ends it as it is
// connected, the desktop app asking to be connected again and an installed program removing itself.
export function leaveEffectKey(machine: UserNode | null): string | null {
  if (machine === null || !machine.attached || machine.shared) return null;
  if (machine.kind === "desktop") return "machines.message.unbind_desktop";
  if (machine.kind === "installed") return "machines.message.unbind_installed";

  return null;
}
