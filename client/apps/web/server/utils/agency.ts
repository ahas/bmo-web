import { agencyClient } from "@agency/client";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import { bundleLabelOf, providerLabelOf, roadReasonOf, roleLabelOf } from "./agency-words";
import { unitAt, unitHeaders } from "./units";
import { answered } from "./unit-answer";

import type { Agent as AgencyAgent, AgencyClient, FoldRatio, Provider, Session, Tier, Worker } from "@agency/client";
import type { components } from "@agency/client/schema";
import type { AgentSamplingView, BasePromptView, BasePromptsView, FoldRatiosView, FoldRatioView, GenerationSetting, GenerationValue, SessionView, TierAssignmentView, TierConflict, TierMapping, TierProvider, TierProviderView, TierSettingsView } from "#shared/agency";
import { agentProviderNames } from "#shared/types";

import type { AgentMode, AgentReasoningView, AgentSummary, RoleView } from "#shared/types";
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

/**
 * One call on an agency route the published client the console vendors names no type for, by the path the agency's
 * `docs/api.md` documents, answered and refused as every other agency call is.
 */
export async function agencyRoute<T>(method: "GET" | "PUT" | "PATCH", path: string, body?: unknown): Promise<T> {
  const unit = unitAt("AGENCY");

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  const asked = fetch(`${unit.address}${path}`, {
    method,
    headers: { ...unitHeaders(unit), accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(AGENCY_TIMEOUT_MS)
  }).then(async (response) => {
    const parsed: unknown = await response.json().catch(() => undefined);

    return response.ok ? { data: parsed as T, response } : { error: (parsed ?? {}) as { code?: string; error?: string; field?: string }, response };
  });

  return await agencyCall<T, { code?: string; error?: string; field?: string }>(asked);
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

// The agency's answer on an agent as it arrives, the vendored type naming only part of what the route answers
// (docs/boundary.md, 「Gaps the console meets」).
function rowOf(agent: AgencyAgent): Record<string, unknown> {
  return Object.fromEntries(Object.entries(agent));
}

// What the agency's answer carries on an agent beside the fields its published type states: the registration row's
// kind, whether it is the default answerer and the room it answers (docs/boundary.md, 「Gaps the console meets」).
export function carriedOf(agent: AgencyAgent): { kind: string; defaultAnswerer: boolean; chatId: number | null; reasoning: AgentReasoningView | null } {
  const row = rowOf(agent);

  return {
    kind: typeof row.kind === "string" && row.kind !== "" ? row.kind : "chat",
    defaultAnswerer: row.defaultAnswerer === true,
    chatId: typeof row.chatId === "number" ? row.chatId : null,
    reasoning: reasoningOf(row.reasoning)
  };
}

// An agent's own thinking and effort and what of it reaches the provider it begins on, as the agency answers them
// (its `docs/model-tiers.md`, 「An agent's own thinking and effort」); none where the agency names none.
function reasoningOf(value: unknown): AgentReasoningView | null {
  if (value === null || typeof value !== "object") return null;

  const held = value as { thinking?: unknown; effort?: unknown; reaches?: unknown };
  const reaches = held.reaches as { thinking?: unknown; levels?: unknown } | null | undefined;

  return {
    thinking: typeof held.thinking === "boolean" ? held.thinking : null,
    effort: typeof held.effort === "string" ? held.effort : null,
    reaches:
      reaches === null || reaches === undefined || typeof reaches !== "object"
        ? null
        : { thinking: reaches.thinking === true, levels: Array.isArray(reaches.levels) ? reaches.levels.filter((one): one is string => typeof one === "string") : [] }
  };
}


function agentSummary(agent: AgencyAgent): AgentSummary {
  const carried = carriedOf(agent);
  const row = rowOf(agent);
  // A field the route answers and the vendored type does not name, read as it stands: text and numbers as
  // they are, the providers checked against the words the bot carries so an unknown one reads as none.
  const text = (name: string): string | null => (typeof row[name] === "string" && row[name] !== "" ? (row[name] as string) : null);
  const number = (name: string): number | null => (typeof row[name] === "number" ? (row[name] as number) : null);
  const provider = (name: string): AgentMode | null => {
    const held = row[name];

    return typeof held === "string" ? (agentProviderNames as readonly string[]).includes(held) ? (held as AgentMode) : null : null;
  };
  const scope = row.sessionScope === "agent" || row.sessionScope === "room" ? row.sessionScope : null;
  const shape = row.turnShape === "window" || row.turnShape === "pieces" ? row.turnShape : null;
  // The rooms its sessions hold, each with the moment its log last took a line there; none where the
  // answer names none.
  const sessions = Array.isArray(row.sessions)
    ? (row.sessions as unknown[]).flatMap((held): { chatId: number; lastAt: number | null }[] => {
        const one = held as { chatId?: unknown; lastAt?: unknown };

        return typeof one.chatId === "number" ? [{ chatId: one.chatId, lastAt: typeof one.lastAt === "number" ? one.lastAt : null }] : [];
      })
    : [];

  return {
    name: agent.name,
    kind: carried.kind,
    role: agent.role,
    sessionScope: scope,
    turnShape: shape,
    defaultAnswerer: carried.defaultAnswerer,
    model: text("model"),
    configuredMode: provider("configuredMode"),
    configuredLabel: text("configuredLabel"),
    modelLabel: text("modelLabel"),
    lastMode: provider("lastMode"),
    lastModel: text("lastModel"),
    lastEffort: text("lastEffort"),
    label: agent.label,
    aliases: text("aliases"),
    icon: text("icon"),
    cwd: text("cwd"),
    builtin: row.builtin === true,
    chatId: carried.chatId,
    runs: number("runs") ?? 0,
    lastRunAt: number("lastRunAt"),
    lastKeepaliveAt: number("lastKeepaliveAt"),
    contextTokens: number("contextTokens"),
    keepaliveStopped: row.keepaliveStopped === true,
    keepalivePausedAt: number("keepalivePausedAt"),
    pinnedProvider: provider("pinnedProvider"),
    pinnedModel: text("pinnedModel"),
    sessions: sessions.length === 0 ? undefined : sessions,
    reasoning: carried.reasoning
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
    node: worker.nodeName,
    ...prefixDocumentsOf(worker)
  };
}

// The documents a worker's session prefix carries, as the agency's worker answers them (the agency's `docs/api.md`,
// 「workers」); a worker answered without them names none.
function prefixDocumentsOf(worker: Worker & { prefixDocuments?: unknown }): { prefixDocuments?: string[] } {
  const named = worker.prefixDocuments;

  return Array.isArray(named) ? { prefixDocuments: named.filter((path): path is string => typeof path === "string") } : {};
}

/** Every agent and worker as the agent list stands them. */
/** Every agent once, in the agents' order and then any worker the agents' answer does not name: a worker both answers
 * name is one row, its worker's own fields laid over its agent's (docs/web.md, 「Agent management screen」). */
export function agentSummaries(agents: readonly AgencyAgent[], workers: readonly Worker[]): AgentSummary[] {
  const byName = new Map(workers.map((worker) => [worker.name, worker]));
  const listed = agents.map((agent): AgentSummary => {
    const worker = byName.get(agent.name);

    return worker === undefined ? agentSummary(agent) : { ...agentSummary(agent), ...workerSummary(worker) };
  });
  const named = new Set(agents.map((agent) => agent.name));

  return [...listed, ...workers.filter((worker) => !named.has(worker.name)).map(workerSummary)];
}

/** The roles an agent may hold as the agents' answer carries them, each named by its code in the pack's words with
 * the bundles it gives, named the same way; a member that does not read as one is left out. */
export function agentRolesOf(answer: unknown): RoleView[] {
  const roles = (answer as { roles?: unknown } | null)?.roles;

  if (!Array.isArray(roles)) return [];

  return roles.flatMap((role): RoleView[] => {
    const held = role as { name?: unknown; code?: unknown; bundles?: unknown };

    if (typeof held?.name !== "string") return [];

    const bundles = Array.isArray(held.bundles)
      ? held.bundles.flatMap((bundle) => {
          const one = bundle as { name?: unknown; code?: unknown };

          return typeof one?.name === "string" ? [{ name: one.name, label: bundleLabelOf(one.code, one.name) }] : [];
        })
      : [];

    return [{ name: held.name, label: roleLabelOf(held.code, held.name), bundles }];
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
export function tierSettingsOf(tiers: readonly Tier[], providers: readonly Provider[], keys: readonly unknown[] = []): TierSettingsView {
  const views: TierProviderView[] = providers.map((provider) => ({
    provider: provider.name as TierProviderView["provider"],
    label: providerLabelOf((provider as { code?: unknown }).code, provider.name),
    capsAnswerTokens: false,
    efforts: [],
    enabled: provider.enabled
  }));
  const assignments = keys.flatMap(assignmentOf);

  return {
    tiers: tiers.map((tier) => tier.name),
    providers: views,
    mappings: tiers.flatMap(tierMappingsOf),
    conflicts: assignments.flatMap((one) => one.conflicts),
    assignments: assignments.map((one) => one.assignment)
  };
}

// One work key's tier as the agency's `GET /work-keys` answers it (its `docs/api.md`): the tier, the tiers it may
// take, what it resolves to on each provider — the error said in the pack's words by its code, the agency's sentence
// kept beside it — and its conflicts; a member that does not read as one is left out.
function assignmentOf(item: unknown): { assignment: TierAssignmentView; conflicts: TierConflict[] }[] {
  const held = item as { key?: unknown; tier?: unknown; choices?: unknown; conflicts?: unknown; effective?: unknown } | null;

  if (typeof held?.key !== "string" || typeof held.tier !== "string") return [];

  const key = held.key;
  const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((one): one is Record<string, unknown> => one !== null && typeof one === "object") : []);
  const effective = list(held.effective).flatMap((one) => {
    if (typeof one.provider !== "string") return [];

    // The agency's fuller account, where it sends one beside its short clause, stands as its own sentence kept.
    const said = roadReasonOf(one.error, one.errorCode, one.detail);

    return [{ provider: one.provider as TierProvider, selection: (one.selection ?? null) as TierMapping | null, error: said.reason, errorEnglish: said.reasonEnglish }];
  });
  const conflicts = list(held.conflicts).flatMap((one): TierConflict[] =>
    typeof one.provider === "string" && one.previous !== null && typeof one.previous === "object"
      ? [{ key, provider: one.provider as TierProvider, previous: one.previous as TierConflict["previous"], accepted: one.accepted === true }]
      : []
  );

  return [{ assignment: { key, tier: held.tier, choices: Array.isArray(held.choices) ? held.choices.filter((one): one is string => typeof one === "string") : [], effective }, conflicts }];
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
