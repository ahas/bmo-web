import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { briefingChip, chipLook, contextChipText, recordLook, STILL_CHIP_LOOK, verdictChip } from "../../../apps/web/app/domain/chips";
import KO from "../../fixtures/app/domain/chips.test.ko.json";

// What a chip on a message's thin line wears. The rule it is held to is that a pointer is always
// answered: a chip that meets a hover or a press with the colour it already stands in says
// nothing, and an open chip is the one that most easily does it, since its resting colour is the
// closed chip's hover.

// The background and the text colour a state settles on for rest, hover and press.
function steps(open: boolean): { background: string[]; text: string[] } {
  const classes = chipLook(open).split(" ");
  const pick = (prefix: string, stem: string): string =>
    classes.find((one) => one.startsWith(`${prefix}${stem}`))?.slice(prefix.length) ?? `${stem}none`;

  return {
    background: [pick("", "bg-") === "bgnone" ? "bg-default" : pick("", "bg-"), pick("hover:", "bg-"), pick("active:", "bg-")],
    text: [pick("", "text-"), pick("hover:", "text-"), pick("active:", "text-")]
  };
}

describe("the chip on a message's thin line", () => {
  test("answers a pointer in both states, resting, hovered and pressed", () => {
    for (const open of [false, true]) {
      const walked = steps(open);

      expect(new Set(walked.background).size).toBe(3);
      expect(walked.background).not.toContain("bgnone");
      expect(walked.text).not.toContain("textnone");
    }
  });

  test("an open chip's hover is not the colour it already wears", () => {
    const [resting, hovered] = steps(true).background;

    expect(hovered).not.toBe(resting);
  });

  test("open and closed are told apart while resting", () => {
    expect(steps(true).background[0]).not.toBe(steps(false).background[0]);
    expect(steps(true).text[0]).not.toBe(steps(false).text[0]);
  });
});

describe("the chip of how full the session stood", () => {
  test("says a whole percentage of the window", () => {
    expect(contextChipText(0.423)).toBe("42%");
    expect(contextChipText(0.005)).toBe("1%");
    expect(contextChipText(1)).toBe("100%");
  });

  test("rests in the closed chip's colours and room, and claims no pointer it does not answer", () => {
    const closed = chipLook(false).split(" ");

    for (const one of STILL_CHIP_LOOK.split(" ")) {
      expect(closed).toContain(one);
    }

    expect(STILL_CHIP_LOOK).not.toMatch(/hover:|active:/);
  });
});

describe("where a record landed", () => {
  test("names the note, the ledger item and the row by their numbers where the call's answer named them", () => {
    expect(recordLook(wording, { kind: "note", text: "", wakes: false, id: 39 }).label).toBe(KO.line_67);
    expect(recordLook(wording, { kind: "memory", text: "", wakes: false, id: 12 }).label).toBe(KO.line_68);
    expect(recordLook(wording, { kind: "rule", text: "", wakes: false, id: 4 }).label).toBe(wording("room.label.record_rule_numbered", { id: "4" }));
    expect(recordLook(wording, { kind: "todo-add", text: "", wakes: false, id: 699 }).label).toBe(wording("room.label.record_todo_add_numbered", { id: "699" }));
    expect(recordLook(wording, { kind: "todo-append", text: "", wakes: false, id: 699 }).label).toBe(wording("room.label.record_todo_append_numbered", { id: "699" }));
    expect(recordLook(wording, { kind: "note", text: "", wakes: false, id: null }).label).toBe(KO.line_72);
    expect(recordLook(wording, { kind: "watch", text: "", wakes: true, id: 76 }).label).toBe(KO.line_73);
  });
});

// The verdict mark beats while its message is judged and then wears the bubble's mark ink for how it
// went, the ink the bubble-contrast test holds to 3:1; its name says the same in words.
describe("the verdict mark", () => {
  test("beats while judged, then is green, red or the chip's own grey, each named", () => {
    const looks = (["judging", "success", "error", "neutral"] as const).map((state) => verdictChip(state));

    expect(looks.map((look) => look.iconClass)).toEqual(["verdict-beat", "text-(--chat-mark-success)", "text-(--chat-mark-error)", ""]);
    expect(looks.map((look) => wording(look.label))).toEqual([KO.line_84, wording("room.label.chip_verdicts_passed"), wording("room.label.chip_verdicts_failed"), KO.line_84_2]);
  });
});

// The briefing chip wears the chip's own mark wherever nothing is under way, the error colour only where the
// reading could not be made, and its name tells a stopped reading, which may be asked for again, from one never
// asked for (docs/web.md, the room screen's voice briefing chip).
describe("the briefing chip", () => {
  test("spins while made, is red once failed, and names a stopped reading apart from an idle one", () => {
    const looks = (["idle", "making", "ready", "failed", "stopped"] as const).map((state) => briefingChip(state));

    expect(looks.map((look) => look.iconClass)).toEqual(["", "animate-spin", "", "text-error", ""]);
    expect(looks.map((look) => look.label)).toEqual([
      "room.label.chip_briefing",
      "room.label.chip_briefing_making",
      "room.label.chip_briefing",
      "room.label.chip_briefing_failed",
      "room.label.chip_briefing_stopped"
    ]);
  });
});
