// The start guide (docs/web.md, 「The start guide」): which flow a reader is shown, which of its steps stand, where
// it stands and whether it opens by itself. Every rule here is a pure function of what the console's server read,
// so the server and the page agree on it and the tests read it alone.

/** The two flows: an invited member's first run, and the administrator's first sign-in with no working platform source. */
export type GuideFlow = "member" | "platform";

/** What the supply step is for a member, by what their chain leaves open. */
export type SupplyNeed = "supplied" | "optional" | "required";

/** Every step a flow may hold, in the one order they stand in. */
export const GUIDE_ORDER = ["welcome", "supply", "provider", "connect", "test", "machine", "model", "company", "talk"] as const;

export type GuideStep = (typeof GUIDE_ORDER)[number];

/** How a road is brought: a Claude sign-in, a key typed once, or a local AI's address. */
export type GuideRoadKind = "login" | "key" | "local";

/** One choice of the provider step: the agency's provider it brings supply for, and how it is brought. */
export interface GuideRoad {
  road: string;
  kind: GuideRoadKind;
  // The file name under the platform's secret space the provider reads its key from, for the administrator's key.
  keyFile: string | null;
}

/** What the agency answers of a person's chain (its `GET /supply-sources`), as far as the guide reads it. */
export interface SupplySourcesRead {
  personal: boolean;
  personalOnly: boolean;
  ownSupply: boolean;
  // Whether they may add a local AI of their own now: their chain allows it and they hold a PC of their own.
  localAi: boolean;
}

/** What the console keeps of a person's progress. */
export interface GuideKept {
  flow: GuideFlow;
  step: GuideStep;
  need: SupplyNeed | null;
  supplyLater: boolean;
  road: string | null;
  finished: boolean;
  left: boolean;
}

/** The guide as the console's server answers it to the page. */
export interface GuideView {
  flow: GuideFlow | null;
  steps: GuideStep[];
  step: GuideStep | null;
  need: SupplyNeed;
  supplyLater: boolean;
  road: string | null;
  roads: GuideRoad[];
  finished: boolean;
  opens: boolean;
  leavable: boolean;
}

/** A change of the progress the page writes as a step is passed. */
export interface GuideChange {
  step?: GuideStep;
  supplyLater?: boolean;
  road?: string | null;
  finish?: true;
  leave?: true;
  restart?: true;
}

/** What a source's test answered: whether it answered, and the agency's reason where it did not. */
export interface GuideTest {
  ok: boolean;
  reasonCode: string | null;
}

/** The address of the guide's page. */
export const GUIDE_PATH = "/start";

/**
 * What the supply step is: no step where the order holds no personal supply or one of the person's own is on already,
 * required where their own is all that can carry their runs, optional otherwise. An agency that did not answer asks
 * nothing of the person.
 */
export function supplyNeedOf(sources: SupplySourcesRead | null): SupplyNeed {
  if (sources === null || !sources.personal || sources.ownSupply) return "supplied";

  return sources.personalOnly ? "required" : "optional";
}

/** Whether the person must bring their own before anything else opens: their own is all there is and none is on. */
export function supplyRequiredNow(sources: SupplySourcesRead | null): boolean {
  return supplyNeedOf(sources) === "required";
}

/**
 * The flow a reader is shown: a member's for every person with a user who is not the administrator; the
 * administrator's where one is begun and not finished, or where the platform has no working source. A platform whose
 * sources could not be read begins nothing.
 */
export function guideFlowFor(reader: { administrator: boolean; account: boolean }, kept: GuideKept | null, platformWorks: boolean | null): GuideFlow | null {
  if (!reader.account) return null;
  if (!reader.administrator) return "member";
  if (kept !== null && kept.flow === "platform" && !kept.finished) return "platform";

  return platformWorks === false ? "platform" : null;
}

/** The need the steps stand on: the one kept as the flow began, required while the person must bring their own now. */
export function needOf(kept: GuideKept | null, live: SupplyNeed): SupplyNeed {
  if (live === "required") return "required";

  return kept?.need ?? live;
}

/** What a flow's steps stand on beside the need. */
export interface StepFacts {
  need: SupplyNeed;
  supplyLater: boolean;
  machineAttached: boolean;
  organisations: boolean;
}

/** The steps a flow holds for the reader, in order; a step with nothing to do stands as none. */
export function guideSteps(flow: GuideFlow, facts: StepFacts): GuideStep[] {
  if (flow === "platform") return ["provider", "connect", "test", "model", ...(facts.organisations ? (["company"] as const) : []), "talk"];

  const supplied = facts.need === "required" || (facts.need === "optional" && !facts.supplyLater);

  return [
    "welcome",
    ...(facts.need === "supplied" ? [] : (["supply"] as const)),
    ...(supplied ? (["provider", "connect", "test"] as const) : []),
    ...(facts.machineAttached ? [] : (["machine"] as const)),
    "talk"
  ];
}

/** The step the page opens at: the one kept where it stands, else the first standing after it, else the first. */
export function stepAt(steps: readonly GuideStep[], kept: GuideStep | null): GuideStep | null {
  if (steps.length === 0) return null;
  if (kept === null) return steps[0]!;

  const from = GUIDE_ORDER.indexOf(kept);

  return steps.find((step) => GUIDE_ORDER.indexOf(step) >= from) ?? steps[steps.length - 1]!;
}

