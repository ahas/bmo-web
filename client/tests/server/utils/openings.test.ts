import { describe, expect, test } from "bun:test";

import "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { Judgement, RoundOpening } from "../../../apps/web/shared/types";

// What opened a room's turns, asked of the receiver once for every round a page's judgements name and worn by
// each judgement of those rounds. A stand-in answers for the receiver. The gate's offers are no part of the
// receiver's answer: an opening keeps the ones the judgement came with from the gate, and wears none otherwise.

const opening: RoundOpening = {
  instructions: [{ id: 5, sort: "run_state", summary: "#12 · queue-waiting", createdAt: 1 }],
  offers: []
};

const receiver = standIn("RECEIVER", (one) =>
  one.path.startsWith("/rounds/openings/5") ? answer({ id: 5, text: "the instruction whole" }) : answer({ items: [{ round: "round:-7:1:1", instructions: opening.instructions }], more: false })
);

const { readInstructionText, withOpenings } = await import("../../../apps/web/server/utils/openings");

const judgement = (id: number, round: string | null): Judgement =>
  ({ id, chatId: -7, messageId: 3, stage: "people-search", verdict: "SKIP: no candidates", detail: null, createdAt: 1, round }) as Judgement;

describe("the openings a page's judgements wear", () => {
  test("are asked once for every round named, and worn by each judgement of a round that had one", async () => {
    receiver.asked.length = 0;

    const worn = await withOpenings(-7, [judgement(1, "round:-7:1:1"), judgement(2, "round:-7:1:1"), judgement(3, "round:-7:2:1"), judgement(4, null)]);

    expect(receiver.asked.map((one) => one.path)).toEqual([`/rounds/openings?${new URLSearchParams({ room: "-7", rounds: "round:-7:1:1,round:-7:2:1" })}`]);
    expect(worn.map((one) => one.opening ?? null)).toEqual([opening, opening, null, null]);
  });

  test("a judgement that came with its round's offers from the gate keeps them beside the instructions", async () => {
    const offers = [{ stage: "room-rules", held: 15, asked: 12, kept: { item: 0, keyword: 1, word: 11, person: 0, recent: 2 }, capped: 0, rules: null }];
    const carried = { ...judgement(1, "round:-7:1:1"), opening: { instructions: [], offers } };

    expect((await withOpenings(-7, [carried]))[0]?.opening).toEqual({ instructions: opening.instructions, offers });
  });

  test("a page whose judgements name no round asks nothing, and a receiver that cannot be reached leaves them as they were", async () => {
    receiver.asked.length = 0;
    expect(await withOpenings(-7, [judgement(4, null)])).toEqual([judgement(4, null)]);
    expect(receiver.asked).toEqual([]);

    // A port nothing listens on.
    const closed = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const standing = process.env.RECEIVER_ADDRESS;

    process.env.RECEIVER_ADDRESS = `http://127.0.0.1:${closed.port}`;
    closed.stop(true);

    try {
      expect(await withOpenings(-7, [judgement(1, "round:-7:1:1")])).toEqual([judgement(1, "round:-7:1:1")]);
    } finally {
      process.env.RECEIVER_ADDRESS = standing;
    }
  });

  test("one instruction is read whole from the receiver, for the room it opened", async () => {
    receiver.asked.length = 0;

    expect(await readInstructionText(-7, 5)).toEqual({ id: 5, text: "the instruction whole" });
    expect(receiver.asked.map((one) => one.path)).toEqual([`/rounds/openings/5?${new URLSearchParams({ room: "-7" })}`]);
  });
});
