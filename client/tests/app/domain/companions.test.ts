import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { anyRunning, catalogueSave, emptyCatalogueForm, sourceText } from "../../../apps/web/app/domain/catalogue-models";
import { companionChange, companionDraft, draftDiffers, generationBounds, generationChange, generationDraft, generationUse } from "../../../apps/web/app/domain/companions";
import { sessionClears, sessionDetail } from "../../../apps/web/app/domain/sessions";

import type { CompanionView, ModelUseView } from "../../../apps/web/shared/agency";
import KO from "../../fixtures/app/domain/companions.test.ko.json";

// A companion's settings and the model catalogue as the console reads them (the agency's docs/companions.md,
// 「Its settings」; the agency's docs/model-catalogue.md).

const t = wording;
const settings: CompanionView["settings"] = {
  agent: "tester-chat",
  referenceOn: true,
  persona: null,
  generation: { temperature: 0.7 },
  updatedAt: null,
  updatedBy: null,
};

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

  test("start as the saved numbers, empty where the engine's default stands, each with what it does and its bounds", () => {
    expect(generationDraft({ generationSettings, settings })).toEqual({ temperature: "0.7", top_k: "", max_tokens: "" });
    expect(generationUse(t, "temperature")).not.toBe("");
    expect(generationUse(t, "mirostat")).toBe("");
    expect(generationBounds(generationSettings[2]!)).toBe("1 ~ 262,143");
  });

  test("send only what differs from what is saved, an emptied box as the engine's default", () => {
    expect(generationChange({ temperature: "0.7", top_k: "", max_tokens: "" }, { temperature: 0.7 })).toEqual({});
    expect(generationChange({ temperature: "", top_k: " 20 ", max_tokens: 4096 }, { temperature: 0.7 })).toEqual({ temperature: null, top_k: 20, max_tokens: 4096 });
  });

  test("hold a switch as on, off or default and send it as on, off or the engine's default", () => {
    const switches = [{ name: "preserve_thinking", switch: true as const, template: true as const }];

    expect(generationDraft({ generationSettings: switches, settings: { ...settings, generation: { preserve_thinking: false } } })).toEqual({ preserve_thinking: "off" });
    expect(generationDraft({ generationSettings: switches, settings: { ...settings, generation: {} } })).toEqual({ preserve_thinking: "default" });
    expect(generationBounds(switches[0]!)).toBe("");
    expect(generationChange({ preserve_thinking: "off" }, { preserve_thinking: false })).toEqual({});
    expect(generationChange({ preserve_thinking: "on" }, { preserve_thinking: false })).toEqual({ preserve_thinking: true });
    expect(generationChange({ preserve_thinking: "default" }, { preserve_thinking: false })).toEqual({ preserve_thinking: null });
    expect(generationChange({ preserve_thinking: "default" }, {})).toEqual({});
  });
});

describe("the form a block holds", () => {
  const view: CompanionView = {
    agent: "tester-chat",
    label: "tester-chat",
    icon: null,
    builtin: false,
    registration: "tester-model",
    registrations: [],
    entries: [],
    serving: "file-a",
    modelUse: null,
    settings,
    generationSettings: [{ name: "temperature", min: 0, max: 2 }, { name: "top_k", min: 0, max: 1_000, whole: true }],
    thinking: null,
    personaFile: "",
    basePrompt: null,
    basePrompts: [],
    system: { text: "", characters: 0, hash: "" },
    sessions: [],
  };
  const saved = companionDraft(view, "-");

  test("holds no change until a field differs, a box typed back to its saved number included", () => {
    const draft = { ...saved, generation: { temperature: "0.70", top_k: "" } };

    expect(companionChange(draft, saved)).toEqual({});
    expect(draftDiffers("generation", draft, saved)).toBe(false);
  });

  test("sends every changed setting in one change, the base prompt and the engine file left to their own paths", () => {
    const draft = { ...saved, thinking: "default" as const, referenceOn: false, persona: "tester persona", generation: { temperature: "", top_k: "20" }, base: "other", entry: "file-b" };

    expect(companionChange({ ...draft, thinking: "off" }, saved)).toEqual({
      referenceOn: false,
      persona: "tester persona",
      generation: { temperature: null, top_k: 20 },
      thinking: false,
    });
    expect(draftDiffers("base", draft, saved) && draftDiffers("entry", draft, saved)).toBe(true);
  });

  test("an engine file being put on reads as the saved one", () => {
    const modelUse: ModelUseView = { id: 1, entry: "file-b", engine: "engine-a", chosenBy: "tester", startedAt: 1, endedAt: null, state: "running", step: null, reason: null, log: null, logTail: [] };
    const running: CompanionView = { ...view, modelUse };

    expect(companionDraft(running, "-").entry).toBe("file-b");
  });
});

describe("a session's reset", () => {
  const session = { kind: "companion", running: false, models: ["model-a-0-1"], title: KO.line_157, chatId: -101, generation: 3 };

  test("says what it clears in each holder's words, and a worker's whether it waits for its job", () => {
    expect(sessionClears(t, session)).toContain(KO.line_160);
    expect(sessionClears(t, { ...session, kind: "worker", chatId: null, running: false })).not.toBe(sessionClears(t, { ...session, kind: "worker", chatId: null, running: true }));
    expect(sessionClears(t, { ...session, kind: "chat", chatId: null })).not.toBe(sessionClears(t, { ...session, kind: "unknown", chatId: null }));
    expect(sessionDetail(t, session)).toContain("3");
  });
});
