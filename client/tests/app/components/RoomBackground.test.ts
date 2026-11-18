import { describe, expect, test } from "bun:test";

// What waits for a room, read from the file that ships and the room screen that places it (docs/web.md, the room screen's list of what waits).

const source = await Bun.file(new URL("../../../apps/web/app/components/RoomBackground.vue", import.meta.url)).text();
const list = await Bun.file(new URL("../../../apps/web/app/components/RoomBackgroundList.vue", import.meta.url)).text();
const room = await Bun.file(new URL("../../../apps/web/app/pages/rooms/[chatId].vue", import.meta.url)).text();

describe("what waits for a room", () => {
  test("stands only where something waits, and for the administrator alone", () => {
    expect(source).toContain('v-if="calls.length > 0"');
    expect(room).toContain('<RoomBackground v-if="administrator" v-model:open="backgroundOpen" v-model:count="backgroundCount" :chat-id="chatId" />');
  });

  test("is read as the screen opens, every minute and each time it opens", () => {
    expect(source).toContain("const EVERY_MS = 60_000;");
    expect(source).toContain("timer = setInterval(() => void read(), EVERY_MS);");
    expect(source).toContain("if (now) void read();");
  });

  test("names a watch and a reminder in the pack's words and any other call by its tool", () => {
    expect(list).toContain('t("room.label.background_watch")');
    expect(list).toContain('t("room.label.background_reminder")');
    expect(list).toContain("return call.tool;");
  });
});
