import { expect, test } from "bun:test";

import { decidedLine } from "../../../apps/web/app/domain/chain-decided";
import { wording } from "../../../apps/web/shared/wording";

// Who decided a setting of the delegation chain standing for the reader, as their own settings say it (docs/web.md,
// 「Settings」, the supply and own-BMO sections).

test("a unit above is named where its name is read, the platform says so, and the default says nothing", () => {
  expect(decidedLine(wording, { by: "unit", name: "unit-a" })).toBe(wording("org_agents.label.decided_named", { name: "unit-a" }));
  expect(decidedLine(wording, { by: "unit", name: null })).toBe(wording("org_agents.label.decided_unit"));
  expect(decidedLine(wording, { by: "platform" })).toBe(wording("org_agents.label.decided_platform"));
  expect(decidedLine(wording, null)).toBeNull();
});
