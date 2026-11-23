import { describe, expect, test } from "bun:test";

import { MAX_LOGIN_LENGTH, loginOf } from "../../apps/web/shared/logins";

// The one rule every login the console is handed is read by (docs/accounts.md, 「Users and senders」): the sign-in,
// an invitation's acceptance, a rename and the account script alike, so a login an invitation makes always signs in.

describe("a login", () => {
  test("is an email address as it was typed, the spaces around it trimmed", () => {
    expect(loginOf("member@example.com")).toBe("member@example.com");
    expect(loginOf("  first.last+tag@sub.example.org ")).toBe("first.last+tag@sub.example.org");
  });

  test("is any one line of 1 to the longest characters", () => {
    expect(loginOf("a")).toBe("a");
    expect(loginOf("agent-a_b.c")).toBe("agent-a_b.c");
    expect(loginOf("x".repeat(MAX_LOGIN_LENGTH))).toBe("x".repeat(MAX_LOGIN_LENGTH));
  });

  test("is none where it is empty, too long, more than one line or holds a control character", () => {
    for (const value of ["", "   ", "x".repeat(MAX_LOGIN_LENGTH + 1), "a\nb", "a\tb", "a\u0000b", 42, null, undefined]) {
      expect(loginOf(value)).toBeNull();
    }
  });
});
