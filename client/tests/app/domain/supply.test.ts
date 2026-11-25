import { describe, expect, test } from "bun:test";

import {
  NO_PLAN,
  applyChoices,
  loginStatus,
  meSetting,
  movedSourceOrder,
  orderRows,
  ownerText,
  planChoice,
  planTermText,
  policyDraft,
  roadOwner,
  withExposure
} from "../../../apps/web/app/domain/supply";

import { globalsRestoredAfter } from "../../support/globals";

import type { ClaudeAccountView } from "../../../apps/web/shared/types";
import type { GatewayMember, SupplySourceState } from "../../../apps/web/shared/supply";

// Supply as the console's screens read it (docs/web.md, 「System and organisation」, the supply tab at the reader's own
// node and the plans tab, and the providers and credits groups): how the reader's order stands and what a change of it
// writes, whose a road or an account is, and an organisation's plans.

// The host's zone a plan's days are read in, as the app's settings carry it.
globalsRestoredAfter(["useAppConfig"]);
Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

const t = (key: string, values?: Record<string, unknown>) => `${key}${values ? JSON.stringify(values) : ""}`;

function source(name: SupplySourceState["source"], standing: Partial<SupplySourceState> = {}): SupplySourceState {
  return { source: name, allowed: true, off: false, locked: false, ...standing };
}

// A reader whose order holds the organisation's credits, standing on as the platform's default, and their own
// supply, which the platform locks on; who switched the global supply off; and whose organisation closed the personal
// credits, which they had switched on.
const ME = {
  order: ["org_credits", "personal", "stop"] as SupplySourceState["source"][],
  sources: [
    source("personal", { locked: true }),
    source("global", { off: true, own: "off" }),
    source("org_credits"),
    source("personal_credits", { allowed: false, reason: "blocked-by-organisation", own: "on" }),
    source("stop", { locked: true })
  ]
};

describe("the reader's order", () => {
  test("stands the resolved order, then what stands off, then the end of the fall, then what a later layer closed", () => {
    expect(orderRows(ME).map((row) => `${row.kind}:${row.source}:${row.on ? "on" : "off"}`)).toEqual(["live:org_credits:on", "live:personal:on", "live:global:off", "stop:stop:on", "closed:personal_credits:off"]);
    expect(orderRows(ME).find((row) => row.source === "personal_credits")?.reason).toBe("blocked-by-organisation");
  });

  test("stands a source the platform holds off for everyone among the reader's own, off and locked, never as closed", () => {
    const rows = orderRows({ order: ["personal", "stop"], sources: [source("personal"), source("global", { allowed: false, off: true, locked: true })] });

    expect(rows.map((row) => [row.kind, row.source, row.on, row.locked])).toEqual([
      ["live", "personal", true, false],
      ["live", "global", false, true],
      ["stop", "stop", true, false]
    ]);
  });

  test("writes back every choice the reader holds and the one just switched, so the rest keep following the platform's default", () => {
    const rows = orderRows(ME);

    // The personal credits a layer above closed stand out of the order, and their stored choice goes back as it stands.
    expect(meSetting(rows, 500)).toEqual({ order: ["org_credits", "personal", "global"], off: ["global"], on: ["personal_credits"], personalCreditCredits: 500 });
    expect(meSetting(rows, 500, { source: "global", on: true })).toEqual({ order: ["org_credits", "personal", "global"], off: [], on: ["global", "personal_credits"], personalCreditCredits: 500 });
    expect(meSetting(rows, 500, { source: "org_credits", on: false })).toMatchObject({ off: ["org_credits", "global"], on: ["personal_credits"] });
    expect(meSetting(rows, null, { cap: 900 }).personalCreditCredits).toBe(900);
  });

  test("sends back a choice of a source the platform locks as it stands, and lets no switch change it", () => {
    const rows = orderRows({ order: ["personal", "stop"], sources: [source("personal", { locked: true, own: "off" }), source("stop", { locked: true })] });

    expect(meSetting(rows, null, { source: "personal", on: true })).toMatchObject({ off: ["personal"], on: [] });
  });

  test("leaves a source the platform locks off out of the order, beside the one it locks on", () => {
    const rows = orderRows({ order: ["personal", "stop"], sources: [source("personal", { locked: true }), source("global", { allowed: false, off: true, locked: true }), source("org_credits", { off: true })] });

    expect(meSetting(rows, null)).toEqual({ order: ["personal", "org_credits"], off: [], on: [], personalCreditCredits: null });
  });

  test("moves a source one place among the reader's own, and leaves the order as it was for a place past its ends", () => {
    const rows = orderRows(ME);

    expect(movedSourceOrder(rows, 1, 0)).toEqual(["personal", "org_credits", "global"]);
    expect(movedSourceOrder(rows, 2, 3)).toEqual(["org_credits", "personal", "global"]);
    expect(meSetting(rows, null, { order: movedSourceOrder(rows, 0, 1) }).order).toEqual(["personal", "org_credits", "global"]);
  });
});

