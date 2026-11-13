import { describe, expect, test } from "bun:test";

// The voice briefing's switch is one, the receiver's, and stands first in the settings dialog's voice briefing section,
// above where the player stands and its trial voice (docs/web.md, 「Settings」): whether anything is spoken at all. A
// briefing switched on plays as it arrives, so no second switch stands for the player, and the console asks the
// receiver for the one switch and writes the one. The organisation settings screen holds no tab for it
// (domain/organization.test.ts).

const read = async (path: string) => await Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const section = await read("app/components/SettingsBriefing.vue");
const readRoute = await read("server/api/voice-briefing.get.ts");
const writeRoute = await read("server/api/voice-briefing.put.ts");
const types = await read("shared/types.ts");

describe("the voice briefing's settings", () => {
  test("carry the whole-briefing switch alone", () => {
    expect(section).toContain('data-briefing-switch="on"');
    expect(section).not.toContain("autoplay");
  });

  test("stand the switch in the settings dialog's section, above the player and its trial", () => {
    expect(section).toContain('$fetch<BriefingSwitches>("/api/voice-briefing")');
    expect(section).toContain('$fetch<BriefingSwitches>("/api/voice-briefing", { method: "PUT", body: change })');
    expect(section.indexOf('data-briefing-switch="on"')).toBeLessThan(section.indexOf("data-briefing-top"));
    expect(section.indexOf("data-briefing-top")).toBeLessThan(section.indexOf("data-briefing-trial"));
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
