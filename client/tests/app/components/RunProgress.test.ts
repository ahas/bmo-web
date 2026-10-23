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

  test("what the turn is at stands under what opened it", () => {
    const received = at("<RollingSentence");
    const shimmer = at("<UChatShimmer");

    // What opened the turn, then what it is at right now. The state line is the one that is
    // reread while the turn runs, so it is held still rather than pushed down the screen by every
    // call that lands under it — and what the turn has done lands under the chip line below,
    // outside this block entirely.
    expect(received).toBeLessThan(shimmer);
  });

  test("the count of what the turn was handed is still there", () => {
    expect(template).toContain(":figures=\"received.figures\"");
    expect(source).toContain("receivedLine(props.run.received)");
  });

  test("the state line breaks at its spaces, so a tool's name never folds the in-use word in half", () => {
    const shimmer = template.slice(at("<UChatShimmer"));

    // keep-all is what holds a Korean phrase together; anywhere is what lets one long identifier
    // break inside itself rather than run off a phone's width.
    expect(shimmer).toContain("break-keep");
    // It reads at the size, line height and colour of the line over it, so the block is one size.
    expect(shimmer).toContain("text-sm leading-(--chat-meta-line)");
    expect(shimmer).toContain("wrap-anywhere");
  });

  test("the shimmer is the whole of the sign that the turn is going, and it says the state alone", () => {
    const shimmer = template.slice(at("<UChatShimmer"));

    expect(shimmer).toContain(':text="look.label"');
    // Nothing spins beside it, and no second thing shimmers above it.
    expect(template).not.toContain("animate-spin");
    expect(template.match(/<UChatShimmer/g)).toHaveLength(1);
  });

  test("it is the row's words and nothing else: no picture, no header, no chip of its own", () => {
    // Everything around the words belongs to the row, and the row is the one the answer will be
    // drawn in. A block that drew any of it a second time is a second thing to keep matched.
    expect(template).not.toContain("<UChatMessage");
    expect(template).not.toContain("<LineChip");
    expect(template).not.toContain("<TokenChip");
    expect(template).not.toContain("<RunSpend");
    expect(template).not.toContain("<TurnActions");
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

// The chat agent's line names the question its draft process is on, and a companion's runs no process (docs/web.md,
// the room screen's running line).
describe("the draft step on the line", () => {
  test("is handed the question the turn is on where the turn is the chat agent's, and none where it is a companion's", async () => {
    const shipped = await Bun.file(new URL("../../../apps/web/app/components/RunProgress.vue", import.meta.url)).text();

    expect(shipped).toContain("phaseLook(t, name.value, props.run.progress, props.run.speaker === undefined ? props.run.draft ?? null : null)");
  });
});
