import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { computed, ref } from "vue";
import KO from "../../fixtures/app/domain/stopping.test.ko.json";

// What a stop does on a screen, held apart from any screen: a refusal stays with its row, a stop waits
// for its answer holding only its own row, and the row whose stop is out says so — each read here
// rather than by looking at a screen.

Object.assign(globalThis, { computed, ref });

const { stopKey, useStops } = await import("../../../apps/web/app/domain/stopping");

const runner = { kind: "unit", id: "bmo-search-9" } as const;
const turn = { kind: "execution", id: "bmo-execution-turn" } as const;

function held(): { resolve: (value?: unknown) => void; reject: (error: unknown) => void; promise: Promise<never> } {
  let resolve!: (value?: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<never>((yes, no) => {
    resolve = yes as (value?: unknown) => void;
    reject = no;
  });

  return { resolve, reject, promise };
}

const settle = async (): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, 0)); };

describe("the key a row is known by", () => {
  test("is the target in the shape every road writes it", () => {
    expect(stopKey(runner)).toBe("unit:bmo-search-9");
    expect(stopKey(turn)).toBe("execution:bmo-execution-turn");
  });
});

describe("asking before stopping", () => {
  test("one question stands at a time, and cancelling closes it without asking the bot", async () => {
    const asked: unknown[] = [];
    const stops = useStops(wording, async (target) => void asked.push(target));

    stops.ask(runner);
    expect(stops.isAsking(runner)).toBe(true);

    stops.ask(turn);
    expect(stops.isAsking(runner)).toBe(false);
    expect(stops.isAsking(turn)).toBe(true);

    stops.cancel();
    expect(stops.asking.value).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe("a stop that was asked and not confirmed", () => {
  test(KO.line_57, async () => {
    const stops = useStops(wording, async () => ({ state: "asked" }));

    stops.ask(runner);
    await stops.stop(runner);

    expect(stops.isStopping(runner)).toBe(true);
    expect(stops.isStopping(turn)).toBe(false);
    // The question is answered, so it closes; what stands in its place is the word on the row.
    expect(stops.asking.value).toBeNull();

    // Still drawn, so still stopping.
    stops.seen([stopKey(runner)]);
    expect(stops.isStopping(runner)).toBe(true);

    // Gone from the picture: the run ended, and the word goes with it.
    stops.seen([]);
    expect(stops.isStopping(runner)).toBe(false);
  });

  test("a stop the bot says it confirmed leaves no word: the row is already gone", async () => {
    const stops = useStops(wording, async () => ({ state: "confirmed" }));

    await stops.stop(runner);
    expect(stops.isStopping(runner)).toBe(false);
  });
});

describe("while a stop is out", () => {
  test("the row whose stop it is says so and waits for its answer, and holds no other row", async () => {
    const waiting = held();
    let calls = 0;
    const stops = useStops(wording, async (target) => {
      calls += 1;

      return stopKey(target) === stopKey(runner) ? await waiting.promise : { state: "asked" };
    });
    const sent = stops.stop(runner);

    await settle();
    expect(stops.isSending(runner)).toBe(true);
    expect(stops.isSending(turn)).toBe(false);

    // A second press on the same row while its stop is out is not a second call.
    await stops.stop(runner);
    expect(calls).toBe(1);

    // Another row's stop goes on its own, while the first still waits.
    await stops.stop(turn);
    expect(calls).toBe(2);
    expect(stops.isStopping(turn)).toBe(true);
    expect(stops.isSending(runner)).toBe(true);

    waiting.resolve({ state: "asked" });
    await sent;
    expect(stops.isSending(runner)).toBe(false);
    expect(stops.isStopping(runner)).toBe(true);
  });

  test("its answer closes its own question and leaves one opened on another row since", async () => {
    const waiting = held();
    const stops = useStops(wording, async () => await waiting.promise);

    stops.ask(runner);
    const sent = stops.stop(runner);

    stops.ask(turn);
    waiting.resolve({ state: "asked" });
    await sent;
    expect(stops.isAsking(turn)).toBe(true);
  });
});

describe("what goes wrong", () => {
  test("a refusal stays on the row it was pressed on, and no other row wears it", async () => {
    const stops = useStops(wording, async () => { throw { data: { message: KO.line_111 } }; });

    stops.ask(runner);
    await stops.stop(runner);

    expect(stops.errorOf(runner)).toBe(KO.line_116);
    expect(stops.errorOf(turn)).toBe("");
    // The question stays open on a refusal: the reader may try again or leave it.
    expect(stops.isAsking(runner)).toBe(true);
    expect(stops.isSending(runner)).toBe(false);

    // The row is still drawn, so what it was told stays with it — switching sections draws other
    // rows and never touches this one's.
    stops.seen([stopKey(runner), stopKey(turn)]);
    expect(stops.errorOf(runner)).toBe(KO.line_125);

    // Asking again clears what the last press was told.
    stops.ask(runner);
    expect(stops.errorOf(runner)).toBe("");
  });

  test("a row the picture no longer draws takes its refusal and its question with it", async () => {
    const stops = useStops(wording, async () => { throw new Error("no"); });

    stops.ask(runner);
    await stops.stop(runner);
    expect(stops.errorOf(runner)).toBe(wording("live.error.stop_failed"));

    stops.seen([]);
    expect(stops.errorOf(runner)).toBe("");
    expect(stops.asking.value).toBeNull();
  });
});
