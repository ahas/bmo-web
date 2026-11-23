import { expect, test } from "bun:test";
import { join } from "node:path";

import { consoleVersionAt } from "../apps/web/modules/console-version";

// The console states the commit it was built from as its version, read from git as the build runs, and none where git
// names none (docs/web.md, 「Screens a unit brings」).

test("a build in a checkout states the commit git names, in its short form", () => {
  expect(consoleVersionAt(join(import.meta.dir, ".."))).toMatch(/^[0-9a-f]{7,}$/);
  expect(consoleVersionAt("/anywhere", () => "1a2b3c4\n")).toBe("1a2b3c4");
});

test("a build where git names no commit states none", () => {
  expect(
    consoleVersionAt("/anywhere", () => {
      throw new Error("not a git repository");
    })
  ).toBe("");
});
