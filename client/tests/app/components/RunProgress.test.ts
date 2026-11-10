import { describe, expect, test } from "bun:test";

// What a row of the conversation holds while the turn it stands for is still running, and where
// that row comes from. Both are what a rendered screen would not name — the one says which element
// stands above which, the other says which component drew them — so the rules are read off the
// files that ship, the way the log row's is.

const source = await Bun.file(new URL("../../../apps/web/app/components/RunProgress.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
const row = await Bun.file(new URL("../../../apps/web/app/components/RoomMessage.vue", import.meta.url)).text();
const page = await Bun.file(new URL("../../../apps/web/app/pages/rooms/[chatId].vue", import.meta.url)).text();
const feed = await Bun.file(new URL("../../../apps/web/app/domain/room.ts", import.meta.url)).text();

// Where each piece of the block stands, so the order they stand in can be asserted rather than
// eyeballed. A piece that has gone missing is -1 and fails the test that wants it.
function at(mark: string): number {
  const found = template.indexOf(mark);

  expect(found).toBeGreaterThan(-1);

  return found;
}

describe("what the block stands while a turn runs", () => {
  test("there is a template to read, so nothing below passes on an empty string", () => {
    expect(template.length).toBeGreaterThan(500);
  });

  test("the turn's state stands under what opened it", () => {
    const received = at("<RollingSentence");
    const state = at("<UChatShimmer data-state");

    // What opened the turn, then what it is at right now.
    expect(received).toBeLessThan(state);
  });

  test("the run's last call stands under the state, and the last thinking block's tail under the call", () => {
    const state = at("<UChatShimmer data-state");
    const call = at('<LastAction v-if="last !== null" :action="last" :at="lastAt" />');
    const thinking = at('<ThinkingPreview v-if="thinking !== null" :text="thinking" />');

    expect(state).toBeLessThan(call);
    expect(call).toBeLessThan(thinking);
    expect(source).toContain("const thinking = computed(() => thinkingBlock(props.run.progress));");
    expect(source).toContain("const last = computed(() => lastAction(props.run.progress));");
    // Which call of the turn it is counts the ones the picture dropped, so the page turns on every new call.
    expect(source).toContain("(props.run.progress?.droppedActions ?? 0) + (props.run.progress?.actions.length ?? 0)");
    // Nothing of the turn's work is stacked here: the verdict chips open the whole of it.
    expect(template).not.toContain("<TurnActions");
    expect(template).not.toContain("<UChatReasoning");
  });

  test("the last call turns like a page, and takes its place at once for a reader who asked for less movement", async () => {
    const line = await Bun.file(new URL("../../../apps/web/app/components/LastAction.vue", import.meta.url)).text();

    expect(line).toContain('<Transition name="page">');
    expect(line).toContain(':key="props.at"');
    expect(line).toContain("overflow-hidden");
    expect(line).toContain(".page-enter-from {\n  transform: translateX(100%);");
    expect(line).toContain(".page-leave-to {\n  transform: translateX(-100%);");
    expect(line).toContain(".page-leave-active {\n  position: absolute;");
    expect(line).toContain("@media (prefers-reduced-motion: reduce)");
    // The badge its sort wears and what it was about, as the agent's log keeps it, two lines at most with an
    // ellipsis past them.
    expect(line).toContain("actionLook(t, props.action, icons.value)");
    expect(line).toContain("line-clamp-2");
    expect(line).toContain("break-all");
    expect(line).not.toContain("truncate");
  });

  test("the preview is two lines tall, streams by the frame with its foot on the newest words, takes no finger, and stands at once for less movement", async () => {
    const preview = await Bun.file(new URL("../../../apps/web/app/components/ThinkingPreview.vue", import.meta.url)).text();

    expect(preview).toContain("max-h-[2lh]");
    expect(preview).toContain("pointer-events-none");
    expect(preview).toContain("overflow-hidden");
    expect(preview).toContain("whitespace-pre-wrap");
    expect(preview).toContain("thinkingShown(now - since, from, props.text.length)");
    expect(preview).toContain("if (shown.value < props.text.length) frame = requestAnimationFrame(move);");
    expect(preview).toContain("element.scrollTop = element.scrollHeight;");
    expect(preview).toContain("from = thinkingResumeFrom(before, shown.value, props.text);");
    expect(preview).toContain('window.matchMedia("(prefers-reduced-motion: reduce)").matches');
    expect(preview).toContain("shown.value = props.text.length;");
  });

  test("what the agent writes as it works stands between what opened the turn and what it is at", () => {
    const received = at("<RollingSentence");
    const said = at("data-said ");
    const reasoning = at("<UChatShimmer data-state");

    // The agent's words come first and the state under them, as a chat reads a line and then the sign that more
    // is coming; the newest line is the row's own words, the few before it muted.
    expect(received).toBeLessThan(said);
    expect(said).toBeLessThan(reasoning);
    expect(source).toContain("saidLines(props.run.progress)");

    const block = template.slice(said, reasoning);

    expect(block).toContain('v-for="(line, index) in said.earlier"');
    expect(block).toContain("text-muted");
    expect(block).toContain("{{ said.newest }}");
    // Each line wraps at the row's width and a long run breaks inside itself, so the room never scrolls sideways.
    expect(block.match(/whitespace-normal break-keep wrap-anywhere/g)?.length).toBe(2);
    expect(block).not.toContain("truncate");
    // No message stands there, so nothing on them presses or numbers them.
    expect(block).not.toContain("@click");
    expect(block).not.toContain("<UButton");
  });

  test("the count of what the turn was handed is still there", () => {
    expect(template).toContain(":figures=\"received.figures\"");
    expect(source).toContain("receivedLine(props.run.received)");
  });

  test("the state shimmers at the row's edge in the pack's words, and nothing on it presses or folds", () => {
    const block = template.slice(at("<UChatShimmer data-state"));

    // The state is the turn's own account — thinking, writing, a named tool, the Job it waits on — which shimmers
    // for as long as the turn runs, and it stands at the row's left edge: the row's header names the agent, and a
    // name column beside it pushed the detail right. Nothing spins beside it, and nothing folds.
    expect(template).not.toContain("{{ subject }}");
    expect(template).not.toContain("subjectOf");
    expect(template).toContain(':text="state"');
    expect(template).not.toContain("animate-spin");
    expect(template).not.toContain("@click");
    expect(block).not.toContain("<UButton");
    expect(source).toContain("stateLine(t, props.run.progress,");
  });

  test("the state line breaks at its spaces, so a tool's name never folds the in-use word in half", () => {
    const block = template.slice(at("<UChatShimmer data-state"));

    // keep-all is what holds a Korean phrase together; anywhere is what lets one long identifier
    // break inside itself rather than run off a phone's width.
    expect(block).toContain("break-keep");
    expect(block).toContain("wrap-anywhere");
  });

  test("it is the row's words and nothing else: no picture, no header, no chip of its own", () => {
    // Everything around the words belongs to the row, and the row is the one the answer will be
    // drawn in. A block that drew any of it a second time is a second thing to keep matched.
    expect(template).not.toContain("<UChatMessage");
    expect(template).not.toContain("<LineChip");
    expect(template).not.toContain("<TokenChip");
    expect(template).not.toContain("<RunSpend");
    expect(source).not.toContain("avatar");
  });
});

describe("the row the running turn is handed to", () => {
  test("is the very component the room's messages are drawn by", () => {
    // The page stands no block of its own after the conversation: the running turn is one more
    // row of its speaker's run, so the side, the picture, the header, the column the words read in
    // and the chip line under them are the row's and cannot differ between a turn and its answer.
    expect(page).not.toContain("<RunProgress");
    expect(page).toContain("atFoot(t, days.value, roomFeed.newer.value ? [] : runRows.value)");
    expect(page).toContain("senderRuns(day.items, `day:${day.key}`)");
    expect(page).toContain('<RoomMessage\n                  v-for="(item, at) in run.rows"');
    expect(row).toContain('<RunProgress v-if="props.item.run !== null" class="min-w-0 max-w-full grow" :run="props.item.run" />');
  });

  test("is built the way every other row of the feed is", () => {
    expect(feed).toContain("export function runItem(");
    expect(page).toContain("runItem(run, botSpeaker(roomFeed.messages.value), botFace.value)");
  });

  test("holds no message, so nothing a message answers to is said to it", () => {
    // It cannot be chosen, copied, replied to or walked to with the arrows: there is no message
    // there yet for any of that to mean anything.
    expect(row).toContain("const message = computed<boolean>(() => props.item.run === null)");
    expect(row).toContain('!message.value || props.selecting || props.item.pending !== null');
    expect(row).toContain(':data-message="message ? props.item.key : undefined"');
    expect(row).toContain(':tabindex="message ? (props.roving ? 0 : -1) : undefined"');
  });
});

// The chat agent's line names the question its draft process is on, and another supervisor's runs no process (docs/web.md,
// the room screen's running line).
describe("the draft step on the line", () => {
  test("is handed the question the turn is on where the turn is the chat agent's, and none where it is another supervisor's", async () => {
    const shipped = await Bun.file(new URL("../../../apps/web/app/components/RunProgress.vue", import.meta.url)).text();

    expect(shipped).toContain("stateLine(t, props.run.progress, otherAnswererOf(props.run.speaker) === undefined ? props.run.draft ?? null : null)");
  });
});
