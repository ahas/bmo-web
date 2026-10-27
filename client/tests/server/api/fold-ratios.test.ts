import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { FoldRatiosView, FoldRatioView } from "../../../apps/web/shared/agency";

// The fold-ratio grid's two routes: the agency's list read into the grid the tier tab shows, and one cell's
// percent carried to the agency's set as that provider's ratio at that tier (the agency's `docs/api.md`,
// 「fold-ratios」).

const LISTED = [
  { provider: "claude-code", tier: "Frontier", ratio: 0.85, source: "default" },
  { provider: "openrouter", tier: "Frontier", ratio: 0.5, source: "provider" },
  { provider: "claude-code", tier: "Reliable", ratio: 0.7, source: "set" },
  { provider: "openrouter", tier: "Reliable", ratio: 0.5, source: "provider" }
];

const agency = standIn("AGENCY", (call) => {
  if (call.method === "GET") return answer({ items: LISTED, more: false });

  const [, , provider, tier] = call.path.split("/");

  if (provider === "unknown") return answer({ code: "not-found", error: "unknown provider: unknown" }, 404);
  if (typeof call.body?.ratio !== "number" || call.body.ratio <= 0 || call.body.ratio > 1) {
    return answer({ code: "bad-request", error: "ratio out of range" }, 400);
  }

  return answer({ provider, tier, ratio: call.body.ratio, source: "set" });
});
const list = await routeOf<FoldRatiosView>("../../apps/web/server/api/fold-ratios.get");
const set = await routeOf<FoldRatioView>("../../apps/web/server/api/fold-ratios.post");

describe("reading the grid", () => {
  test("stands a cell for every tier and provider, in the order the agency lists them, each with its source", async () => {
    const read = await asked(list, {});

    expect(read.status).toBe(200);
    expect(read.answer?.tiers).toEqual(["Frontier", "Reliable"]);
    expect(read.answer?.providers).toEqual(["claude-code", "openrouter"]);
    expect(read.answer?.ratios).toHaveLength(read.answer!.tiers.length * read.answer!.providers.length);
    expect(read.answer?.ratios).toContainEqual({ provider: "claude-code", tier: "Reliable", ratio: 0.7, source: "set" });
    expect(agency.asked.at(-1)).toMatchObject({ method: "GET", path: "/fold-ratios" });
  });
});

describe("setting one ratio", () => {
  test("puts that provider's ratio at that tier and answers the member the agency wrote", async () => {
    agency.asked.length = 0;

    const saved = await asked(set, { body: { provider: "openrouter", tier: "Reliable", ratio: 0.6 } });

    expect(saved.status).toBe(200);
    expect(saved.answer).toEqual({ provider: "openrouter", tier: "Reliable", ratio: 0.6, source: "set" });
    expect(agency.asked).toMatchObject([{ method: "PUT", path: "/fold-ratios/openrouter/Reliable", body: { ratio: 0.6 } }]);
  });

  test("says the agency's refusal in the pack's words", async () => {
    expect(await asked(set, { body: { provider: "unknown", tier: "Reliable", ratio: 0.6 } })).toMatchObject({ status: 404, message: wording("agents.error.agency_not_found") });
    expect(await asked(set, { body: { provider: "openrouter", tier: "Reliable", ratio: 1.5 } })).toMatchObject({ status: 400, message: wording("agents.error.agency_bad_request") });
  });

  test("sends nothing for a body that names no provider, no tier or no number", async () => {
    agency.asked.length = 0;

    for (const body of [{ tier: "Reliable", ratio: 0.6 }, { provider: "openrouter", ratio: 0.6 }, { provider: "openrouter", tier: "Reliable" }, { provider: "openrouter", tier: "Reliable", ratio: "0.6" }, null]) {
      expect(await asked(set, { body })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    }
    expect(agency.asked).toEqual([]);
  });
});
