import type { AppPermissions, PermissionReach } from "#shared/app-permissions";
import type { Translate } from "#shared/wording";

// What a personal app may reach beyond its own data, said plainly (docs/web.md, 「App catalogue」 and 「Settings」, the
// personal apps section): the addresses it reaches and that it reaches no other, the secrets it reads and that it
// reads them only as it runs, which of those the reader's secret space lacks, and what the reader's organisation does
// not allow, so a call of it is refused.

/** One line of what an app may reach: its words, the names it lists, and how it reads. */
export interface PermissionLine {
  key: string;
  text: string;
  values: string[];
  tone: "default" | "muted" | "warning";
}

/** Everything an app asks for, line by line, held to what the reader's organisation and secret space give it. */
export function permissionLines(t: Translate, permissions: AppPermissions, reach: PermissionReach): PermissionLine[] {
  const lines: PermissionLine[] = [];

  if (permissions.network.length === 0 && permissions.secrets.length === 0) {
    return [{ key: "own", text: t("app_permissions.label.own_data"), values: [], tone: "default" }];
  }

  if (permissions.network.length > 0) {
    lines.push({ key: "network", text: t("app_permissions.label.network"), values: permissions.network, tone: "default" });
    lines.push({ key: "network-note", text: t("app_permissions.label.network_note"), values: [], tone: "muted" });
    if (!reach.network) lines.push({ key: "network-withheld", text: t("app_permissions.label.network_withheld"), values: [], tone: "warning" });
  }

  if (permissions.secrets.length > 0) {
    const missing = permissions.secrets.filter((name) => !reach.held.includes(name));

    lines.push({ key: "secrets", text: t("app_permissions.label.secrets"), values: permissions.secrets, tone: "default" });
    lines.push({ key: "secrets-note", text: t("app_permissions.label.secrets_note"), values: [], tone: "muted" });
    if (missing.length > 0) lines.push({ key: "secrets-missing", text: t("app_permissions.label.secrets_missing"), values: missing, tone: "warning" });
    if (!reach.secrets) lines.push({ key: "secrets-withheld", text: t("app_permissions.label.secrets_withheld"), values: [], tone: "warning" });
  }

  return lines;
}

/** The same lines as plain text, one a line, for a question that asks before an install or an update. */
export function permissionText(t: Translate, permissions: AppPermissions, reach: PermissionReach): string {
  return permissionLines(t, permissions, reach)
    .map((line) => [line.text, line.values.join(", ")].filter((part) => part !== "").join(" "))
    .join("\n");
}
