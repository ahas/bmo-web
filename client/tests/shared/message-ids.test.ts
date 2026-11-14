import { describe, expect, test } from "bun:test";

import { exactMessageIdOf } from "../../apps/web/shared/message-ids";

// A message id is the digits of a signed 64-bit integer, told apart by its digits (docs/web.md, 「A message's id」).
const HIGH = "3973025898369060353";

describe("a message id read from a value", () => {
  test("digits of a signed 64-bit integer, and a whole number held without rounding, name a message", () => {
    expect([exactMessageIdOf(HIGH), exactMessageIdOf("-12"), exactMessageIdOf(42), exactMessageIdOf("9223372036854775807")]).toEqual([
      HIGH,
      "-12",
      "42",
      "9223372036854775807"
    ]);
  });

  test("anything else names none: a rounded number, digits past 64 bits, a leading zero, words", () => {
    expect([exactMessageIdOf(Number(HIGH)), exactMessageIdOf("9223372036854775808"), exactMessageIdOf("042"), exactMessageIdOf("m4"), exactMessageIdOf(null)]).toEqual([
      null,
      null,
      null,
      null,
      null
    ]);
  });
});
