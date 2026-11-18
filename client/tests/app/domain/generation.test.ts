import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { anyRunning, catalogueSave, emptyCatalogueForm, sourceText } from "../../../apps/web/app/domain/catalogue-models";
import { draftDiffers, generationBounds, generationChange, generationDraft, generationMeaning, generationUse, piecesChange, piecesDraft } from "../../../apps/web/app/domain/generation";

import type { SupervisorSettingsView } from "../../../apps/web/shared/axes";

// A supervisor's own settings and the model catalogue as the console reads them (docs/web.md, 「Agent management
// screen」; the agency's docs/model-catalogue.md).

const t = wording;
const generation = { temperature: 0.7 };

describe("a catalogue entry", () => {
  test("a save sends empty texts as nothing and the hash in lower case", () => {
    const form = { ...emptyCatalogueForm(), name: "ko1", file: "model.gguf", bytes: 10, sha256: " ABC ", source: " " };

    expect(catalogueSave(form)).toMatchObject({ name: "ko1", label: "ko1", sha256: "abc", source: null, thinking: null });
    expect(sourceText(t, "train-a/run1")).toBe("train-a/run1");
    expect(anyRunning([{ state: "done" }, { state: "running" }])).toBe(true);
  });
});
describe("the generation settings", () => {
  const generationSettings = [
    { name: "temperature", min: 0, max: 2 },
    { name: "top_k", min: 0, max: 1_000, whole: true },
    { name: "max_tokens", min: 1, max: 262_143, whole: true },
  ];

  test("start as the saved numbers, empty where nothing is set, each with what it does and its bounds", () => {
    expect(generationDraft({ generationSettings, generation })).toEqual({ temperature: "0.7", top_k: "", max_tokens: "" });
    expect(generationUse(t, "temperature")).not.toBe("");
    expect(generationUse(t, "mirostat")).toBe("");
    expect(generationBounds(generationSettings[2]!)).toBe("1 ~ 262,143");
  });

  test("send only what differs from what is saved, an emptied box as none", () => {
    expect(generationChange({ temperature: "0.7", top_k: "", max_tokens: "" }, { temperature: 0.7 })).toEqual({});
    expect(generationChange({ temperature: "", top_k: " 20 ", max_tokens: 4096 }, { temperature: 0.7 })).toEqual({ temperature: null, top_k: 20, max_tokens: 4096 });
  });

  test("hold a switch as on or off, empty where nothing is set, and offer no entry standing for a default", () => {
    const switches = [{ name: "preserve_thinking", switch: true as const, template: true as const }];

    expect(generationDraft({ generationSettings: switches, generation: { preserve_thinking: false } })).toEqual({ preserve_thinking: "off" });
    expect(generationDraft({ generationSettings: switches, generation: {} })).toEqual({ preserve_thinking: "" });
    expect(generationBounds(switches[0]!)).toBe("");
    expect(generationChange({ preserve_thinking: "off" }, { preserve_thinking: false })).toEqual({});
    expect(generationChange({ preserve_thinking: "on" }, { preserve_thinking: false })).toEqual({ preserve_thinking: true });
    expect(generationChange({ preserve_thinking: "" }, {})).toEqual({});
  });
});

describe("a supervisor's own settings as its form holds them", () => {
  const view: SupervisorSettingsView = {
    name: "tester-chat",
    sessions: 0,
    generation,
    generationSettings: [{ name: "temperature", min: 0, max: 2 }, { name: "top_k", min: 0, max: 1_000, whole: true }],
    referenceOn: true,
    persona: null,
    personaFile: "",
    system: { text: "", characters: 0, hash: "" }
  };
  const saved = piecesDraft(view);

  test("holds no change until a field differs, a box typed back to its saved number included", () => {
    const draft = { ...saved, generation: { temperature: "0.70", top_k: "" } };

    expect(piecesChange(draft, saved)).toEqual({});
    expect(draftDiffers("generation", draft, saved)).toBe(false);
  });

  test("reads a persona of its own typed back to its saved text, spaces aside, as no change, and one of the file's as none", () => {
    const own = { ...saved, persona: "tester persona" };

    expect(draftDiffers("persona", { ...own, persona: " tester persona " }, own)).toBe(false);
    expect(draftDiffers("persona", { ...saved, persona: "" }, saved)).toBe(true);
    expect(draftDiffers("persona", { ...own, persona: null }, own)).toBe(true);
  });

  test("hands the boxes as the values they send, so a writing of the same number is alike and one of no number stays text", () => {
    expect(generationMeaning({ temperature: "0.70", top_k: "", seed: 7, preserve_thinking: "on", min_p: " x " })).toEqual({
      temperature: 0.7, top_k: null, seed: 7, preserve_thinking: true, min_p: "x"
    });
  });

  test("sends every changed setting in one change", () => {
    const draft = { ...saved, referenceOn: false, persona: "tester persona", generation: { temperature: "", top_k: "20" } };

    expect(piecesChange(draft, saved)).toEqual({
      referenceOn: false,
      persona: "tester persona",
      generation: { temperature: null, top_k: 20 }
    });
  });

  test("holds no model, base prompt or thinking of its own: the supervisor's order carries them", () => {
    expect(Object.keys(saved).sort()).toEqual(["generation", "persona", "referenceOn"]);
  });
});
