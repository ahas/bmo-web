import { expect, test } from "bun:test";

import { shortModel } from "../../apps/web/shared/model-short";

// A model's short name where room is short (docs/web.md, 「Model names where room is short」).

test("a Claude model is its provider and its family's initial with its version", () => {
  expect(shortModel("claude-code/claude-opus-5-5")).toBe("CC::O55");
  expect(shortModel("claude-code::claude-sonnet-5")).toBe("CC::S5");
  expect(shortModel("claude-haiku-4-5-20251001")).toBe("H45");
  expect(shortModel("claude-code/claude-fable-1")).toBe("CC::F1");
});

test("a Qwen model is its version, its build's initials, its kind and its size, its quantisation left out", () => {
  expect(shortModel("qwen3.8-flash-next-coder-iq1_m")).toBe("Q38-FN-Coder");
  expect(shortModel("registered/qwen3.8-27b")).toBe("Q38-27B");
  expect(shortModel("qwen3.8-flash-next-coder-q4_k_m")).toBe("Q38-FN-Coder");
});

test("a model no rule shortens stands whole", () => {
  expect(shortModel("codex/gpt-5.6-sol")).toBe("codex/gpt-5.6-sol");
  expect(shortModel("deepseek-flash")).toBe("deepseek-flash");
  expect(shortModel("")).toBe("");
});
