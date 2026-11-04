import { describe, expect, test } from "bun:test";

import { readKeptChoice } from "../../../apps/web/app/domain/kept-choice";

const CHOICE = { key: "x", address: "/x", field: "x", isChoice: (value: unknown): value is string => value === "a", fallback: "d" };

describe("a kept choice as it is read", () => {
  test("answers what the server keeps", async () => {
    expect(await readKeptChoice(CHOICE, async () => ({ x: "a" }))).toBe("a");
  });

  test("answers the fallback where the server keeps one it no longer knows", async () => {
    expect(await readKeptChoice(CHOICE, async () => ({ x: "retired" }))).toBe("d");
  });

  test("answers nothing where it could not be read, so what is held stands", async () => {
    expect(await readKeptChoice(CHOICE, async () => { throw new Error("503"); })).toBeNull();
  });
});
