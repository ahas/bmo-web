import { describe, expect, test } from "bun:test";

// The room's situation note as a person reads it (docs/web.md, the room screen's record and its situation entry):
// the note a round read as that round's answer record stands it, marked where the round wrote it afresh, and the
// room's note as it stands now, in the room's own menu.

const read = async (name: string) => await Bun.file(new URL(`../../../apps/web/app/${name}`, import.meta.url)).text();

const chips = await read("components/JudgementChips.vue");
const message = await read("components/RoomMessage.vue");
const screen = await read("pages/rooms/[chatId].vue");
const dialog = await read("components/RoomSituationDialog.vue");

describe("the note in the answer's record", () => {
  test("stands last in the record, with the mark a round's own change wears", () => {
    expect(chips).toContain("data-situation");
    expect(chips).toContain("{{ entry.situation.text }}");
    expect(chips).toContain('$t("room.label.situation")');
    expect(chips).toContain('<UBadge v-if="entry.situation.changed"');
    expect(chips).toContain('$t("room.label.situation_changed")');
  });

  test("is handed to the answer by the round the page read, and the answer's record alone draws it", () => {
    expect(message).toContain(':round-situation="props.roundSituation"');
    expect(screen).toContain("const situationByRound = computed(() => {");
    expect(screen).toContain(':round-situation="roundSituationOf(item)"');
    expect(chips).toContain('tail.push({ kind: "situation", situation: props.roundSituation });');
  });
});

describe("the room's note as it stands", () => {
  test("opens from the room's menu, read again each time it opens", () => {
    expect(screen).toContain('t("room.action.situation")');
    expect(screen).toContain('<RoomSituationDialog v-model:open="situationOpen"');
    expect(dialog).toContain("`/api/rooms/${props.chatId}/situation`");
    expect(dialog).toContain("if (standing) void read();");
  });

  test("says the note, when it changed, and that a room with none has none", () => {
    expect(dialog).toContain('data-situation-note');
    expect(dialog).toContain('$t("room.label.situation_updated"');
    expect(dialog).toContain('$t("room.status.situation_none")');
    expect(dialog).toContain('$t("room.error.situation_failed")');
    expect(dialog).toContain("$t('room.title.situation')");
  });

  test("carries the memory text's translate action, asking nothing until it is pressed", () => {
    expect(dialog).toContain("data-situation-translate");
    expect(dialog).toContain("$t('common.action.translate')");
    expect(dialog).toContain('@click="ask"');
    expect(dialog).toContain("useAskedReading");
    expect(dialog).toContain("if (blocked.value === \"absent\")");
    expect(dialog).toContain("if (blocked.value === \"busy\")");
  });

  test("stands the reading under the original, headed by the reader's language, with a retry", () => {
    expect(dialog).toContain("data-situation-reading");
    expect(dialog).toContain('$t("documents.label.translation_of"');
    expect(dialog).toContain("data-situation-read-translation");
    expect(dialog).toContain("$t('common.action.retry_translation')");
  });
});
