import { guideFlowFor, guideLeavable, guideOpens, guideRoads, guideSteps, isGuideStep, needOf, platformWorks, stepAt, supplyNeedOf } from "#shared/guide";

import { agency, agencyRoute } from "./agency";
import { userNode } from "./account-service";
import { consoleFeatures } from "./console-features";
import { useWebSql } from "./db";

import type { H3Event } from "h3";
import type { SignedIn } from "./accounts";
import type { GuideAccount, GuideChange, GuideFlow, GuideKept, GuideProvider, GuideView, SupplyNeed, SupplySourcesRead } from "#shared/guide";

// The start guide on the console's server (docs/web.md, 「The start guide」): each person's progress, kept in
// `web_guides` by their user, and what the agency answers of their chain and the platform's sources, read in their
// own name. Which flow and which steps stand is the shared rules' (#shared/guide); this reads and writes what they
// stand on.

interface GuideRow {
  flow: string;
  step: string;
  need: string | null;
  supply_later: boolean;
  road: string | null;
  finished_at: number | null;
  left_at: number | null;
}

const NEEDS: readonly SupplyNeed[] = ["supplied", "optional", "required"];

/** The progress a person keeps, or null where they never opened the guide. */
export async function keptGuide(account: number): Promise<GuideKept | null> {
  const row = (await useWebSql().get(
    "SELECT flow, step, need, supply_later, road, finished_at, left_at FROM web_guides WHERE user_id = $1",
    account
  )) as GuideRow | null;

  if (row === null || (row.flow !== "member" && row.flow !== "platform") || !isGuideStep(row.step)) return null;

  return {
    flow: row.flow,
    step: row.step,
    need: NEEDS.find((one) => one === row.need) ?? null,
    supplyLater: row.supply_later,
    road: row.road,
    finished: row.finished_at !== null,
    left: row.left_at !== null
  };
}

async function keepGuide(account: number, kept: GuideKept, now: number): Promise<void> {
  await useWebSql().run(
    `INSERT INTO web_guides (user_id, flow, step, need, supply_later, road, finished_at, left_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET flow = excluded.flow, step = excluded.step, need = excluded.need,
         supply_later = excluded.supply_later, road = excluded.road, finished_at = excluded.finished_at,
         left_at = excluded.left_at, updated_at = excluded.updated_at`,
    account,
    kept.flow,
    kept.step,
    kept.need,
    kept.supplyLater,
    kept.road,
    kept.finished ? now : null,
    kept.left ? now : null,
    now
  );
}

