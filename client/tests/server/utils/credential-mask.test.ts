import { describe, expect, test } from "bun:test";

import { maskCredentials } from "../../../apps/web/server/utils/credential-mask";

// What a journal line may carry that the logs tab never shows (docs/web.md, 「Monitor's logs tab」): the value of a
// credential goes, the words around it stay, and what only looks long — a count, a commit, a path — stays whole.

const M = "[masked]";
const mask = (text: string): string => maskCredentials(text, M);

// Shapes assembled from parts, so no file of the repository holds a whole one.
const key = (head: string, length: number): string => `${head}${"aB3".repeat(length).slice(0, length)}`;

describe("a credential", () => {
  test("goes after an authorization header and a Bearer word", () => {
    expect(mask("Authorization: Bearer abcdef1234567890")).toBe(`Authorization: Bearer ${M}`);
    expect(mask("sent with bearer abcdef1234567890 to the host")).toBe(`sent with bearer ${M} to the host`);
  });

  test("goes by a provider's or a host's known shape, and a web token", () => {
    expect(mask(`key ${key("sk-ant-", 24)} used`)).toBe(`key ${M} used`);
    expect(mask(`push ${key("ghp_", 30)} done`)).toBe(`push ${M} done`);
    expect(mask(`aws ${key("AKIA", 0)}ABCDEFGHIJKLMNOP`)).toBe(`aws ${M}`);
    expect(mask(`jwt ${key("eyJ", 12)}.${key("x", 12)}.${key("y", 12)}`)).toBe(`jwt ${M}`);
  });

  test("goes as a flag's value, an assignment's and a JSON field's, whose name says it holds one", () => {
    expect(mask("run --password hunter2 --verbose")).toBe(`run --password ${M} --verbose`);
    expect(mask("run --api-key=abc123")).toBe(`run --api-key=${M}`);
    expect(mask("AGENCY_CONTROL_TOKEN=abc123 started")).toBe(`AGENCY_CONTROL_TOKEN=${M} started`);
    expect(mask('{"client_secret": "abc123", "id": 4}')).toBe(`{"client_secret": ${M}, "id": 4}`);
  });

  test("goes from an address, the scheme, the user and the host staying", () => {
    expect(mask("postgres://app:pa55word@db.example.com/main")).toBe(`postgres://app:${M}@db.example.com/main`);
  });

  test("goes as a private key's whole block", () => {
    // The marker is assembled here, so the repository itself never holds a key block,
    // which the personal-data sweep reads as one wherever it stands.
    const block = ["-----BEGIN " + "PRIVATE KEY-----", "MIIEvQ", "-----END PRIVATE KEY----- after"].join("\n");
    expect(mask(block)).toBe(`${M} after`);
  });

  test("goes as any long word mixing capitals, small letters and digits", () => {
    expect(mask(`session ${key("", 40)} opened`)).toBe(`session ${M} opened`);
  });
});

describe("what is no credential", () => {
  test("stays: a count of tokens, a switch, a commit, a version, a path and plain words", () => {
    const kept = [
      "input_tokens=1234 output_tokens: 56",
      "token_cache=true",
      `deployed ${"0123456789abcdef".repeat(2)}0123abcd`,
      "/home/user/.local/share/unit-a/deploy-releases/4148cd96fa51/deploy",
      "the token was refreshed",
      "bmo-data-backup.service: Consumed 48.517s CPU time."
    ];

    expect(kept.map(mask)).toEqual(kept);
  });
});

describe("a value two shapes find", () => {
  test("is masked once, whatever the masking word holds", () => {
    expect(maskCredentials("run --api-key=abc123", "«hidden value»")).toBe("run --api-key=«hidden value»");
  });
});
