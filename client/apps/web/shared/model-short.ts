import { shallowRef } from "vue";

import type { ModelView } from "./agency";

// A model's short name, for the places with room for a few letters only — a TODO row's chip, a stepper's line, a
// figure's line inside a bubble (docs/web.md, 「Model names where room is short」); every place with room shows the
// name whole. A road is `provider/model`, `provider::model` or a bare model. A registered engine is its alias resolved
// through the deployment's registrations to the engine it names, and stands as that engine's letters with no provider
// before it; every other road is `<provider>/<model>`, the provider's letters, then the maker's letters, the family
// words' initials and the version digits. A model no rule here shortens stands whole, provider and all.

// The provider every registration is chosen under.
const REGISTERED_PROVIDER = "registered";

/** One registration as the shortening reads it: the name a run records, and the engine behind it. */
export type ModelRegistration = Pick<ModelView, "key" | "provider" | "model">;

// What each registration's alias names, as the deployment holds them. The shell that holds the rows naming a model
// fills this in; a short name read before it is filled falls back to the alias itself, never to `registered::…`.
const engines = shallowRef<ReadonlyMap<string, string>>(new Map());

/** The registrations whose aliases a short name resolves, by alias, to the engine each names. */
export function setModelRegistrations(models: readonly ModelRegistration[]): void {
  const held = new Map<string, string>();

  for (const model of models) {
    if (model.provider !== REGISTERED_PROVIDER) continue;

    const at = model.key.indexOf("::");
    const alias = at === -1 ? model.key : model.key.slice(at + 2);

    if (alias !== "" && model.model !== "") held.set(alias, model.model);
  }

  engines.value = held;
}

// The providers whose names shorten, and to what.
const PROVIDERS: Readonly<Record<string, string>> = {
  "claude-code": "CC",
  codex: "CX",
  openrouter: "OR",
  deepseek: "DS"
};

// A family of models: what names it, the letters its maker shortens to, and the provider's letters a road naming no
// provider takes; null where a bare model carries no provider of its own.
interface Maker {
  pattern: RegExp;
  letters: string;
  provider: string | null;
}

const DEEPSEEK = 0;
const QWEN = 1;
const CLAUDE = 2;
const GPT = 3;

const MAKERS: readonly Maker[] = [
  { pattern: /^deepseek-(.+)$/i, letters: "DS", provider: "DS" },
  { pattern: /^qwen(\d+(?:\.\d+)?)?-(.+)$/i, letters: "Q", provider: null },
  { pattern: /^claude-([a-z]+)-((?:\d+-?)+)$/i, letters: "C", provider: "CC" },
  { pattern: /^gpt-(\d+(?:\.\d+)?)-(.+)$/i, letters: "G", provider: "CX" }
];

// The words of a Qwen name that stand as their initial. A quantisation and a dated build end the words that count.
const QUANT = /^(i?q\d.*|f16|bf16|fp\d+|gguf|mtp)$/;
const DATED = /^\d{6,8}$/;

// A Claude family by its initial.
const CLAUDE_FAMILIES: Readonly<Record<string, string>> = { opus: "O", sonnet: "S", haiku: "H", fable: "F" };

// The version digits a name spells, the dot and any dash between them left out.
function versionOf(text: string): string {
  return text.replace(/[.-]/g, "");
}

// The initials of the words that count, a quantisation or a dated build ending them.
function initialsOf(words: readonly string[]): string {
  const letters: string[] = [];

  for (const word of words) {
    if (QUANT.test(word) || DATED.test(word)) break;

    letters.push(word[0]!.toUpperCase());
  }

  return letters.join("");
}

// A DeepSeek model's letters: its words' initials, then `v` and its version — `DSFv41` for `deepseek-v4.1-flash`.
function deepseekLetters(rest: string): string {
  const version = /^v?(\d+(?:\.\d+)?)/i.exec(rest);
  const words = (version === null ? rest : rest.slice(version[0].length)).split(/[-_]/).filter((word) => word !== "");
  const digits = version === null ? "" : versionOf(version[1]!);

  return `${initialsOf(words)}${digits === "" ? "" : `v${digits}`}`;
}

// A Qwen engine's letters: its words' initials, then its version digits — `FNC38` for `qwen3.8-flash-next-coder`.
function qwenLetters(version: string | undefined, rest: string): string {
  const words = rest.split(/[-_]/).filter((word) => word !== "");
  const digits = version === undefined ? "" : versionOf(version);

  return `${initialsOf(words)}${digits}`;
}

// A Claude model's letters: its family's initial and its version digits with no `v` — `CO55` for `claude-opus-5-5`;
// a dated build's date is no part of them.
function claudeLetters(family: string, version: string): string {
  const digits = version.replace(/-(\d{6,8})$/, "");

  return `${CLAUDE_FAMILIES[family] ?? family[0]!.toUpperCase()}${versionOf(digits)}`;
}

// A GPT model's letters: its version digits, then the family word as it is written — `G56sol` for `gpt-5.6-sol`.
function gptLetters(version: string, rest: string): string {
  return `${versionOf(version)}${rest.replace(/[-_]/g, "")}`;
}

// The letters a model's own name gives, or null where no rule here shortens it.
function lettersOf(maker: Maker, found: RegExpExecArray): string {
  const index = MAKERS.indexOf(maker);

  if (index === DEEPSEEK) return `${maker.letters}${deepseekLetters(found[1]!)}`;
  if (index === QWEN) return `${maker.letters}${qwenLetters(found[1], found[2]!)}`;
  if (index === CLAUDE) return `${maker.letters}${claudeLetters(found[1]!, found[2]!)}`;

  return `${maker.letters}${gptLetters(found[1]!, found[2]!)}`;
}

// Where a registered road's model already names an engine, or its alias does.
function engineOf(model: string): string {
  return engines.value.get(model) ?? model;
}

/**
 * A model's short name: `DS/DSF` for `deepseek-flash`, `DS/DSPv4` for `deepseek-v4-pro`, `QFN38` for a registered
 * engine whose registration or own name is `qwen3.8-flash-next`, `CC/CO55` for `claude-code/claude-opus-5-5`,
 * `CX/G56sol` for `gpt-5.6-sol`. A registered engine carries no provider: `QFNC38`, or its alias as it is where no
 * registration names it.
 */
export function shortModel(road: string): string {
  const pair = road.includes("::") ? "::" : "/";
  const at = road.indexOf(pair);
  const provider = at === -1 ? null : road.slice(0, at);
  const model = at === -1 ? road : road.slice(at + pair.length);
  const registered = provider === REGISTERED_PROVIDER;
  const named = registered ? engineOf(model) : model;

  for (const maker of MAKERS) {
    const found = maker.pattern.exec(named);

    if (found === null) continue;

    // The provider's own letters; a registered engine and a bare Qwen engine take none, and a provider no letters are
    // written for leaves the model whole.
    const letters = registered ? null : (PROVIDERS[provider ?? ""] ?? (provider === null ? maker.provider : null));
    const shortened = lettersOf(maker, found);

    return letters === null ? shortened : `${letters}/${shortened}`;
  }

  return registered ? named : road;
}
