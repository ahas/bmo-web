import { describe, expect, test } from "bun:test";

// The served build's entry (docs/web.md, 「Running as a service」): Nitro's Bun entry with the idle limit off, so the
// console's server keeps no clock on a connection, and nothing in the console's unit sets one back.

const at = (path: string) => new URL(path, import.meta.url);
const config = await Bun.file(at("../../apps/web/nuxt.config.ts")).text();
const entry = await Bun.file(at("../../apps/web/server/bun.mjs")).text();
const unit = await Bun.file(at("../../../deploy/bmo-web.service")).text();

describe("the served build's entry", () => {
  test("is the console's own, named for the production build on Bun", () => {
    expect(config).toContain('nitro: { preset: "bun", entry: fileURLToPath(new URL("./server/bun.mjs", import.meta.url)) }');
  });

  test("serves with Bun's idle limit off and reads no limit from the environment", () => {
    expect(entry).toContain("idleTimeout: 0,");
    expect(entry).not.toContain("NITRO_BUN_IDLE_TIMEOUT");
    expect(unit).not.toContain("NITRO_BUN_IDLE_TIMEOUT");
  });
});
