import { expect, test } from "bun:test";

import { permissionLines, permissionText } from "../../../apps/web/app/domain/app-permissions";
import { wording } from "../../../apps/web/shared/wording";

// What a personal app may reach, said plainly line by line (docs/web.md, 「App catalogue」): its own data alone, or the
// addresses and secrets it names with what each means, the secrets the reader's space lacks and what their
// organisation does not allow.

const everything = { network: true, secrets: true, held: ["team-key"] };

test("an app asking for nothing more says it uses its own data alone", () => {
  expect(permissionLines(wording, { network: [], secrets: [] }, everything).map((line) => line.key)).toEqual(["own"]);
  expect(permissionText(wording, { network: [], secrets: [] }, everything)).toBe(wording("app_permissions.label.own_data"));
});

test("the addresses and secrets stand with what they mean, and what keeps the app from running is a warning", () => {
  const asked = { network: ["api.example.com"], secrets: ["team-key", "rates-key"] };
  const allowed = permissionLines(wording, asked, everything);

  expect(allowed.map((line) => line.key)).toEqual(["network", "network-note", "secrets", "secrets-note", "secrets-missing"]);
  expect(allowed.find((line) => line.key === "secrets-missing")).toMatchObject({ values: ["rates-key"], tone: "warning" });

  const withheld = permissionLines(wording, asked, { network: false, secrets: false, held: ["team-key", "rates-key"] });

  expect(withheld.filter((line) => line.tone === "warning").map((line) => line.key)).toEqual(["network-withheld", "secrets-withheld"]);
  expect(permissionText(wording, asked, everything).split("\n")[0]).toBe(`${wording("app_permissions.label.network")} api.example.com`);
});
