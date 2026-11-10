import { describe, expect, mock, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";

import { computed, nextTick, ref, watch } from "vue";

import KO from "../../fixtures/app/domain/text-reading.test.ko.json";

// A text read in the reader's language under its original. What is pinned here is what the screen cannot show by
// itself: a text already in the reader's language asks nothing, two places asking for one text share one ask, a
// translator too busy or failing says so and is asked again on retry, and a console naming no translator asks nothing.

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["computed", "ref", "watch"]);
globals.ref = ref;
globals.computed = computed;
globals.watch = watch;

let named = true;
let answer: (texts: readonly string[]) => Promise<{ text: string; whole: boolean; untranslated?: boolean }[]> = async (texts) =>
  texts.map((text) => ({ text: `ko:${text}`, whole: true }));
const asks: string[][] = [];

class Refused extends Error {
  constructor(readonly statusCode: number) {
    super("refused");
  }
}

// The console's own translation route, as the composable asks it.
globals.$fetch = async (url: string, options: { body: { originals: string[] } }) => {
  if (url !== "/api/translations") throw new Error(`unexpected ${url}`);

  asks.push([...options.body.originals]);

  return { readings: await answer(options.body.originals) };
};

mock.module("bmo-ui/app/domain/translation", () => ({ hasTranslator: () => named }));

const { useAskedReading, useTextReading, wantsReading, readerLanguage } = await import("../../../apps/web/app/domain/text-reading");

const settle = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) await nextTick();
};

describe("a text's reading", () => {
  test("a text in the reader's language, or an empty one, takes none", async () => {
    expect(wantsReading(KO.done, "ko")).toBe(false);
    expect(wantsReading("  ", "ko")).toBe(false);
    expect(wantsReading("The work is done.", "ko")).toBe(true);
    expect(readerLanguage("ko-KR")).toBe("ko");
    expect(readerLanguage("en")).toBe("en");

    asks.length = 0;
    const { reading } = useTextReading(() => KO.done, () => "ko");

    await settle();
    expect(reading.value).toEqual({ kind: "none" });
    expect(asks).toEqual([]);
  });

  test("an English text is asked for and lands as it arrives, and two places share one ask", async () => {
    asks.length = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((done) => (release = done));

    answer = async (texts) => {
      await gate;
      return texts.map((text) => ({ text: `ko:${text}`, whole: true }));
    };

    const one = useTextReading(() => "Shared words.", () => "ko");
    const other = useTextReading(() => "Shared words.", () => "ko");

    expect(one.reading.value).toEqual({ kind: "asking" });
    release();
    await settle();

    expect(one.reading.value).toEqual({ kind: "read", text: "ko:Shared words.", whole: true });
    expect(other.reading.value).toEqual({ kind: "read", text: "ko:Shared words.", whole: true });
    expect(asks).toEqual([["Shared words."]]);
  });

  test("a reading not whole says so", async () => {
    answer = async (texts) => texts.map((text) => ({ text, whole: false }));

    const { reading } = useTextReading(() => "Partly read.", () => "ko");

    await settle();
    expect(reading.value).toEqual({ kind: "read", text: "Partly read.", whole: false });
  });

  test("a translator too busy reads as busy, a failing one as failed, and retry asks again", async () => {
    answer = async (texts) => texts.map((text) => ({ text, whole: false, untranslated: true }));

    const busy = useTextReading(() => "Busy words.", () => "ko");

    await settle();
    expect(busy.reading.value).toEqual({ kind: "busy" });

    answer = async () => {
      throw new Refused(403);
    };

    const failing = useTextReading(() => "Failing words.", () => "ko");

    await settle();
    expect(failing.reading.value).toEqual({ kind: "failed" });

    asks.length = 0;
    answer = async (texts) => texts.map((text) => ({ text: `ko:${text}`, whole: true }));
    failing.retry();
    await settle();
    expect(failing.reading.value).toEqual({ kind: "read", text: "ko:Failing words.", whole: true });
    expect(asks).toEqual([["Failing words."]]);
  });

  test("a console naming no translator asks nothing", async () => {
    named = false;
    asks.length = 0;

    const { reading } = useTextReading(() => "Untranslatable here.", () => "ko");

    await settle();
    expect(reading.value).toEqual({ kind: "none" });
    expect(asks).toEqual([]);
    named = true;
  });
});

describe("a reading asked for by a press", () => {
  test("asks nothing until the action is pressed, and lands under the original", async () => {
    named = true;
    asks.length = 0;
    answer = async (texts) => texts.map((text) => ({ text: `ko:${text}`, whole: true }));

    const asked = useAskedReading(() => "Memory words.", () => "ko");

    await settle();
    expect(asked.reading.value).toEqual({ kind: "none" });
    expect(asked.blocked.value).toBeNull();
    expect(asks).toEqual([]);

    asked.ask();
    await settle();

    expect(asked.reading.value).toEqual({ kind: "read", text: "ko:Memory words.", whole: true });
    expect(asks).toEqual([["Memory words."]]);
  });

  test("stands disabled with its reason where no translator is named", async () => {
    named = false;
    asks.length = 0;

    const asked = useAskedReading(() => "Memory words.", () => "ko");

    asked.ask();
    await settle();

    expect(asked.blocked.value).toBe("absent");
    expect(asks).toEqual([]);
    named = true;
  });

  test("stands disabled with its reason where the translator answers too busy, until it is asked again", async () => {
    named = true;
    asks.length = 0;
    answer = async (texts) => texts.map((text) => ({ text, whole: false, untranslated: true }));

    const asked = useAskedReading(() => "Busy memory.", () => "ko");

    asked.ask();
    await settle();
    expect(asked.blocked.value).toBe("busy");
    expect(asked.reading.value).toEqual({ kind: "busy" });

    answer = async (texts) => texts.map((text) => ({ text: `ko:${text}`, whole: true }));
    asked.ask();
    await settle();

    expect(asked.blocked.value).toBeNull();
    expect(asked.reading.value).toEqual({ kind: "read", text: "ko:Busy memory.", whole: true });
  });

  test("another text clears the reading asked for before", async () => {
    named = true;
    answer = async (texts) => texts.map((text) => ({ text: `ko:${text}`, whole: true }));

    const text = ref("First words.");
    const asked = useAskedReading(() => text.value, () => "ko");

    asked.ask();
    await settle();
    expect(asked.reading.value.kind).toBe("read");

    text.value = "Second words.";
    await settle();

    expect(asked.reading.value).toEqual({ kind: "none" });
  });
});
