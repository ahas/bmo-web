import { expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { FallbackView } from "../../../apps/web/shared/types";

// The road table's rows come from the agency's profiles, and the console reads no gate options beside them:
// the gates page and its per-gate settings are gone.

const profile = (key: string, kind: string): Record<string, unknown> => ({ key, label: key, kind, line: kind, services: [], offered: [] });

standIn("AGENCY", () => answer({ profiles: [profile("sanitizer", "gate"), profile("job-worker", "worker")] }));
const gate = standIn("GATE", () => answer({ code: "no-gate", error: "Not a gate" }, 404));
const handler = await routeOf<FallbackView>("../../apps/web/server/api/fallback.get");

test("carries the agency's profiles and asks the gate unit nothing", async () => {
  const { status, answer: view } = await asked(handler, {});

  expect(status).toBe(200);
  expect(view?.profiles.map((one) => one.key)).toEqual(["sanitizer", "job-worker"]);
  expect(view?.profiles.every((one) => !("gateOptions" in one))).toBe(true);
  expect(gate.asked).toEqual([]);
});
