import { describe, expect, test } from "bun:test";

// The input box's tools (docs/web.md, the room screen's input box): the clip alone, in every room. The voice note's own
// button and the sticker button are not shown, while the roads that carry them stay in the code and on their routes.

const read = async (path: string) => await Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const composer = await read("app/components/ChatComposer.vue");
const screen = await read("app/pages/rooms/[chatId].vue");
const picker = await read("app/components/RoomStickerPicker.vue");

describe("the input box's tools", () => {
  test("are the clip, and nothing beside it", () => {
    expect(composer).toContain('icon="i-material-symbols-attach-file"');
    expect(composer).not.toContain("room.action.record_voice");
    expect(composer).not.toContain("i-material-symbols-mic");
  });

  test("keep the voice note's own road in the code", () => {
    expect(composer).toContain("async function startRecording");
    expect(composer).toContain("recordable");
  });

  test("keep the sticker picker and its road, with no button for it in the room", () => {
    expect(picker).toContain("sendSticker");
    expect(screen).not.toContain("<RoomStickerPicker");
  });

  test("attach in every room, a room the console made among them", () => {
    expect(screen).toContain(':attachable="true"');
    expect(screen).toContain('@dragover.prevent="dragging = true"');
  });
});
