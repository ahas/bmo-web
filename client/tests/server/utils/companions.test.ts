import { expect, test } from "bun:test";

import { companionViewOf } from "../../../apps/web/server/utils/companions";

// A companion as the agency answers it whole (docs/web.md, the agents page's companions tab): its model, its settings
// and its room sessions stand, every moment read in seconds; one the receiver lists by name alone stands empty.

test("stands the agency's companion whole, its moments in seconds", () => {
  const view = companionViewOf({
    agent: "agent-a",
    label: "Agent A",
    icon: "i-material-symbols-pets",
    builtin: true,
    registration: "model-a",
    registrations: [{ name: "model-a", label: "Model A" }],
    entries: [{ name: "file-a", label: "File A", file: "a.gguf", engine: "engine-a" }],
    serving: "file-a",
    modelUse: null,
    settings: { agent: "agent-a", referenceOn: true, persona: null, generation: { temperature: 0.6 }, updatedAt: 1_790_000_000_000, updatedBy: "owner-a" },
    generationSettings: [{ name: "temperature", min: 0, max: 2 }],
    thinking: true,
    personaFile: "",
    basePrompt: "base-a",
    basePrompts: [{ name: "base-a", label: "Base A" }],
    system: { text: "text", characters: 4, hash: "hash" },
    sessions: [{ chatId: -9, title: "room-a", generation: 6, systemResetAt: 1_790_000_100_000, resetWaiting: false, lastResetAt: null }]
  });

  expect(view.registration).toBe("model-a");
  expect(view.registrations).toEqual([{ name: "model-a", label: "Model A" }]);
  expect(view.settings).toMatchObject({ referenceOn: true, generation: { temperature: 0.6 }, updatedAt: 1_790_000_000 });
  expect(view.sessions).toEqual([{ chatId: -9, title: "room-a", generation: 6, systemResetAt: 1_790_000_100, resetWaiting: false, lastResetAt: null }]);
});

test("stands one listed by name alone with what answers for it", () => {
  const view = companionViewOf({ name: "agent-b", label: "Agent B", provider: "registered", model: "model-b" });

  expect(view).toMatchObject({ agent: "agent-b", registration: "registered::model-b", registrations: [], sessions: [] });
});
