import { describe, expect, test } from "bun:test";

// The room's chat providers tab, read from the file that ships: its mode switch above the providers.

const source = await Bun.file(new URL("../../../apps/web/app/components/RoomProvidersPanel.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));

describe("the room's mode in its providers tab", () => {
  test("stands above the providers", () => {
    expect(template.indexOf("data-room-mode")).toBeGreaterThan(-1);
    expect(template.indexOf("data-room-mode")).toBeLessThan(template.indexOf("room.message.providers_rule"));
  });

  test("is on for avatar, writes the other mode when turned, and stands disabled for a room never added", () => {
    expect(template).toContain(`:model-value="mode === 'avatar'"`);
    expect(template).toContain(`void setMode(on ? 'avatar' : 'record-only')`);
    expect(template).toContain(`:disabled="modeSaving || mode === null"`);
  });

  test("reads the mode afresh each time the room information shows the tab", () => {
    expect(source).toContain("void readMode();");
  });
});