/** The step after or before one, or null at an end. */
export function stepBeside(steps: readonly GuideStep[], step: GuideStep, by: 1 | -1): GuideStep | null {
  const at = steps.indexOf(step);

  return at < 0 ? null : (steps[at + by] ?? null);
}

/** Whether the reader may put the guide aside: anywhere but while a member must bring their own and holds none on. */
export function guideLeavable(flow: GuideFlow | null, requiredNow: boolean): boolean {
  return !(flow === "member" && requiredNow);
}

/**
 * Whether the guide opens by itself: for a member while their own supply is required and none is on; for the
 * administrator while their flow stands neither finished nor put aside.
 */
export function guideOpens(flow: GuideFlow | null, kept: GuideKept | null, requiredNow: boolean): boolean {
  if (flow === "member") return requiredNow;
  if (flow === "platform") return kept === null || (!kept.finished && !kept.left);

  return false;
}

/** Where a step stands in its flow, counted from one, and the share of the flow it reaches. */
export function guideProgress(steps: readonly GuideStep[], step: GuideStep): { at: number; of: number; share: number } {
  const at = steps.indexOf(step) + 1;

  return { at, of: steps.length, share: steps.length === 0 ? 0 : Math.round((at / steps.length) * 100) };
}

/** Whether a name is a step of the guide. */
export function isGuideStep(value: unknown): value is GuideStep {
  return typeof value === "string" && (GUIDE_ORDER as readonly string[]).includes(value);
}

/**
 * The chat completions address a local AI's base address stands for: the address as typed where it ends in the path
 * already, else the path added to it.
 */
export function completionsAddress(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");

  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

/** The registry's provider, whose registrations a local AI becomes. */
export const REGISTRY_ROAD = "registered";

/** The agency's provider whose logins are its accounts. */
export const CLAUDE_ROAD = "claude-code";

/** A provider as the guide reads the agency's list of them. */
export interface GuideProvider {
  name: string;
  enabled: boolean;
  gateway: boolean;
  registered: boolean;
  reasonCode: string | null;
  keyFile: string | null;
}

/** A Claude account as the guide reads the agency's list of them. */
export interface GuideAccount {
  enabled: boolean;
  login: string;
  userId: number | null;
}

/**
 * Whether the platform holds a working source: a provider other than Claude Code switched on and able to answer, or
 * a Claude account on whose login stands among those no other person owns.
 */
export function platformWorks(providers: readonly GuideProvider[], accounts: readonly GuideAccount[], administrator: number | null): boolean {
  const claude = providers.find((one) => one.name === CLAUDE_ROAD);
  const other = providers.some((one) => one.name !== CLAUDE_ROAD && one.enabled && one.reasonCode === null);
  const login =
    claude !== undefined &&
    claude.enabled &&
    accounts.some((one) => one.enabled && (one.login === "standing" || one.login === "ending") && (one.userId === null || one.userId === administrator));

  return other || login;
}

/**
 * The roads the provider step offers. A member: Claude, signed in on their own PC, a key of every gateway road
 * switched on whose road holds a member of the gateway, and a local AI their own PC reaches where `localOpen` says
 * they may add one now. The administrator: Claude signed in on the server, a key of
 * every switched-on provider that reads its own key from a file, and a local AI.
 */
export function guideRoads(flow: GuideFlow, providers: readonly GuideProvider[], memberRoads: ReadonlySet<string>, localOpen = false): GuideRoad[] {
  const on = providers.filter((one) => one.enabled);

  if (flow === "member") {
    return on.flatMap((one): GuideRoad[] => {
      if (one.name === CLAUDE_ROAD) return [{ road: one.name, kind: "login", keyFile: null }];
      if (one.registered) return localOpen ? [{ road: one.name, kind: "local", keyFile: null }] : [];
      if (one.gateway && memberRoads.has(one.name)) return [{ road: one.name, kind: "key", keyFile: null }];

      return [];
    });
  }

  return on.flatMap((one): GuideRoad[] => {
    if (one.name === CLAUDE_ROAD) return [{ road: one.name, kind: "login", keyFile: null }];
    if (one.registered) return [{ road: one.name, kind: "local", keyFile: null }];
    if (one.keyFile !== null) return [{ road: one.name, kind: "key", keyFile: one.keyFile }];

    return [];
  });
}

/** The agency's reasons a source's test answers, each with its sentence in the pack; one the pack has no sentence for
 * reads as a failed try. */
const TEST_REASONS: Readonly<Record<string, string>> = {
  "no-source": "guide.message.reason_no_source",
  "login-needed": "guide.message.reason_login_needed",
  "not-ready": "guide.message.reason_not_ready",
  refused: "guide.message.reason_refused",
  off: "guide.message.reason_off",
  failed: "guide.message.reason_failed",
  withheld: "guide.message.reason_withheld",
  "no-pc": "guide.message.reason_no_pc",
  unreachable: "guide.message.reason_unreachable"
};

/** The pack's key of the sentence for a test's reason. */
export function testReasonKey(code: string | null): string {
  return TEST_REASONS[code ?? "failed"] ?? "guide.message.reason_failed";
}
