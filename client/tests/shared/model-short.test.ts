import { expect, test } from "bun:test";

import { shortModel } from "../../apps/web/shared/model-short";

// A model's short name where room is short (docs/web.md, 「Model names where room is short」): `<provider>/<model>`,
// the provider's letters, then the maker's letters, the family words' initials and the version digits.

test("a DeepSeek model is DS and its words' initials, then v and its version", () => {
  expect(shortModel("deepseek-flash")).toBe("DS/DSF");
  expect(shortModel("deepseek/deepseek-flash")).toBe("DS/DSF");
  expect(shortModel("deepseek::deepseek-v4-pro")).toBe("DS/DSPv4");
  expect(shortModel("deepseek/deepseek-v4.1-flash")).toBe("DS/DSFv41");
});

test("a registered Qwen engine is Q and its words' initials, then v and its version, its quantisation left out", () => {
  expect(shortModel("qwen3.8-flash-next-coder-iq1_m")).toBe("Q/QFNCv38");
  expect(shortModel("registered/qwen3.8-flash-next-iq3_s")).toBe("Q/QFNv38");
  expect(shortModel("registered::qwen3.8-flash-next-coder-iq1_m")).toBe("Q/QFNCv38");
});

test("a Claude model is C and its family's initial, then its version digits with no v", () => {
  expect(shortModel("claude-code/claude-opus-5-5")).toBe("CC/CO55");
  expect(shortModel("claude-sonnet-5")).toBe("CC/CS5");
  expect(shortModel("claude-code::claude-haiku-4-5")).toBe("CC/CH45");
});

test("a GPT model is G, its version digits, then the family word as it is written", () => {
  expect(shortModel("gpt-5.6-sol")).toBe("CX/G56sol");
  expect(shortModel("codex/gpt-5.6-sol")).toBe("CX/G56sol");
});

test("a model no rule shortens stands whole, and a provider no letters are written for keeps its model whole", () => {
  expect(shortModel("openrouter/nvidia/nemotron-3-ultra-550b-a55b:free")).toBe("openrouter/nvidia/nemotron-3-ultra-550b-a55b:free");
  expect(shortModel("registered/hy-mt2-7b")).toBe("registered/hy-mt2-7b");
  expect(shortModel("")).toBe("");
});
