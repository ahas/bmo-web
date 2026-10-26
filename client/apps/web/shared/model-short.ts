// A model's short name, for the places with room for a few letters only — a row's chip, a stepper's line, a figure's
// line inside a bubble (docs/web.md, 「Model names where room is short」); every place with room shows the full name.
// A road is `provider/model`, `provider::model` or a bare model; what no rule here shortens stands whole.

// The providers whose names shorten, and to what.
const PROVIDERS: Readonly<Record<string, string>> = {
  "claude-code": "CC",
  codex: "CX",
  openrouter: "OR",
  deepseek: "DS"
};

// A Claude family by its initial: Opus, Sonnet, Haiku, Fable.
const CLAUDE = /^claude-(opus|sonnet|haiku|fable)((?:-\d+)+)$/;
const FAMILIES: Readonly<Record<string, string>> = { opus: "O", sonnet: "S", haiku: "H", fable: "F" };

// A Qwen model: its version without the dot, then its words — a word of the build's kind by its initial, `coder` and
// its kin by their name, a size as it is — and nothing of the quantisation after them.
const QWEN = /^qwen(\d+)(?:\.(\d+))?-(.+)$/;
const INITIALED = new Set(["flash", "next", "instruct", "thinking", "base", "chat"]);
const NAMED: Readonly<Record<string, string>> = { coder: "Coder", vl: "VL", omni: "Omni" };
const QUANT = /^(i?q\d.*|f16|bf16|fp\d+|gguf|mtp)$/;
const SIZE = /^\d+(\.\d+)?b$/;

function claudeShort(model: string): string | null {
  const found = CLAUDE.exec(model);

  if (found === null) return null;

  // A dated build's date is no part of its name.
  const digits = found[2]!.split("-").filter((part) => part !== "" && part.length < 8);

  return `${FAMILIES[found[1]!]}${digits.join("")}`;
}

function qwenShort(model: string): string | null {
  const found = QWEN.exec(model);

  if (found === null) return null;

  const initials: string[] = [];
  const rest: string[] = [];

  for (const word of found[3]!.split("-")) {
    if (QUANT.test(word)) break;
    if (INITIALED.has(word)) initials.push(word[0]!.toUpperCase());
    else if (word in NAMED) rest.push(NAMED[word]!);
    else if (SIZE.test(word)) rest.push(word.toUpperCase());
    else rest.push(word);
  }

  return [`Q${found[1]}${found[2] ?? ""}`, ...(initials.length > 0 ? [initials.join("")] : []), ...rest].join("-");
}

/** A model's short name: `CC::O55` for `claude-code/claude-opus-5-5`, `Q38-FN-Coder` for a Qwen3.8 flash-next coder. */
export function shortModel(road: string): string {
  const pair = road.includes("::") ? "::" : "/";
  const at = road.indexOf(pair);
  const provider = at === -1 ? null : road.slice(0, at);
  const model = at === -1 ? road : road.slice(at + pair.length);
  const short = claudeShort(model) ?? qwenShort(model);

  if (short === null) return road;

  const prefix = provider === null ? null : (PROVIDERS[provider] ?? null);

  return prefix === null ? short : `${prefix}::${short}`;
}
