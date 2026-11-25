import { describe, expect, test } from "bun:test";

import { minutesWords, minutesWritten } from "../../../apps/web/app/domain/deploy-flush";

// The minutes box of the administration screen's flush minutes row (docs/web.md, 「System and organisation」, the providers
// tab): what the words written in it ask of the agency, and the words it shows for the minutes in force.

describe("the flush minutes box", () => {
  test("asks a figure as written, thousands marks and spaces left out, for the agency to take or refuse", () => {
    expect(minutesWritten("90")).toEqual({ readable: true, minutes: 90 });
    expect(minutesWritten(" 1,440 ")).toEqual({ readable: true, minutes: 1440 });
    expect(minutesWritten("0")).toEqual({ readable: true, minutes: 0 });
    expect(minutesWritten("-5")).toEqual({ readable: true, minutes: -5 });
    expect(minutesWritten("1.5")).toEqual({ readable: true, minutes: 1.5 });
  });

  test("asks the agency's own once emptied, and nothing for words that are no figure", () => {
    expect(minutesWritten("")).toEqual({ readable: true, minutes: null });
    expect(minutesWritten("  ")).toEqual({ readable: true, minutes: null });
    expect(minutesWritten("an hour")).toEqual({ readable: false });
  });

  test("shows the minutes in force with thousands marks, and nothing where the agency answers none", () => {
    expect(minutesWords(60)).toBe("60");
    expect(minutesWords(1440)).toBe("1,440");
    expect(minutesWords(null)).toBe("");
  });
});