describe("the platform's policy form", () => {
  test("opens on what the platform leaves to a person, and on nothing left for another layer's form", () => {
    const policy = { allowed: ["personal" as const], order: ["personal" as const, "stop" as const], memberCreditCredits: null };

    expect(policyDraft(policy, { overridable: ["personal"], orderOverridable: true })).toMatchObject({ overridable: ["personal"], orderOverridable: true });
    expect(policyDraft(policy)).toMatchObject({ overridable: [], orderOverridable: false });
  });
});

describe("whose supply is", () => {
  const member = (name: string, road: string | null, account: string | null): GatewayMember => ({ name, road, label: name, provider: "openai", account });

  test("names the one person every member of a road belongs to, and nobody for a road of the platform's, mixed or empty", () => {
    const members = [member("a", "deepseek", "7"), member("b", "deepseek", "7"), member("c", "openrouter", "7"), member("d", "openrouter", null), member("e", "codex", "7"), member("f", "codex", "8"), member("g", null, "7")];

    expect(roadOwner(members, "deepseek")).toBe("7");
    expect(roadOwner(members, "openrouter")).toBeNull();
    expect(roadOwner(members, "codex")).toBeNull();
    expect(roadOwner(members, "claude")).toBeNull();
  });

  test("says the platform's as shared, and a person's by the name their account goes by", () => {
    const names = new Map([["7", "Tester"]]);

    expect(ownerText(t, null, names)).toBe("supply.label.owner_shared");
    expect(ownerText(t, undefined, names)).toBe("supply.label.owner_shared");
    expect(ownerText(t, "7", names)).toBe('supply.label.owner_personal{"name":"Tester"}');
    // The agency writes an account's owner as a number.
    expect(ownerText(t, 7, names)).toBe('supply.label.owner_personal{"name":"Tester"}');
    expect(ownerText(t, "8", names)).toBe('supply.label.owner_personal{"name":"hardware.label.unknown_account{\\"id\\":\\"8\\"}"}');
  });
});

describe("an organisation's plans", () => {
  test("choose the plan applied in the dialog, none where none is", () => {
    expect(planChoice({ plan: 3 })).toBe("3");
    expect(planChoice(null)).toBe(NO_PLAN);
  });

  test("list the plan applied among the dialog's choices, read off the answer, where it is shown no longer", () => {
    const shown = { id: 2, name: "shown", price: 10, scope: "organisation" as const, period: "month", includedCredits: 5, creditsUsable: true };
    const applied = { plan: 7, since: 0, periodEnd: 1, name: "retired", price: 20, scope: "organisation", period: "year", includedCredits: null, creditsUsable: false };

    expect(applyChoices({ exposed: [shown], applied }).map((one) => [one.id, one.name, one.period])).toEqual([
      [7, "retired", "year"],
      [2, "shown", "month"]
    ]);
    expect(applyChoices({ exposed: [shown], applied: { ...applied, plan: 2, name: "shown" } }).map((one) => one.id)).toEqual([2]);
    expect(applyChoices({ exposed: [shown], applied: null }).map((one) => one.id)).toEqual([2]);
  });

  test("write the plans shown with one switch thrown and the rest as they stand", () => {
    const catalogue = [
      { id: 1, exposed: true },
      { id: 2, exposed: false },
      { id: 3, exposed: true }
    ];

    expect(withExposure(catalogue, 2, true)).toEqual([1, 2, 3]);
    expect(withExposure(catalogue, 3, false)).toEqual([1]);
  });

  test("say how long the plan applied runs, day to day", () => {
    const since = Date.UTC(2026, 10, 1, 12);
    const end = Date.UTC(2026, 11, 1, 12);

    expect(planTermText(t, { since, periodEnd: end })).toBe('supply.label.plan_term_line{"since":"2026-11-01","end":"2026-12-01"}');
  });
});

describe("what one's own Claude login can do now", () => {
  const login = (over: Partial<ClaudeAccountView>): ClaudeAccountView => ({
    id: "mine",
    name: "mine",
    place: 1,
    enabled: true,
    credentialKind: "directory",
    credentialPath: "/home/user/.claude",
    login: "standing",
    loginEndsAt: null,
    chosen: false,
    restUntil: null,
    ...over
  });

  test("a login never signed in on the agency's machine says it is not signed in", () => {
    expect(loginStatus(t, login({ login: "none" }), 0)).toMatchObject({ label: "supply.label.login_none", tone: "text-error" });
  });

  test("a standing login goes out", () => {
    expect(loginStatus(t, login({}), 0).label).toBe("supply.label.usable");
  });
});
