import { expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { FallbackView, GateOptionsView } from "../../../apps/web/shared/types";

// A gate's options are the gate unit's: the road table's rows come from the agency's profiles, and each gate the
// gate unit lists carries its options as the gate unit answers them (docs/web.md, the agents page's gates tab).

const profile = (key: string, kind: string): Record<string, unknown> => ({ key, label: key, kind, line: kind, services: [], offered: [] });
const OPTIONS: GateOptionsView = {
  timeoutMs: 60_000,
  layaMode: null,
  layaTau: null,
  layaProbe: true,
  switchable: false,
  enabled: true,
  layaFallback: null,
  effective: { thinking: false, answerTokens: 2048, timeoutMs: 60_000, layaMode: "shadow", layaTau: null },
  defaults: { thinking: false, answerTokens: 2048, layaMode: "shadow", layaTau: null }
};

standIn("AGENCY", () => answer({ profiles: [profile("output-format", "gate"), profile("sanitizer", "gate"), profile("job-worker", "worker")] }));
const gate = standIn("GATE", (call) => {
  if (call.path.startsWith("/gates")) return answer({ items: [{ gateName: "output-format", part: "post", step: 0, condition: null, switchable: false, layaProbe: true, defaultLayaMode: "shadow", answerTokens: null }], more: false });
  if (call.path === "/options/output-format") return answer(OPTIONS);

  return answer({ code: "no-gate", error: "Not a gate" }, 404);
});
const handler = await routeOf<FallbackView>("../../apps/web/server/api/fallback.get");

test("a gate the gate unit lists carries its options, and no other row does", async () => {
  const { status, answer: view } = await asked(handler, {});
  const byKey = new Map((view?.profiles ?? []).map((one) => [one.key, one]));

  expect(status).toBe(200);
  expect(byKey.get("output-format")?.gateOptions).toEqual(OPTIONS);
  expect(byKey.get("sanitizer")?.gateOptions).toBeUndefined();
  expect(byKey.get("job-worker")?.gateOptions).toBeUndefined();
  // Only a listed gate is asked for its options.
  expect(gate.asked.map((call) => call.path)).toEqual(["/gates", "/options/output-format"]);
});
