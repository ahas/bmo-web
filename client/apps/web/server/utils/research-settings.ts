import { readRoles } from "./axes";
import { researchFetch } from "./research";

import type { ResearchKeySettings, ResearchSettingsChange, ResearchSettingsView, SearchEngineState } from "#shared/research";

// The settings every research run is held to and the search engines' state (bmo-research's `docs/api.md`,
// 「research-settings」; docs/web.md, 「Research screen」, its settings tab), with the roles a search's branches may go
// out as beside them: those the agency's `GET /roles` lists as callable. The research unit publishes no TypeScript
// client, so it is called by its documented paths, at the address and with the token `RESEARCH_ADDRESS` and `RESEARCH_TOKEN` name.

// The research unit's codes, each with the pack's key for its sentence: a value it did not take, or a failure on
// its side.
const RESEARCH_CODES: Readonly<Record<string, string>> = {
  "bad-request": "research.error.refused",
  unauthorized: "research.error.failed",
  "no-route": "research.error.failed",
  failed: "research.error.failed",
  "upstream-failed": "research.error.failed"
};

// One research key as the unit answers it, its page budgets among what it holds.
interface UnitKeySettings extends ResearchKeySettings {
  pages: number | null;
  branchPages: number | null;
}

interface UnitResearchSettings {
  branchRole: string;
  strategy: string;
  hostIntervalMs: number | null;
  engineIntervalMs: number | null;
  keys: UnitKeySettings[];
  source: string;
  engines: SearchEngineState[] | null;
  enginesUnread: string | null;
}

function viewOf(settings: UnitResearchSettings, roles: ResearchSettingsView["roles"]): ResearchSettingsView {
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

// The roles a run may call, each named as the role tab names it; none while the agency does not answer, the role the
// settings hold still standing as its own choice on the screen.
async function callableRoles(): Promise<ResearchSettingsView["roles"]> {
  const answer = await readRoles().catch(() => null);

  return (answer?.roles ?? []).filter((role) => role.callable).map((role) => ({ name: role.name, label: role.shown }));
}

// A call on the research unit, its refusals said in the pack's words.
async function research<T>(path: string, init?: RequestInit): Promise<T> {
  return await researchFetch<T>(path, init, RESEARCH_CODES);
}

export async function readResearchSettings(): Promise<ResearchSettingsView> {
  const [settings, roles] = await Promise.all([research<UnitResearchSettings>("/research-settings"), callableRoles()]);

  return viewOf(settings, roles);
}

// One change sent as it stands: the unit keeps every field the change leaves out, and every key's page budgets with
// them, so a gap sent as null alone goes back to the web tools' default.
export async function changeResearchSettings(change: ResearchSettingsChange): Promise<ResearchSettingsView> {
  const init = { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(change) };
  const [settings, roles] = await Promise.all([research<UnitResearchSettings>("/research-settings", init), callableRoles()]);

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
