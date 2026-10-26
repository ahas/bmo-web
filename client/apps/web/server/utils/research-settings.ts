import { agencyRoute } from "./agency";

import type { ResearchKeySettings, ResearchSettingsChange, ResearchSettingsView, SearchEngineState } from "#shared/agency";

// The settings every research run is held to and the search engines' state (the agency's `docs/api.md`,
// 「research」; docs/web.md, the searcher tab), with the co-worker roles a search's branches may go out on beside them.

interface AgencyResearchSettings {
  branchRole: string;
  strategy: string;
  hostIntervalMs: number | null;
  engineIntervalMs: number | null;
  keys: ResearchKeySettings[];
  source: string;
  engines: SearchEngineState[] | null;
  enginesUnread: string | null;
}

interface AgencyRoles {
  items: { name: string }[];
}

function viewOf(settings: AgencyResearchSettings, roles: readonly string[]): ResearchSettingsView {
  return {
    branchRole: settings.branchRole,
    strategy: settings.strategy,
    hostIntervalMs: settings.hostIntervalMs ?? null,
    engineIntervalMs: settings.engineIntervalMs ?? null,
    keys: (settings.keys ?? []).map((one) => ({ key: one.key, branches: one.branches, minutes: one.minutes })),
    source: settings.source,
    engines: settings.engines ?? null,
    enginesUnread: settings.enginesUnread ?? null,
    roles: [...roles]
  };
}

async function coworkerRoles(): Promise<string[]> {
  const answer = await agencyRoute<AgencyRoles>("GET", "/roles").catch(() => ({ items: [] }));

  return answer.items.map((role) => role.name);
}

export async function readResearchSettings(): Promise<ResearchSettingsView> {
  const [settings, roles] = await Promise.all([agencyRoute<AgencyResearchSettings>("GET", "/research-settings"), coworkerRoles()]);

  return viewOf(settings, roles);
}

// One change sent as the agency takes it: the three fields it always reads named, null where unchanged, and a gap
// named only where it is changed, since a gap sent as null goes back to the web tools' default.
export async function changeResearchSettings(change: ResearchSettingsChange): Promise<ResearchSettingsView> {
  const body = { branchRole: null, strategy: null, keys: null, ...change };
  const [settings, roles] = await Promise.all([agencyRoute<AgencyResearchSettings>("PUT", "/research-settings", body), coworkerRoles()]);

  return viewOf(settings, roles);
}

const whole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

/** A change the console sends, read off a body: one field, of its own shape; anything else is no change. */
export function researchChangeOf(body: unknown): ResearchSettingsChange | null {
  if (typeof body !== "object" || body === null || Object.keys(body).length !== 1) return null;

  const fields = body as Record<string, unknown>;

  if (typeof fields.branchRole === "string" && fields.branchRole !== "") return { branchRole: fields.branchRole };
  if (typeof fields.strategy === "string" && fields.strategy !== "") return { strategy: fields.strategy };
  if ("hostIntervalMs" in fields && (fields.hostIntervalMs === null || whole(fields.hostIntervalMs))) return { hostIntervalMs: fields.hostIntervalMs };
  if ("engineIntervalMs" in fields && (fields.engineIntervalMs === null || whole(fields.engineIntervalMs))) return { engineIntervalMs: fields.engineIntervalMs };

  if (Array.isArray(fields.keys)) {
    const keys = fields.keys.flatMap((one: unknown) => {
      const row = one as Record<string, unknown> | null;

      return row !== null && typeof row.key === "string" && whole(row.branches) && whole(row.minutes) ? [{ key: row.key, branches: row.branches, minutes: row.minutes }] : [];
    });

    return keys.length === fields.keys.length && keys.length > 0 ? { keys } : null;
  }

  return null;
}
