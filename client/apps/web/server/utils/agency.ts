import { agencyClient } from "@agency/client";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import { unitAt } from "./units";
import { answered } from "./unit-answer";

import type { Agent as AgencyAgent, AgencyClient, FoldRatio, Provider, Session, Tier, Worker } from "@agency/client";
import type { components } from "@agency/client/schema";
import type { AgentSamplingView, BasePromptView, BasePromptsView, FoldRatiosView, FoldRatioView, GenerationSetting, GenerationValue, SessionView, TierMapping, TierProviderView, TierSettingsView } from "#shared/agency";
import type { AgentSummary, RoleView } from "#shared/types";
import type { UnitAnswerCall } from "./unit-answer";

type Schemas = components["schemas"];
type PromptDocument = Schemas["PromptDocument"];

// The agency's fixed API as its published package states it (the agency's `docs/api.md`, 「The control port」):
// JSON in camelCase, a page for a list, and a refusal answered with the status's kebab-case code and an English
// sentence. The English is for an agent to read, so a person is told the code's sentence from the pack, and a
// refused field is said under that field.

// The agency's codes, each with the pack's key for its sentence.
const AGENCY_CODES: Readonly<Record<string, string>> = {
  "bad-request": "agents.error.agency_bad_request",
  "not-found": "agents.error.agency_not_found",
  conflict: "agents.error.agency_conflict",
  "unprocessable-entity": "agents.error.agency_unprocessable",
  "service-unavailable": "agents.error.agency_unavailable",
  "internal-server-error": "agents.error.agency_failed",
  "bad-gateway": "agents.error.agency_failed",
  "name-taken": "agents.error.agent_name_taken"
};

// A listing the agency reads from a provider's own catalogue takes as long as that provider answers.
export const LISTING_TIMEOUT_MS = 20_000;
// A call that only reads the agency answers at once; one that runs a model takes as long as the model takes.
export const AGENCY_TIMEOUT_MS = 5_000;

/** The agency at the address its setting names, asked with its token. */
export function agency(): AgencyClient {
  const unit = unitAt("AGENCY");

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  return agencyClient(unit.address, unit.token ?? "");
}

/** One call on the agency, its refusals said in the pack's words and a refused field said under that field. */
export async function agencyCall<T, E extends { code?: string; error?: string; field?: string }>(
  asked: Promise<{ data?: T; error?: E; response: Response }>,
  call: UnitAnswerCall = {}
): Promise<T> {
  try {
    return await answered(asked, { ...call, codes: AGENCY_CODES });
  } catch (error) {
    throw error instanceof Error ? fieldRefusal(error) : error;
  }
}

const seconds = (ms: number | null): number | null => (ms === null ? null : Math.floor(ms / 1000));

// The row an agent's screen stands on: what the agency's own agent list does not carry — its runs, its checkout
// and the session's loads — stands empty (docs/boundary.md, 「Gaps the console meets」).
function agentSummary(agent: AgencyAgent): AgentSummary {
  return {
    name: agent.name,
    kind: "chat",
    role: agent.role,
    sessionScope: null,
    turnShape: null,
    defaultAnswerer: false,
    model: null,
    configuredMode: null,
    configuredLabel: null,
    modelLabel: null,
    lastMode: null,
    lastModel: null,
    lastEffort: null,
    label: agent.label,
    aliases: null,
    icon: null,
    cwd: null,
    builtin: false,
    chatId: null,
    runs: 0,
    lastRunAt: null,
    lastKeepaliveAt: null,
    contextTokens: null,
    keepaliveStopped: false,
    keepalivePausedAt: null
  };
}

function workerSummary(worker: Worker): AgentSummary {
  return {
    name: worker.name,
    kind: "worker",
    role: worker.role,
    sessionScope: null,
    turnShape: null,
    defaultAnswerer: false,
    model: null,
    configuredMode: null,
    configuredLabel: null,
    modelLabel: null,
    lastMode: null,
    lastModel: null,
    lastEffort: null,
    label: worker.label,
    aliases: null,
    icon: worker.icon,
    cwd: worker.cwd,
    builtin: worker.builtin,
    chatId: null,
    runs: worker.runCount,
    lastRunAt: seconds(worker.lastRunAt),
    lastKeepaliveAt: null,
    contextTokens: null,
    keepaliveStopped: false,
    keepalivePausedAt: null,
    node: worker.nodeName
  };
}

/** Every agent and worker as the agent list stands them. */
export function agentSummaries(agents: readonly AgencyAgent[], workers: readonly Worker[]): AgentSummary[] {
  return [...agents.map(agentSummary), ...workers.map(workerSummary)];
}

/** A role as the agent list names it; the agency keeps no label or bundle list for one. */
/** The roles an agent may hold as the agents' answer carries them, each with its label and the bundles it gives; a
 * member that does not read as one is left out. */
