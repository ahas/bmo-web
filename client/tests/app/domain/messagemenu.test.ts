import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { messageMenu, REACTION_STRIP_SLOT, reactionStrip } from "../../../apps/web/app/domain/messagemenu";
import { REACTION_EMOJIS } from "../../../apps/web/app/domain/message-acts";

import type { CopyItem } from "../../../apps/web/app/domain/room-copy";
// The shape a test reads of an entry: a label, its mark, whether it is off, and the submenu under it.
interface MenuEntry {
  label?: string;
  icon?: string;
  disabled?: boolean;
  children?: unknown;
  onSelect?: (event: Event) => void;
}
import type { MessageMenuActions, MessageMenuState } from "../../../apps/web/app/domain/messagemenu";

function item(text: string, over: Partial<MessageMenuState> = {}): MessageMenuState & CopyItem {
  return { senderName: "Owner", senderId: 10000001, messageId: 7, sentAt: 1_757_000_000, text, judgements: [], writable: true, ...over };
}

function spies(): MessageMenuActions & { called: string[] } {
  const called: string[] = [];
  const mark = (word: string) => (): number => called.push(word);

  return {
    called,
    reply: mark("reply"),
    forward: mark("forward"),
    react: (emoji: string) => called.push(`react:${emoji}`),
    pin: (on: boolean) => called.push(`pin:${on}`),
    edit: mark("edit"),
    remove: mark("remove"),
    copy: mark("copy"),
    copyBody: mark("copyBody"),
    copyRef: mark("copyRef"),
    select: mark("select")
  };
}

describe("the menu on one message", () => {
  test("offers the answer, the acts, the copy and the choosing in the order they are read", () => {
    const groups = messageMenu(wording, item("words"), spies());

    expect(groups.map((group) => group.map((entry) => entry.label))).toEqual([
      [wording("room.action.react")],
      [wording("room.action.reply")],
      [wording("room.action.pin")],
      [wording("common.action.copy"), wording("room.action.copy_text"), wording("room.action.copy_ref")],
      [wording("room.action.select")]
    ]);
  });

  test("offers the forward beside the answer to the owner alone", () => {
    const owner = messageMenu(wording, item("words", { administrator: true }), spies());
    const member = messageMenu(wording, item("words", { administrator: false }), spies());

    expect(owner[1]!.map((entry) => entry.label)).toEqual([wording("room.action.reply"), wording("room.action.forward")]);
    expect(member[1]!.map((entry) => entry.label)).toEqual([wording("room.action.reply")]);
  });

  test("takes a pin off a pinned message and sets it on one that stands unpinned", () => {
    const pinned = messageMenu(wording, item("words", { pinned: true }), spies());

    expect(pinned[2]![0]!.label).toBe(wording("room.action.unpin"));
    expect(messageMenu(wording, item("words"), spies())[2]![0]!.label).toBe(wording("room.action.pin"));
  });

  test("offers the reader's own message an edit and a delete, and another's to the administrator alone", () => {
    const mine = messageMenu(wording, item("words", { mine: true }), spies());
    const other = messageMenu(wording, item("words", { mine: false }), spies());
    const administrator = messageMenu(wording, item("words", { mine: false, administrator: true }), spies());

    expect(mine[3]!.map((entry) => entry.label)).toEqual([wording("room.action.edit_message"), wording("common.action.delete")]);
    expect(other[3]!.map((entry) => entry.label)).toEqual([wording("common.action.copy"), wording("room.action.copy_text"), wording("room.action.copy_ref")]);
    expect(administrator[3]!.map((entry) => entry.label)).toEqual([wording("common.action.delete")]);
  });

  test("heads the menu with the reactions as one strip, the reader's own marked", () => {
    const actions = spies();
    const groups = messageMenu(wording, item("words", { reaction: "🎉" }), actions);
    const strip = reactionStrip("🎉", actions.react);

    expect(groups[0]![0]!.label).toBe(wording("room.action.react"));
    expect((groups[0]![0]! as { slot?: string }).slot).toBe(REACTION_STRIP_SLOT);
    expect(strip.map((choice) => choice.emoji)).toEqual([...REACTION_EMOJIS]);
    expect(strip.filter((choice) => choice.mine).map((choice) => choice.emoji)).toEqual(["🎉"]);
  });

  test("each entry does its own thing", () => {
    const actions = spies();
    const groups = messageMenu(wording, item("words", { mine: true, pinned: true, administrator: true }), actions);

    for (const entry of groups.flat()) {
      entry.onSelect?.(new Event("select"));
    }

    for (const choice of reactionStrip(null, actions.react)) {
      choice.press();
    }

    expect(actions.called).toEqual([
      "reply",
      "forward",
      "pin:false",
      "edit",
      "remove",
      "copy",
      "copyBody",
      "copyRef",
      "select",
      ...REACTION_EMOJIS.map((emoji) => `react:${emoji}`)
    ]);
  });

  test("turns the words alone off where there are no words, and nothing else", () => {
    const empty = messageMenu(wording, item(""), spies()).flat();
    const said = messageMenu(wording, item("words"), spies()).flat();

    expect(empty.map((entry) => entry.disabled === true)).toEqual([false, false, false, false, true, false, false]);
    expect(said.every((entry) => entry.disabled !== true)).toBe(true);
  });

  test("leaves a deleted message its link alone", () => {
    const groups = messageMenu(wording, item("", { deleted: true }), spies());

    expect(groups.flat().map((entry) => entry.label)).toEqual([wording("room.action.copy_ref")]);
  });

  test("leaves a reader who may not write the room the copy and the choosing alone", () => {
    const readOnly = messageMenu(wording, item("words", { mine: true, administrator: false, writable: false }), spies());
    const labels = readOnly.map((group) => group.map((entry) => entry.label));

    expect(labels).toEqual([
      [wording("common.action.copy"), wording("room.action.copy_text"), wording("room.action.copy_ref")],
      [wording("room.action.select")]
    ]);
    expect(readOnly.flat().map((entry) => entry.label)).not.toContain(wording("room.action.reply"));
    expect(readOnly.flat().map((entry) => entry.label)).not.toContain(wording("room.action.react"));
    expect(readOnly.flat().map((entry) => entry.label)).not.toContain(wording("room.action.pin"));
    expect(readOnly.flat().map((entry) => entry.label)).not.toContain(wording("room.action.edit_message"));
    expect(readOnly.flat().map((entry) => entry.label)).not.toContain(wording("common.action.delete"));
  });
});
