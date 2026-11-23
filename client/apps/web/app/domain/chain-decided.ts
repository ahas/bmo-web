import type { DecidedBy } from "#shared/organisation-agents";
import type { Translate } from "#shared/wording";

// Who decided a setting of the delegation chain standing for the reader, as their own settings say it (docs/web.md,
// 「Settings」, the supply and own-BMO sections): a unit above by its name, the platform, or nothing where the default
// stands.

/** The line under a setting a unit above or the platform decided, none where nobody did. */
export function decidedLine(t: Translate, decided: DecidedBy): string | null {
  if (decided === null) return null;
  if (decided.by === "platform") return t("org_agents.label.decided_platform");

  return decided.name === null ? t("org_agents.label.decided_unit") : t("org_agents.label.decided_named", { name: decided.name });
}
