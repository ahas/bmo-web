import { describe, expect, test } from "bun:test";

import {
  loginNumbers,
  loginOwnerKey,
  loginText,
  loginsOfOwner,
  namedLoginNumber,
  nextLoginNumber,
  PLATFORM_OWNER
} from "../../apps/web/shared/claude-logins";
import { wording } from "../../apps/web/shared/wording";

import type { LoginRow } from "../../apps/web/shared/claude-logins";

// What the console calls one of a reader's Claude logins (docs/web.md, 「System and organisation」, the supply tab). The agency numbers
// every login it names one past every login the platform holds, so the number standing in a name counts other
// accounts' logins among them; the screen counts the logins of one account against each other from one, and leaves
// the name standing where it has no number to count. Nothing of the name, the id or the owner is changed here.

function login(id: string, name: string, userId: number | null = null): LoginRow {
  return { id, name, userId };
}

const UNTOLD: LoginRow = { id: "untold", name: "claude-04" };

describe("a login's number within its own account", () => {
  test("runs in the order the agency's numbers stand, not the order the rows walk", () => {
    const rows = [login("a", "claude-07", 7), login("b", "claude-03", 7), login("c", "claude-05", 7)];

    expect([...loginNumbers(rows).entries()]).toEqual([["b", 1], ["c", 2], ["a", 3]]);
  });

  test("counts the platform's own logins apart from a person's, though one list carries both", () => {
    const rows = [login("p1", "claude-01"), login("o1", "claude-02", 1), login("p2", "claude-03")];
    const numbers = loginNumbers(rows);

    expect(numbers.get("p1")).toBe(1);
    expect(numbers.get("p2")).toBe(2);
    expect(numbers.get("o1")).toBe(1);
  });

  test("counts nothing for a login whose name numbers nothing, nor for one whose owner the screen is not told", () => {
    const rows = [login("kept", "work-machine"), UNTOLD, login("first", "claude-01")];
    const numbers = loginNumbers(rows);

    expect(numbers.has("kept")).toBe(false);
    expect(numbers.has("untold")).toBe(false);
    expect(numbers.get("first")).toBe(1);
    expect(loginText(wording, "work-machine", numbers.get("kept") ?? null)).toBe("work-machine");
    expect(loginText(wording, UNTOLD.name, numbers.get("untold") ?? null)).toBe("claude-04");
  });

  test("tells the platform's own logins apart as one account and hands them to a box that adds one", () => {
    const rows = [login("p1", "claude-01"), login("o1", "claude-02", 1), login("p2", "claude-03")];

    expect(loginOwnerKey(login("p1", "claude-01"))).toBe(PLATFORM_OWNER);
    expect(loginOwnerKey(UNTOLD)).toBeNull();
    expect(loginsOfOwner(rows, PLATFORM_OWNER).map((one) => one.id)).toEqual(["p1", "p2"]);
    expect(loginsOfOwner(rows, loginOwnerKey(login("o1", "claude-02", 1)))).toEqual([login("o1", "claude-02", 1)]);
    expect(loginsOfOwner(rows, null)).toEqual([]);
  });
});

describe("a sign-in the agency has just named", () => {
  test("takes the number its name gives it among the logins it will stand beside", () => {
    const own = [login("a", "claude-03", 7), login("b", "claude-05", 7)];

    expect(nextLoginNumber(own, "claude-07")).toBe(3);
    expect(nextLoginNumber(own, "claude-04")).toBe(2);
    expect(nextLoginNumber([], "claude-03")).toBe(1);
  });

  test("has no number when its name carries none, which leaves the name standing", () => {
    expect(nextLoginNumber([login("a", "claude-03", 7)], "hand-named")).toBeNull();
    expect(namedLoginNumber("claude-03")).toBe(3);
    expect(namedLoginNumber("claude-3")).toBe(3);
    expect(namedLoginNumber("Claude-007")).toBeNull();
    expect(namedLoginNumber("claude-03-token")).toBeNull();
  });
});

describe("what a screen calls a login", () => {
  test("is its number in the pack's words, two figures at least", () => {
    const numbered = (number: number) => loginText(wording, "claude-09", number);

    expect(numbered(1)).toBe(wording("supply.label.login_numbered", { number: "01" }));
    expect(numbered(9)).toBe(wording("supply.label.login_numbered", { number: "09" }));
    expect(numbered(12)).toBe(wording("supply.label.login_numbered", { number: "12" }));
    expect(numbered(100)).toBe(wording("supply.label.login_numbered", { number: "100" }));
  });

  test("is the name it is stored under where no number was counted", () => {
    expect(loginText(wording, "claude-04", null)).toBe("claude-04");
    expect(loginText(wording, "claude-04", undefined)).toBe("claude-04");
  });
});
