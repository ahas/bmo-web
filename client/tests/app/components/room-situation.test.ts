import { describe, expect, test } from "bun:test";

// The room's situation note as a person reads it (docs/web.md, the room screen's verdicts and its situation entry):
// the note a judged message's round read it under, marked where that round wrote it afresh, and the room's note as it
// stands now, in the room's own menu.

const read = async (name: string) => await Bun.file(new URL(`../../../apps/web/app/${name}`, import.meta.url)).text();

const chips = await read("components/JudgementChips.vue");
const message = await read("components/RoomMessage.vue");
const screen = await read("pages/rooms/[chatId].vue");
const dialog = await read("components/RoomSituationDialog.vue");

describe("the note beside a judged message", () => {
  test("stands in the verdicts' spread, with the mark a round's own change wears", () => {
    expect(chips).toContain('data-situation');
    expect(chips).toContain("{{ props.situation.text }}");
    expect(chips).toContain('$t("room.label.situation")');
    expect(chips).toContain('<UBadge v-if="props.situation.changed"');
    expect(chips).toContain('$t("room.label.situation_changed")');
  });

  test("is handed down from the message it belongs to, and no message without one draws it", () => {
    expect(message).toContain(':situation="props.item.situation ?? null"');
    expect(chips).toContain('v-if="props.situation !== null && props.situation !== undefined"');
  });
});

describe("the room's note as it stands", () => {
  test("opens from the room's menu, read again each time it opens", () => {
    expect(screen).toContain('t("room.action.situation")');
    expect(screen).toContain('<RoomSituationDialog v-model:open="situationOpen"');
    expect(dialog).toContain("`/api/rooms/${props.chatId}/situation`");
    expect(dialog).toContain("if (standing) void refresh();");
  });

  test("says the note, when it changed, and that a room with none has none", () => {
    expect(dialog).toContain('data-situation-note');
    expect(dialog).toContain('$t("room.label.situation_updated"');
    expect(dialog).toContain('$t("room.status.situation_none")');
    expect(dialog).toContain('$t("room.error.situation_failed")');
    expect(dialog).toContain("$t('room.title.situation')");
  });
});
