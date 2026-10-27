import { describe, expect, test } from "bun:test";

// The voice briefing's settings carry one switch (docs/web.md, 「Settings」, the voice briefing section): whether anything
// is spoken at all. A briefing switched on plays as it arrives, so nothing about the player stands beside it, and the
// console asks the receiver for the one switch and writes the one.

const read = async (path: string) => await Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const screen = await read("app/components/SettingsBriefing.vue");
const readRoute = await read("server/api/voice-briefing.get.ts");
const writeRoute = await read("server/api/voice-briefing.put.ts");
const types = await read("shared/types.ts");

describe("the voice briefing's settings", () => {
  test("carry the whole-briefing switch alone", () => {
    expect(screen).toContain('data-briefing-switch="on"');
    expect(screen).not.toContain('data-briefing-switch="autoplay"');
    expect(screen).not.toContain("briefing.label.autoplay");
    expect(screen).not.toContain("autoplay");
  });

  test("ask the receiver for the one switch and write the one", () => {
    expect(readRoute).toContain('unitFetch<{ on?: unknown }>("RECEIVER", "/voice-briefing"');
    expect(writeRoute).toContain('typeof body?.on !== "boolean"');
    expect(writeRoute).toContain("JSON.stringify({ on: body.on })");
    expect(readRoute + writeRoute).not.toContain("autoplay");
  });

  test("hold one switch in the console's own shape", () => {
    expect(types).toContain("export interface BriefingSwitches {\n  on: boolean;\n}");
  });
});
