// Account security on the console's screens (docs/web.md, 「Access」, 「Settings」 and 「Organisation」): whether the
// sign-in asked the reader to enrol a second factor, what stands of one person's account for the administrator and
// their heads, and the acts the head's menu offers on it.

import { failureText } from "bmo-ui/app/domain/errors";

import type { AccountSecurityView } from "#shared/account-security";

/** Whether the sign-in just made asks the reader to set up a second factor, which the account section answers once. */
export function useEnrolAsked(): Ref<boolean> {
  return useState<boolean>("security-enrol-asked", () => false);
}

/** An act on a person's account the head's menu offers. */
export type SecurityAct = "password" | "factor" | "disable" | "enable";

/**
 * The account acts the reader may take on a person (docs/web.md, 「Organisation」, the people tab): a reset of the
 * password and of a second factor the person holds for whoever reads their security — the administrator and their
 * heads — and disabling or enabling for the administrator alone; none on the reader themselves or on a person who left.
 */
export function securityActs(actor: { administrator: boolean; user: string | null }, person: string, security: AccountSecurityView | null): SecurityAct[] {
  if (security === null || security.left || actor.user === person) return [];

  return [
    "password",
    ...(security.secondFactor ? (["factor"] as const) : []),
    ...(actor.administrator ? [security.enabled ? ("disable" as const) : ("enable" as const)] : [])
  ];
}

/** One person's account security as the administrator and their heads read it, shared by the screens that show it and
 * kept by the person, so a person chosen anew reads their own. */
export function usePersonSecurity(user: () => string): { security: ComputedRef<AccountSecurityView | null>; failure: ComputedRef<string>; read: (fallback: string) => Promise<void> } {
  const kept = useState<Record<string, AccountSecurityView>>("person-security", () => ({}));
  const failures = useState<Record<string, string>>("person-security-failures", () => ({}));

  async function read(fallback: string): Promise<void> {
    const asked = user();

    try {
      kept.value = { ...kept.value, [asked]: await $fetch<AccountSecurityView>(`/api/organization/users/${encodeURIComponent(asked)}/security`) };
      failures.value = { ...failures.value, [asked]: "" };
    } catch (error) {
      failures.value = { ...failures.value, [asked]: failureText(error, fallback) };
    }
  }

  return { security: computed(() => kept.value[user()] ?? null), failure: computed(() => failures.value[user()] ?? ""), read };
}
