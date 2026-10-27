import { describe, expect, test } from "bun:test";
import { ref } from "vue";

import { useMentions } from "../../../apps/web/app/domain/mentions";

import type { MentionBox, MentionSources } from "../../../apps/web/app/domain/mentions";

// The mention an @ starts in the input box (docs/web.md, the room screen's section on mentions): which names a room offers, what the
// caret's @ reads as the name's start, the keyboard that moves over the list, and the words a pick leaves in the box —
// the name itself, since that is what the receiver reads.

function boxOf(value: string, caret = value.length): MentionBox {
  return {
    value,
    selectionStart: caret,
    focus: () => undefined,
    setSelectionRange: () => undefined
  };
}

function setup(sources: MentionSources, value = "", caret = value.length) {
  const text = ref(value);
  const area = boxOf(value, caret);
  const mentions = useMentions(text, () => area, () => sources, () => true);

  return { text, area, mentions };
}

const SOURCES: MentionSources = { people: ["person-a", "person-b"], agents: ["agent-a", "agent-b"] };

const key = (name: string, over: Partial<KeyboardEvent> = {}): KeyboardEvent => ({ key: name, ...over }) as KeyboardEvent;

describe("the list an @ opens", () => {
  test("offers the room's agents first and then its people", () => {
    const { area, mentions } = setup(SOURCES, "@");

    mentions.track();

    expect(mentions.open.value).toBe(true);
    expect(mentions.items.value.map((one) => [one.text, one.kind])).toEqual([
      ["agent-a", "agent"],
      ["agent-b", "agent"],
      ["person-a", "person"],
      ["person-b", "person"]
    ]);
    expect(area.value).toBe("@");
  });

  test("filters by what follows the @, the case set aside", () => {
    const { mentions } = setup(SOURCES, "@AGENT-B");

    mentions.track();

    expect(mentions.items.value.map((one) => one.text)).toEqual(["agent-b"]);
  });

  test("stands only where the @ starts a word, and only where a name can follow it", () => {
    for (const value of ["mail@example", "a", "@" + "x".repeat(41), "words"]) {
      const { mentions } = setup(SOURCES, value);

      mentions.track();

      expect({ value, open: mentions.open.value }).toEqual({ value, open: false });
    }
  });

  test("closes where no name the room holds starts that way", () => {
    const { mentions } = setup(SOURCES, "@nobody");

    mentions.track();

    expect(mentions.open.value).toBe(false);
  });

  test("closes once the words go past the name", () => {
    const { mentions } = setup(SOURCES, "@agent-a ");

    mentions.track();

    expect(mentions.open.value).toBe(false);
  });

  test("stands whether or not the box offers a mention at all", () => {
    const text = ref("@");
    const mentions = useMentions(text, () => boxOf("@"), () => SOURCES, () => false);

    mentions.track();

    expect(mentions.open.value).toBe(false);
  });
});

describe("the keyboard over the list", () => {
  test("moves the choice both ways, round the ends", () => {
    const { mentions } = setup(SOURCES, "@");

    mentions.track();
    expect(mentions.active.value).toBe(0);

    expect(mentions.key(key("ArrowDown"))).toBe(true);
    expect(mentions.active.value).toBe(1);

    expect(mentions.key(key("ArrowUp"))).toBe(true);
    expect(mentions.active.value).toBe(0);

    expect(mentions.key(key("ArrowUp"))).toBe(true);
    expect(mentions.active.value).toBe(3);
  });

  test("takes the choice on Enter and on Tab, and gives back the keys it does not take", () => {
    const { mentions } = setup(SOURCES, "@");

    mentions.track();
    expect(mentions.key(key("Enter"))).toBe(true);

    const second = setup(SOURCES, "@");

    second.mentions.track();
    expect(second.mentions.key(key("Tab"))).toBe(true);
    expect(second.mentions.key(key("ArrowLeft"))).toBe(false);
  });

  test("a modifier on Enter is a line of its own, never a pick", () => {
    const { mentions } = setup(SOURCES, "@");

    mentions.track();

    expect(mentions.key(key("Enter", { shiftKey: true }))).toBe(false);
    expect(mentions.key(key("Enter", { altKey: true }))).toBe(false);
    expect(mentions.open.value).toBe(true);
  });

  test("a key pressed to finish a composition is the letters' own", () => {
    const { mentions } = setup(SOURCES, "@");

    mentions.track();

    expect(mentions.key({ key: "Enter", isComposing: true } as KeyboardEvent)).toBe(false);
    expect(mentions.open.value).toBe(true);
  });

  test("Esc puts the list away", () => {
    const { mentions } = setup(SOURCES, "@");

    mentions.track();
    expect(mentions.key(key("Escape"))).toBe(true);

    expect(mentions.open.value).toBe(false);
  });

  test("takes no key while the list stands closed", () => {
    const { mentions } = setup(SOURCES, "words");

    expect(mentions.key(key("Enter"))).toBe(false);
  });
});

describe("what a pick leaves in the box", () => {
  test("writes the name in place of the @ and its start, and a space after it", () => {
    const { text, mentions } = setup(SOURCES, "hello @agent");

    mentions.track();
    mentions.choose(0);

    expect(text.value).toBe("hello agent-a ");
    expect(mentions.open.value).toBe(false);
  });

  test("writes a person's name as the room names them", () => {
    const { text, mentions } = setup(SOURCES, "@person-b");

    mentions.track();
    mentions.choose(0);

    expect(text.value).toBe("person-b ");
  });

  test("keeps the words after the caret where they stand", () => {
    const { text, mentions } = setup(SOURCES, "@agent and more", 6);

    mentions.track();
    mentions.choose(0);

    expect(text.value).toBe("agent-a  and more");
  });

  test("takes the choice the arrows stand on", () => {
    const { text, mentions } = setup(SOURCES, "@");

    mentions.track();
    mentions.key(key("ArrowDown"));
    mentions.key(key("ArrowDown"));
    mentions.choose();

    expect(text.value).toBe("person-a ");
  });
});