/** What the agency answers of the person's chain, asked in their name; null where it does not answer. */
export async function supplySourcesOf(event: H3Event): Promise<SupplySourcesRead | null> {
  try {
    const answer = await agency(event).GET("/supply-sources");

    if (answer.data === undefined) return null;

    // `localAi` is read as the agency answers it, whether or not the client's types name it yet.
    const read: typeof answer.data & { localAi?: unknown } = answer.data;

    return { personal: read.personal, personalOnly: read.personalOnly, ownSupply: read.ownSupply, localAi: read.localAi === true };
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  const read = typeof value === "string" ? Number(value) : value;

  return typeof read === "number" && Number.isFinite(read) ? read : null;
}

/** The providers as the guide reads them, asked in the reader's name; none where the agency does not answer. */
async function providersOf(event: H3Event): Promise<GuideProvider[] | null> {
  try {
    const answer = await agency(event).GET("/providers");

    if (answer.data === undefined) return null;

    return answer.data.items.map((one) => ({
      name: one.name,
      enabled: one.enabled,
      gateway: one.gateway,
      registered: one.registered,
      reasonCode: one.reasonCode ?? null,
      keyFile: one.keyFile ?? null
    }));
  } catch {
    return null;
  }
}

/** Whether the platform holds a working source, as the administrator reads it; null where it could not be read. */
async function platformWorking(event: H3Event, signed: SignedIn, providers: GuideProvider[] | null): Promise<boolean | null> {
  if (providers === null) return null;

  try {
    const answer = await agency(event).GET("/fallback");

    if (answer.data === undefined) return null;

    const accounts: GuideAccount[] = answer.data.accounts.map((one) => ({ enabled: one.enabled, login: one.login, userId: numberOrNull(one.userId) }));

    return platformWorks(providers, accounts, signed.id);
  } catch {
    return null;
  }
}

/** The roads the gateway holds members of. */
async function memberRoads(): Promise<Set<string>> {
  const answer = await agencyRoute<{ items?: { road?: string | null }[] }>("GET", "/gateway-members").catch(() => ({ items: [] }));

  return new Set((answer.items ?? []).flatMap((one) => (typeof one.road === "string" ? [one.road] : [])));
}

/** Whether the person's machine is attached; a read that fails counts as attached, so nobody is held at a step. */
async function machineAttached(account: number): Promise<boolean> {
  try {
    const machine = await userNode(account);

    return typeof machine.agent === "string" && machine.attached === true;
  } catch {
    return true;
  }
}

/** Everything one read of the guide stands on. */
interface GuideFacts {
  flow: GuideFlow | null;
  kept: GuideKept | null;
  live: SupplyNeed;
  providers: GuideProvider[] | null;
  // Whether a member may add a local AI of their own now.
  localAi: boolean;
}

async function factsOf(event: H3Event, signed: SignedIn): Promise<GuideFacts> {
  const account = signed.id;

  if (account === null) return { flow: null, kept: null, live: "supplied", providers: null, localAi: false };

  const kept = await keptGuide(account);

  if (signed.administrator) {
    const providers = await providersOf(event);
    const flow = guideFlowFor({ administrator: true, account: true }, kept, await platformWorking(event, signed, providers));

    return { flow, kept: kept?.flow === flow ? kept : null, live: "supplied", providers, localAi: false };
  }

  const sources = await supplySourcesOf(event);

  return { flow: "member", kept: kept?.flow === "member" ? kept : null, live: supplyNeedOf(sources), providers: null, localAi: sources?.localAi === true };
}

/** Whether the guide opens by itself for the reader now, read with no more than its gate needs. */
export async function guideOpensFor(event: H3Event, signed: SignedIn): Promise<boolean> {
  const facts = await factsOf(event, signed);

  return guideOpens(facts.flow, facts.kept, facts.live === "required");
}

/** The guide as it stands for the reader. */
export async function guideViewOf(event: H3Event, signed: SignedIn): Promise<GuideView> {
  const facts = await factsOf(event, signed);
  const requiredNow = facts.live === "required";
  const need = facts.flow === "member" ? needOf(facts.kept, facts.live) : "supplied";
  const supplyLater = facts.kept?.supplyLater === true && need !== "required";
  const none: GuideView = { flow: null, steps: [], step: null, need, supplyLater: false, road: null, roads: [], finished: false, opens: false, leavable: true };

  if (facts.flow === null || signed.id === null) return none;

  const [attached, features, providers, members] = await Promise.all([
    facts.flow === "member" ? machineAttached(signed.id) : Promise.resolve(true),
    consoleFeatures(),
    facts.providers ?? providersOf(event),
    memberRoads()
  ]);
  // A member's local AI is offered where the agency says they may add one now: their chain allows it and a PC of their
  // own reaches its address.
  const roads = guideRoads(facts.flow, providers ?? [], members, facts.localAi);
  const steps = guideSteps(facts.flow, { need, supplyLater, machineAttached: attached, organisations: features.organizations });

  return {
    flow: facts.flow,
    steps,
    step: stepAt(steps, facts.kept?.finished === true ? null : (facts.kept?.step ?? null)),
    need,
    supplyLater,
    road: facts.kept?.road ?? null,
    roads,
    finished: facts.kept?.finished === true,
    opens: guideOpens(facts.flow, facts.kept, requiredNow),
    leavable: guideLeavable(facts.flow, requiredNow)
  };
}

/**
 * A change of the reader's progress: a step reached, the supply put off or taken up, the road chosen, the guide
 * finished, put aside or begun again. The first change keeps the flow and the need as they read now. A member who must
 * bring their own and holds none on cannot put it aside.
 */
export async function changeGuide(event: H3Event, signed: SignedIn, change: GuideChange, now: number = Date.now()): Promise<GuideView> {
  const account = signed.id;

  if (account === null) return await guideViewOf(event, signed);

  if (change.restart === true) {
    await useWebSql().run("DELETE FROM web_guides WHERE user_id = $1", account);

    return await guideViewOf(event, signed);
  }

  const view = await guideViewOf(event, signed);

  if (view.flow === null) return view;

  const kept = (await keptGuide(account)) ?? {
    flow: view.flow,
    step: view.step ?? "talk",
    need: view.flow === "member" ? view.need : null,
    supplyLater: false,
    road: null,
    finished: false,
    left: false
  };
  const next: GuideKept = {
    ...kept,
    flow: view.flow,
    step: change.step ?? kept.step,
    supplyLater: change.supplyLater ?? kept.supplyLater,
    road: change.road === undefined ? kept.road : change.road,
    finished: kept.finished || change.finish === true,
    left: change.leave === true ? view.leavable : change.step === undefined ? kept.left : false
  };

  await keepGuide(account, next, now);

  return await guideViewOf(event, signed);
}

/** The roads whose test the reader may ask: the agency's provider names, the registry's among them. */
export function testedRoad(value: unknown): string | null {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value) ? value : null;
}

