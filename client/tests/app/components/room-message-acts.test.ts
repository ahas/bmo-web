import { describe, expect, test } from "bun:test";

import { mineReaction, REACTION_EMOJIS } from "../../../apps/web/app/domain/message-acts";

// The reader's own acts on a room's messages, read off the files that ship where a rendered screen would name none of
// it: the message menu hands the row's acts to the room screen, the screen answers each through the acts' own domain
// and reads the row again, the input box carries the sticker set, and the top bar's pinned button reads the pins from
// the receiver rather than from the stretch the feed holds.

const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/", import.meta.url))).text();

const row = await read("components/RoomMessage.vue");
const screen = await read("pages/rooms/[chatId].vue");
const stickers = await read("components/RoomStickerPicker.vue");
const picker = await read("components/RoomForwardDialog.vue");
const edit = await read("components/RoomMessageEditDialog.vue");

describe("a forwarded message", () => {
  test("stands marked with who said the original, and a press opens it where it stood", () => {
    expect(row).toContain("props.item.forwarded !== undefined");
    expect(row).toContain(':to="`/rooms/${props.item.forwarded.room}?at=${props.item.forwarded.messageId}`"');
    expect(row).toContain('$t("room.label.forwarded", { name: props.item.forwarded.senderName })');
    expect(row).toContain('forward: () => emit("forward", props.item.key),');
  });
});

describe("a row's menu", () => {
  test("hands the row's side, the administrator and the record's marks to the menu", () => {
    expect(row).toContain('const mine = computed<boolean>(() => props.item.look.side === "right");');
    expect(row).toContain("mine: mine.value,");
    expect(row).toContain("administrator: props.administrator,");
    expect(row).toContain("pinned: props.item.pinnedAt != null,");
    expect(row).toContain("reaction: mineReaction(props.item)");
  });

  test("emits each act with the message it stands on", () => {
    for (const act of ["react", "pin", "edit", "remove"]) {
      expect({ act, stood: row.includes(`${act}: [key: string`) }).toEqual({ act, stood: true });
    }

    expect(row).toContain('react: (emoji: string) => emit("react", props.item.key, emoji),');
    expect(row).toContain('pin: (on: boolean) => emit("pin", props.item.key, on),');
    expect(row).toContain('edit: () => emit("edit", props.item.key),');
    expect(row).toContain('remove: () => emit("remove", props.item.key),');
  });
});

describe("the room screen's acts", () => {
  test("answers each row's act through the acts' own domain and the owner the room stands", () => {
    expect(screen).toContain('import { deleteMessage as deleteOwnMessage, editMessage as editOwnMessage, forwardMessage as forwardCopy, mineReaction, pinMessage, reactTo, readPins as loadPins } from "~/domain/message-acts";');
    expect(screen).toContain('@react="reactToMessage"');
    expect(screen).toContain('@pin="pinMessageAsReader"');
    expect(screen).toContain('@edit="editMessageOf"');
    expect(screen).toContain('@remove="removeMessage"');
    expect(screen).toContain("await reactTo(chatId, item.messageId, emoji, mineReaction(item) !== emoji);");
    expect(screen).toContain("await pinMessage(chatId, item.messageId, on);");
    expect(screen).toContain("await editOwnMessage(chatId, item.messageId, text);");
    expect(screen).toContain("await deleteOwnMessage(chatId, item.messageId);");
  });

  test("reads the row again after each act, the path the record's news takes", () => {
    expect(screen.match(/await roomFeed\.catchUp\(item\.messageId\);/g)?.length).toBe(4);
  });

  test("asks before a delete, in a dialog showing the message's words", () => {
    expect(screen).toContain("const taken = await askFirst({");
    expect(screen).toContain('title: t("room.message.delete_ask")');
    expect(screen).toContain('item: item.shownText.trim() === "" ? item.fileName : item.shownText,');
    expect(screen).toContain('effect: t("room.message.delete_note")');
    expect(screen).toContain('confirm: t("common.action.delete")');
  });

  test("opens the edit box on the row's words, and saves them through the record", () => {
    expect(screen).toContain('<RoomMessageEditDialog v-model:open="editingOpen"');
    expect(screen).toContain(':save="saveEdit"');
    expect(edit).toContain("const refused = await props.save(typed.value);");
    expect(edit).toContain(":maxlength=\"MAX_SAY_TEXT_LENGTH\"");
  });

  test("keeps the record's stickers on their road while the input box shows no button for them", () => {
    // The box carries the clip alone (docs/web.md, the room screen's input box); the sticker picker and its road stay.
    expect(screen).not.toContain("<RoomStickerPicker");
    expect(stickers).toContain("stickers.value = await readStickers(props.chatId);");
    expect(stickers).toContain("await sendSticker(props.chatId, emoji);");
  });

  test("forwards a message through the picker, and opens the copy where it went", () => {
    expect(screen).toContain('@forward="forwardMessageOf"');
    expect(screen).toContain('<RoomForwardDialog v-model:open="forwardingOpen"');
    expect(screen).toContain(':forward="saveForward"');
    expect(screen).toContain("const copy = await forwardCopy(chatId, item.messageId, to);");
    expect(screen).toContain('to: `/rooms/${copy.room}?at=${copy.messageId}`');
    expect(picker).toContain("const refused = await props.forward(chatId);");
    expect(picker).toContain("room.title.toLowerCase().includes(typed)");
  });

  test("reads the room's pins from the receiver, on opening, on a message's change and after a pin", () => {
    expect(screen).toContain("pins.value = await loadPins(chatId);");
    expect(screen).toContain("void readPins();");
    expect(screen).toContain('if (event?.type === "message-changed") void readPins();');
    expect(screen).toContain("await readPins();");
  });
});

describe("the reader's reaction", () => {
  test("is found by the emoji one of their own senders put on the message", () => {
    const reactions = [
      { emoji: "👍", count: 1, mine: false, who: ["person-b"] },
      { emoji: "🎉", count: 2, mine: true, who: ["person-a", "agent-a"] }
    ];

    expect(mineReaction({ reactions })).toBe("🎉");
    expect(mineReaction({ reactions: reactions.slice(0, 1) })).toBeNull();
    expect(mineReaction({})).toBeNull();
    expect(REACTION_EMOJIS).toContain("🎉");
  });
});
