import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { SecretSettingsView } from "../../../apps/web/shared/secret-settings";

// The agency's secret settings as the administration screen's providers tab reads and changes them (docs/web.md,
// 「Administration」; the agency's docs/api.md, 「settings」): each read off `GET /settings` by its field, one changed
// through `PATCH /settings` with its field alone, and the agency's refusal of a name said by the sentence for a refused
// value, naming the field.

const held = { researchSupervisor: "agent-a", downgradeReturn: null, deepseekCardSecret: "card-a" as string | null };

const agency = standIn("AGENCY", (call) => {
  if (call.path !== "/settings") return answer({ code: "not-found", error: "no route" }, 404);
  if (call.method === "PATCH" && call.body?.deepseekCardSecret === "card-refused") {
    return answer({ code: "bad-request", error: "deepseekCardSecret names no plain file name", field: "deepseekCardSecret" }, 400);
  }
  if (call.method === "PATCH") Object.assign(held, call.body);

  return answer(held);
});

const read = await routeOf<SecretSettingsView>("../../apps/web/server/api/secret-settings.get");
const change = await routeOf<SecretSettingsView>("../../apps/web/server/api/secret-settings.put");

describe("the secret settings", () => {
  test("are read off the agency's settings by their fields, a value that is no name read as none", async () => {
    held.deepseekCardSecret = "card-a";
    expect((await asked(read, {})).answer).toEqual({ deepseekCardSecret: "card-a" });

    held.deepseekCardSecret = null;
    expect((await asked(read, {})).answer).toEqual({ deepseekCardSecret: null });
  });

  test("change one setting by its field alone, null for none, answering as the agency then holds them", async () => {
    const chosen = await asked(change, { body: { field: "deepseekCardSecret", secret: "card-b" } });

    expect(chosen.answer).toEqual({ deepseekCardSecret: "card-b" });
    expect(agency.asked.at(-1)).toMatchObject({ method: "PATCH", body: { deepseekCardSecret: "card-b" } });
    expect(Object.keys(agency.asked.at(-1)?.body ?? {})).toEqual(["deepseekCardSecret"]);

    const cleared = await asked(change, { body: { field: "deepseekCardSecret", secret: null } });

    expect(cleared.answer).toEqual({ deepseekCardSecret: null });
  });

  test("refuse a field no setting names and a name that is no plain file name before asking the agency", async () => {
    const before = agency.asked.length;

    for (const body of [{ field: "researchSupervisor", secret: "card-a" }, { field: "deepseekCardSecret", secret: "../card" }, { field: "deepseekCardSecret", secret: "" }, { field: "deepseekCardSecret" }]) {
      const got = await asked(change, { body });

      expect(got.status).toBe(400);
      expect(got.message).toBe(wording("common.error.bad_action"));
    }

    expect(agency.asked.length).toBe(before);
  });

  test("say the agency's refusal of a name by the sentence for a refused value, naming the field", async () => {
    const got = await asked(change, { body: { field: "deepseekCardSecret", secret: "card-refused" } });

    expect(got.status).toBe(400);
    expect(got.message).toBe(wording("agents.error.field_refused"));
    expect(got.data).toEqual({ field: "deepseekCardSecret" });
  });
});