export function agentRolesOf(answer: unknown): RoleView[] {
  const roles = (answer as { roles?: unknown } | null)?.roles;

  if (!Array.isArray(roles)) return [];

  return roles.flatMap((role): RoleView[] => {
    const held = role as { name?: unknown; label?: unknown; bundles?: unknown };

    if (typeof held?.name !== "string") return [];

    const bundles = Array.isArray(held.bundles)
      ? held.bundles.flatMap((bundle) => {
          const one = bundle as { name?: unknown; label?: unknown };

          return typeof one?.name === "string" ? [{ name: one.name, label: typeof one.label === "string" ? one.label : one.name }] : [];
        })
      : [];

    return [{ name: held.name, label: typeof held.label === "string" ? held.label : held.name, bundles }];
  });
}

/** A worker's sampling, as the worker's own screen reads it; the agency's document holds it as the worker gives it. */
export function samplingView(sampling: unknown, agent: string): AgentSamplingView {
  const held = (typeof sampling === "object" && sampling !== null ? sampling : {}) as { settings?: GenerationSetting[]; values?: Record<string, GenerationValue> };

  return { agent, settings: held.settings ?? [], values: held.values ?? {} };
}

/** A session as the console's session screen stands it; what the agency does not carry stands empty. */
export function sessionView(session: Session, label: string | null = null): SessionView {
  return {
    agent: session.agentName,
    chatId: session.roomId,
    kind: session.scope,
    title: null,
    generation: session.generation,
    models: [session.model],
    running: session.holder !== null,
    label: label ?? session.agentName,
    icon: null,
    waiting: null,
    lastDoneAt: null
  };
}

/** One tier's mapping as the agency answers it: each provider's model, effort and answer ceiling, by the
 * provider's name; a cell that does not read as one is left out. */
export function tierMappingsOf(tier: Tier): TierMapping[] {
  const cells = typeof tier.mapping === "object" && tier.mapping !== null ? (tier.mapping as Record<string, unknown>) : {};
  const mappings: TierMapping[] = [];

  for (const [provider, value] of Object.entries(cells)) {
    const cell = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

    if (cell === null || typeof cell.model !== "string" || cell.model === "") continue;

    mappings.push({
      provider: provider as TierMapping["provider"],
      tier: tier.name,
      model: cell.model,
      effort: typeof cell.effort === "string" ? cell.effort : null,
      answerTokens: typeof cell.answerTokens === "number" ? cell.answerTokens : null
    });
  }

  return mappings;
}

/** The tiers, their mappings on each provider and the providers as the tier screen reads them; a work key's
 * assignment is no part of the agency's answers and stands empty (docs/boundary.md, 「Gaps the console meets」). */
export function tierSettingsOf(tiers: readonly Tier[], providers: readonly Provider[]): TierSettingsView {
  const views: TierProviderView[] = providers.map((provider) => ({
    provider: provider.name as TierProviderView["provider"],
    label: provider.name,
    capsAnswerTokens: false,
    efforts: [],
    enabled: provider.enabled
  }));

  return { tiers: tiers.map((tier) => tier.name), providers: views, mappings: tiers.flatMap(tierMappingsOf), conflicts: [], assignments: [] };
}

/** One provider's fold ratio at one tier as the fold-ratio grid reads it. */
export function foldRatioView(ratio: FoldRatio): FoldRatioView {
  return { provider: ratio.provider as FoldRatioView["provider"], tier: ratio.tier, ratio: ratio.ratio, source: ratio.source };
}

/** The fold-ratio grid as the tier screen reads it: the agency lists every provider at every tier in ladder
 * order, so the tiers and the providers stand in the order they first appear. */
export function foldRatiosOf(ratios: readonly FoldRatio[]): FoldRatiosView {
  const views = ratios.map(foldRatioView);

  return {
    tiers: [...new Set(views.map((one) => one.tier))],
    providers: [...new Set(views.map((one) => one.provider))],
    ratios: views
  };
}

// The base prompts the agency deploys and each agent's choice of one. A base prompt is a prompt document of the
// base kind; an agent's choice is a document of that kind naming the agent.
export function basePromptsOf(documents: readonly PromptDocument[]): BasePromptsView {
  const bases = documents.filter((document) => document.kind === "base" && document.agentName === null);
  const choices: Record<string, string> = {};

  for (const document of documents) {
    if (document.kind === "base" && document.agentName !== null) choices[document.agentName] = document.name;
  }

  const choosers = (name: string): { agent: string; label: string }[] =>
    Object.entries(choices).flatMap(([agent, prompt]) => (prompt === name ? [{ agent, label: agent }] : []));

  return {
    prompts: bases.map((document): BasePromptView => ({
      name: document.name,
      label: document.name,
      text: document.text,
      updatedAt: null,
      updatedBy: null,
      characters: document.text.length,
      choosers: choosers(document.name)
    })),
    choices,
    values: []
  };
}

// A refusal about one field is said by the one sentence for a refused value; the screen puts it under the
// field the refusal names.
function fieldRefusal(error: Error): Error {
  const asked = error as Error & { statusCode?: number; data?: { field?: string } };

  return asked.statusCode === 400 && typeof asked.data?.field === "string"
    ? createError({ statusCode: 400, message: wording("agents.error.field_refused"), data: { field: asked.data.field } })
    : error;
}
