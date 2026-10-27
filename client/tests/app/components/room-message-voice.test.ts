import { describe, expect, test } from "bun:test";

// A voice note in a bubble (docs/web.md, the room screen's sound messages): the recording's length beside its player, the
// words heard in it under the player, and one line saying it could not be heard where it could not. The words are the
// bubble's own to find, so the room's find reads them.

const read = async (path: string) => await Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const bubble = await read("app/components/RoomMessage.vue");
const find = await read("app/domain/room-find.ts");

describe("a voice note's bubble", () => {
  test("stands the length beside the player and the words under it", () => {
    expect(bubble).toContain("data-sound");
    expect(bubble).toContain("data-voice-seconds");
    expect(bubble).toContain("playClock(voiceSeconds)");
    expect(bubble).toContain("data-transcript");
    expect(bubble).toContain("{{ transcript }}");
  });

  test("says in one line that it could not be heard, and the player stands all the same", () => {
    expect(bubble).toContain('v-else-if="voiceFailed"');
    expect(bubble).toContain("data-voice-failed");
    expect(bubble).toContain('$t("room.label.voice_failed")');
    expect(bubble).toContain("voiceState === \"failed\"");
  });

  test("keeps a sound that is no voice note to its player alone", () => {
    expect(bubble).toContain('v-if="transcript !== null"');
    expect(bubble).toContain('v-if="voiceSeconds !== null"');
  });

  test("gives its words to the room's find", () => {
    expect(find).toContain("message.transcript ?? \"\"");
  });
});
