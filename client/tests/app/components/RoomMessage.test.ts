import { describe, expect, test } from "bun:test";

// How long the room waited for an answer, as the row says it. It is a quiet mark: it belongs
// with the clock at the bubble's foot rather than among the words, it is small and muted as the
// clock is, and a message the archive holds no measurement of says nothing at all instead of a
// nought or a dash. All three are where an element stands and which
// tokens it wears, which a rendered screen would name as neither, so the rule is read off the
// file that ships.

const source = await Bun.file(new URL("../../../apps/web/app/components/RoomMessage.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));

// The one element the mark stands in, with its attributes and nothing of what it holds.
function tagOf(mark: string): string {
  const at = template.indexOf(mark);

  expect(at).toBeGreaterThan(-1);

  const opened = template.lastIndexOf("<", at);

  return template.slice(opened, template.indexOf(">", opened) + 1);
}

// The header the bubble stands under, and the bubble's own words, each on its own.
function slotOf(name: string): string {
  const opened = template.indexOf(`#${name}>`);

  expect(opened).toBeGreaterThan(-1);

  return template.slice(opened, template.indexOf("</template>", opened));
}

const mark = "spanClock($t, props.item.answerSeconds)";

const chips = await Bun.file(new URL("../../../apps/web/app/components/JudgementChips.vue", import.meta.url)).text();
const line = chips.slice(chips.indexOf("data-meta"), chips.indexOf("data-spread"));

describe("the wait a row wears", () => {
  test("there is a template to read, so nothing below passes on an empty string", () => {
    expect(template.length).toBeGreaterThan(500);
    expect(template).toContain("{{ clock }}");
    expect(template).toContain(mark);
  });

  test("stands on the meta line at the bubble's foot, at its trailing end before the verdicts and the clock", () => {
    // The row hands the line its wait and its clock; the line stands the wait at its trailing end,
    // before the verdicts, and the clock after them.
    expect(slotOf("took")).toContain(mark);
    expect(slotOf("clock")).toContain("{{ clock }}");
    const trail = line.slice(line.indexOf("data-meta-trail"));

    expect(line.indexOf('<slot name="took" />')).toBeGreaterThan(line.indexOf("data-meta-trail"));
    expect(trail.indexOf('<slot name="took" />')).toBeLessThan(trail.indexOf("CHIP_ICONS.verdicts"));
    expect(trail.indexOf('<slot name="clock" />')).toBeGreaterThan(trail.indexOf("CHIP_ICONS.verdicts"));
    expect(template.slice(template.indexOf("data-words"), template.indexOf("<JudgementChips"))).not.toContain(mark);
  });

  test("is drawn only where there is something to draw", () => {
    expect(template).toContain('<template v-if="props.item.answerSeconds !== null" #took>');
  });

  test("is read at the size, line and colour of everything on the line", () => {
    const tag = tagOf(mark);

    expect(line).toContain("text-sm leading-(--chat-meta-line) whitespace-nowrap tabular-nums");
    expect(chips).toContain('"basis-full text-muted"');
    // Nothing of its own to look at: no badge, no chip, no colour it wears alone.
    expect(tag).toMatch(/^<span/);
    expect(tag).not.toMatch(/text-(primary|error|warning|success|info|sm|xs)/);
  });

  // A notice the chat agent voices or a job's report often lands minutes after another line of its, inside the
  // same run, and is still read for when it came: the time and the sent mark are every message's,
  // never only the run's last.
  test("and the time and the sent mark stand on every message, wherever it stands in its run", () => {
    const clock = tagOf("data-clock");
    const sendMark = tagOf("data-send-mark");
    const handed = tagOf("<JudgementChips");

    expect(clock).toContain('v-if="message"');
    expect(`${clock}${sendMark}`).not.toContain("place");
    expect(handed).toContain(':clock="message"');
    expect(source).toContain("const markShown = computed<boolean>(() => mark.value !== null);");
  });
});

// What the row's own padding is for. It is the breathing room of the box the row becomes when it
// is hovered, chosen or brought into view, and it stands outside the column the words read in: the
// row gives back on each side what it pads, so the words keep the column's full width and never
// touch the box's edge. It is not where the space between two messages comes from: a tail hung under each row is drawn inside the
// row it belongs to, so a chosen message would light up the empty ground beneath it and the gap
// would read as the upper message's rather than as the space between the two. The feed's own
// spacing is what separates them.
describe("the padding a row keeps", () => {
  const row = tagOf('class="group/row');
  const padding = [...row.matchAll(/\b(p[tbxy]?)-(\d+|\[[^\]]+\])/g)].map((found) => `${found[1]}-${found[2]}`);

  test("there is a row to read, so nothing below passes on an empty string", () => {
    expect(row).toContain("group/row");
    expect(padding.length).toBeGreaterThan(0);
  });

  test("is the same top and bottom, and the side room stands outside the column", () => {
    // A quarter of the step on each side, so two bubbles of a run stand half a step apart; the run keeps the other
    // quarter round its rows, so two runs stand a whole step apart.
    expect(padding).toEqual(["px-3", "py-[calc(var(--chat-message-gap)/4)]"]);
    expect(row).toContain("-mx-3");
  });

  test("and never a tail hung under the row alone", () => {
    expect(padding.some((one) => one.startsWith("pb-"))).toBe(false);
    expect(padding.some((one) => one.startsWith("pt-"))).toBe(false);
  });
});

// A bubble holding a sound player is as wide as the player or its words, and the player takes its
// whole width, so no blank stands past the waveform; straight after the player, the meta line stands
// at the end of the player's own line, which keeps its blank (docs/web.md, the room screen's sound section and the meta line).
describe("a voice bubble", () => {
  const player = tagOf('v-else-if="heard(attachment)"');

  test("stands its parts in one column, so it asks for its widest part rather than all of them side by side", () => {
    expect(source).toContain('voiced.value || carded.value ? "relative flex flex-col gap-y-(--chat-meta-gap)"');
  });

  test("hands the player the bubble's whole width, asking for 320 px", () => {
    // The sound's column asks for 320 px, and the player takes it whole beside the recording's length.
    expect(player).toContain('class="flex w-80 max-w-full min-w-full flex-col gap-1"');
    expect(source).toContain('class="min-w-0 flex-1"');
  });

  test("lays its meta line at the end of the last player's line, and the words keep no blank for it then", () => {
    expect(source).toContain(':trail-room="playerLast && index === filed.length - 1 ? metaRoom : null"');
    expect(template).toContain(':after-words="wordsLast || playerLast"');
    expect(template).toContain(':data-meta-room="wordsLast && metaRoom !== null ? \'\' : undefined"');
  });
});

// The choosing mark stands on the centre of its row's first line (docs/web.md, choosing and copying):
// its cell is one line of that line's own type tall with the mark centred in it, and keeps no room
// of its own above the line, so a system line of one line has its mark at its middle.
describe("the choosing mark", () => {
  const cell = tagOf("absolute -start-(--chat-choose-hang)");

  test("stands in a cell one line tall, centred in it", () => {
    expect(cell).toContain("h-lh");
    expect(cell).toContain("items-center");
    expect(cell).toContain(':class="markLine"');
  });

  test("keeps no inset of its own above the line", () => {
    expect(cell).not.toMatch(/\btop-/);
    expect(source).toMatch(/if \(props\.item\.notice\) \{\s*return "top-0 text-sm";/);
  });
});

// An agent's answer that went out in the owner's own account names the agent at the bubble's head and, beside it and
// smaller, the account it went out in (docs/web.md, 「An answer sent in the owner's own account wears the agent's
// face」). A row that went out under its own name wears no such mark.
describe("the account an answer went out in", () => {
  test("stands beside the name, small and muted, only on a row that carries one", () => {
    const head = template.slice(template.indexOf('v-if="head"'), template.indexOf("<RoomQuote"));
    const voice = tagOf("data-voice");

    // A message stands under its name alone: no account marker beside it.
    expect(head).toContain('v-if="named"');
    expect(head).not.toContain("data-voice");
    expect(head).not.toContain("voiced_as");
  });
});
