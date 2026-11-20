import type { DeployFlushView } from "#shared/deploy-flush";

// The minutes between two flushes of the deploy queue as the agency's `GET /settings` answers them (its
// `docs/api.md`, 「settings」): the minutes in force, or null where the answer carries no positive whole number.
export function deployFlushOf(settings: { deployFlushMinutes?: unknown }): DeployFlushView {
  const held = settings.deployFlushMinutes;

  return { minutes: typeof held === "number" && Number.isSafeInteger(held) && held > 0 ? held : null };
}
