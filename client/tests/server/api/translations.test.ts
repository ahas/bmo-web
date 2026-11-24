import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import { openedRoute } from "../../../apps/web/server/utils/opened-routes";

// The console's own translating route (docs/web.md, 「The original, and its translation in its place」): every
// signed-in reader asks it, a member as much as the administrator, since a store item and a reader's own screen's
// name are read on view by both; the gate is asked with the reader's own role and the language as the browser named
// it, any of the console's four.

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["signedInUser"]);

const gate = standIn(
  "GATE",
  (call) => answer({ readings: ((call.body?.originals ?? []) as string[]).map((text) => ({ text: `${String(call.body?.language)}:${text}`, whole: true })) }),
  { headers: true }
);

const translations = await routeOf<{ readings: { text: string; whole: boolean }[] }>("../../apps/web/server/api/translations.post");

describe("the console's translating route", () => {
  test("is every signed-in login's, of no section", () => {
    expect(openedRoute("POST", "/api/translations")).toEqual(expect.objectContaining({ scope: "user" }));
    expect(openedRoute("POST", "/api/translations")?.sections).toBeUndefined();
  });

  test("reads a member's text into their language, asking the gate as a member", async () => {
    globals.signedInUser = async () => ({ id: 7, name: "member-a", administrator: false });

    for (const language of ["ja", "zh-CN"]) {
      gate.asked.length = 0;

      const read = await asked(translations, { body: { language, originals: ["Weekly summary"] } });

      expect(read.answer).toEqual({ readings: [{ text: `${language}:Weekly summary`, whole: true }] });
      expect(gate.asked.map((call) => [call.path, call.body?.language, call.headers?.["owner-role"]])).toEqual([["/translations", language, "member"]]);
    }
  });

  test("asks as the administrator for the administrator", async () => {
    globals.signedInUser = async () => ({ id: 1, name: "tester", administrator: true });
    gate.asked.length = 0;

    await asked(translations, { body: { language: "ko", originals: ["Weekly summary"] } });
    expect(gate.asked.map((call) => call.headers?.["owner-role"])).toEqual(["administrator"]);
  });

  test("refuses a call naming no language or no original", async () => {
    expect((await asked(translations, { body: { language: "", originals: ["a"] } })).status).toBe(400);
    expect((await asked(translations, { body: { language: "ja", originals: [] } })).status).toBe(400);
  });
});
