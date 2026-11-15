import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { SecretSettingsView } from "../../../apps/web/shared/secret-settings";

// The agency's secret settings as the administration screen's providers tab reads and changes them (docs/web.md,
// 「Administration」; the agency's docs/api.md, 「settings」): each read off `GET /settings` by its field, one changed
// through `PATCH /settings` with its field alone, and the agency's refusal of a name said by the sentence for a refused
// value, naming the field.

const held = { researchSupervisor: "agent-a", downgradeReturn: null, deepseekCardSecret: "card-a" as string | null, deepseekLoginSecret: "login-a" as string | null };

// A name ending in `-refused` is refused as the agency refuses a name, naming the field it was asked for.
const agency = standIn("AGENCY", (call) => {
  if (call.path !== "/settings") return answer({ code: "not-found", error: "no route" }, 404);
  const refused = call.method === "PATCH" ? Object.entries(call.body ?? {}).find(([, value]) => typeof value === "string" && value.endsWith("-refused")) : undefined;

  if (refused) return answer({ code: "bad-request", error: `${refused[0]} names no plain file name`, field: refused[0] }, 400);
  if (call.method === "PATCH") Object.assign(held, call.body);

  return answer(held);
});

const read = await routeOf<SecretSettingsView>("../../apps/web/server/api/secret-settings.get");
const change = await routeOf<SecretSettingsView>("../../apps/web/server/api/secret-settings.put");

describe("the secret settings", () => {
  test("are read off the agency's settings by their fields, a value that is no name read as none", async () => {
    held.deepseekCardSecret = "card-a";
    held.deepseekLoginSecret = "login-a";
    expect((await asked(read, {})).answer).toEqual({ deepseekCardSecret: "card-a", deepseekLoginSecret: "login-a" });

    held.deepseekCardSecret = null;
    held.deepseekLoginSecret = "";
    expect((await asked(read, {})).answer).toEqual({ deepseekCardSecret: null, deepseekLoginSecret: null });
  });

  test("change one setting by its field alone, null for none, answering as the agency then holds them", async () => {
    held.deepseekCardSecret = "card-a";
    held.deepseekLoginSecret = "login-a";

    for (const [field, name, other] of [["deepseekCardSecret", "card-b", "deepseekLoginSecret"], ["deepseekLoginSecret", "login-b", "deepseekCardSecret"]] as const) {
      const before = held[other];
      const chosen = await asked(change, { body: { field, secret: name } });

      expect(chosen.answer).toEqual({ [field]: name, [other]: before });
      expect(agency.asked.at(-1)).toMatchObject({ method: "PATCH", body: { [field]: name } });
      expect(Object.keys(agency.asked.at(-1)?.body ?? {})).toEqual([field]);

      const cleared = await asked(change, { body: { field, secret: null } });

      expect(cleared.answer).toEqual({ [field]: null, [other]: before });
    }
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
    for (const [field, name] of [["deepseekCardSecret", "card-refused"], ["deepseekLoginSecret", "login-refused"]] as const) {
      const got = await asked(change, { body: { field, secret: name } });

      expect(got.status).toBe(400);
      expect(got.message).toBe(wording("agents.error.field_refused"));
      expect(got.data).toEqual({ field });
    }
  });
});
