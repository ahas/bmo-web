import { describe, expect, test } from "bun:test";

// What else runs for a room stands under its conversation as one line of counts, and pressing it
// opens the log of what runs with no dialog between: one run's at once, or a menu of the runs where
// there are several. A watch is the one run whose subject is not the agent running it: what a reader
// wants is which watch it is, and that is all its line says; the rest opens when it is pressed.

const work = await Bun.file(new URL("../../../apps/web/app/components/RoomWork.vue", import.meta.url)).text();
const dialog = await Bun.file(new URL("../../../apps/web/app/components/AgentLogDialog.vue", import.meta.url)).text();

describe("the line under the conversation", () => {
  test("there is source to read, so nothing below passes on an empty string", () => {
    expect(work.length).toBeGreaterThan(500);
    expect(dialog.length).toBeGreaterThan(500);
  });

  test("is one line of counts however many run: it is cut at its edge rather than wrapped", () => {
    expect(work).toContain('<UChatShimmer :text="summary" class="block truncate tabular-nums" />');
    expect(work).not.toContain("v-for");
  });

  test("one run opens its log at once, and several drop a menu of them", () => {
    expect(work).toContain('<UDropdownMenu v-if="summary !== \'\' && props.lines.length > 1"');
    expect(work).toContain('v-else-if="summary !== \'\' && only !== null"');
    expect(work).toContain('@click="openLog(only)"');
    expect(work).toContain("onSelect: () => openLog(line)");
    expect(work).not.toContain("WorkerStatusDialog");
  });

  test("keeps its row's height whether the line stands or not, so nothing above it moves", () => {
    expect(work).toContain('data-work-row class="flex h-8');
    expect(work).not.toContain('<div v-if="summary !== \'\'"');
  });

  test("never says the deployment: the title bar's mark is the one place it stands", () => {
    expect(work).not.toContain("/api/deploy");
  });

  test("the log opens over the conversation, with a watch's check opening the watch above it", () => {
    expect(work).toContain('<AgentLogDialog v-if="log !== null" v-model:open="logOpen" :name="log.agent" :rooms="props.rooms" :watch="log.watch" />');
  });
});

describe("a watch's run", () => {
  test("says the watch's number and name and nothing under it: what it waits for opens with the watch", () => {
    expect(work).not.toContain("watchWait");
    expect(work).not.toContain("~/domain/watches");
  });

  test("the press opens the watch rather than a log, and says so where a reader is told what it does", () => {
    expect(work).toContain(":aria-label=\"only.watch === null ? $t('room.aria.open_log', { name: only.label }) : $t('room.aria.open_details', { name: only.label })\"");
  });
});

describe("what opens when a watch's line is pressed", () => {
  test("the watch itself stands above the log, so a check that wrote nothing still says what it is", () => {
    expect(dialog).toContain('v-if="props.watch !== null"');
    // The head above it already carries the watch's name, so the block does not say it twice.
    expect(dialog).toContain('<WatchDetail :watch="props.watch" :now="now" :named="false" />');
  });

  test("the head of it is the watch's own name where there is one, and the agent's where there is not", () => {
    expect(dialog).toContain("title: props.watch === null ? meta.value.label : watchTitle(t, props.watch)");
  });
});
