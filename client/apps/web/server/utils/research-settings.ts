import { wording } from "#shared/wording";

import { agencyRoute } from "./agency";
import { unitFetch } from "./units";

import type { ResearchKeySettings, ResearchSettingsChange, ResearchSettingsView, SearchEngineState } from "#shared/research";

// The settings every research run is held to and the search engines' state (bmo-research's `docs/api.md`,
// 「research-settings」; docs/web.md, the searcher tab), with the co-worker roles a search's branches may go out on
// beside them, read off the agency's pool. The research unit publishes no TypeScript client, so it is called by its
// documented paths, at the address and with the token `RESEARCH_ADDRESS` and `RESEARCH_TOKEN` name.

const UNIT = "RESEARCH";

// The research unit's codes, each with the pack's key for its sentence: a value it did not take, or a failure on
// its side.
const RESEARCH_CODES: Readonly<Record<string, string>> = {
  "bad-request": "research.error.refused",
  unauthorized: "research.error.failed",
  "no-route": "research.error.failed",
  failed: "research.error.failed",
  "upstream-failed": "research.error.failed"
};

const CALL = { codes: RESEARCH_CODES };

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

interface AgencyRoles {
  items: { name: string }[];
}

function viewOf(settings: UnitResearchSettings, roles: readonly string[]): ResearchSettingsView {
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

// A call on the research unit, its refusals said in the pack's words; a unit not reached — no address named, or
// nothing took the call — is said as the research unit not answering.
async function research<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await unitFetch<T>(UNIT, path, init, CALL);
  } catch (error) {
    throw unreached(error) ? fail(503, wording("research.error.unreachable")) : error;
  }
}

// A refusal the unit answered carries what it said; a call that never reached it carries nothing.
function unreached(error: unknown): boolean {
  const failure = error as { statusCode?: unknown; data?: unknown } | null;

  return failure?.statusCode === 503 && failure.data === undefined;
}

export async function readResearchSettings(): Promise<ResearchSettingsView> {
  const [settings, roles] = await Promise.all([research<UnitResearchSettings>("/research-settings"), coworkerRoles()]);

  return viewOf(settings, roles);
}

// One change sent as it stands: the unit keeps every field the change leaves out, and every key's page budgets with
// them, so a gap sent as null alone goes back to the web tools' default.
export async function changeResearchSettings(change: ResearchSettingsChange): Promise<ResearchSettingsView> {
  const init = { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(change) };
  const [settings, roles] = await Promise.all([research<UnitResearchSettings>("/research-settings", init), coworkerRoles()]);

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
