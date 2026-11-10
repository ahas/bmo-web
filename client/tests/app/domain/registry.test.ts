import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import {
  emptyModelForm,
  healthMark,
  healthText,
  modelChange,
  modelCreate,
  modelForm,
  modelRefusalPlace,
  registrationKey,
  registrationName,
  usedByText
} from "../../../apps/web/app/domain/registry";

import type { ModelView } from "../../../apps/web/shared/agency";

// The registered models as the agents screen reads and changes them (the agency's docs/api.md, 「providers, models
// and model files」): the model resource is one registration, its key naming the registry's provider and the
// registration apart.

const t = wording;

const model: ModelView = { key: "registered::model-a-0-1", provider: "registered", model: "RVN-model", healthy: true, lastAnsweredAt: null, cardService: "service-a", roleFiles: true, arbiterModel: "model-w", usedBy: [] };

describe("what a row says", () => {
  test("a registration is named by the part of its key after the provider", () => {
    expect(registrationName("registered::model-a-0-1")).toBe("model-a-0-1");
    expect(registrationName("model-a-0-1")).toBe("model-a-0-1");
    expect(registrationKey("model-a-0-1")).toBe("registered::model-a-0-1");
  });

  test("health is one word and one mark, and nothing where the agency has not answered", () => {
    expect([true, false, null].map((healthy) => healthText(t, healthy))).toEqual([wording("agents.label.registry_healthy"), wording("agents.label.registry_unhealthy"), ""]);
    // An engine the operator's arbiter set aside says why, in the arbiter's words.
    expect(healthText(t, false, null, "setlock: pin model-w")).toBe(wording("agents.label.registry_aside", { reason: "setlock: pin model-w" }));
    expect(healthMark(true)).toEqual({ icon: "i-material-symbols-check-circle-outline", tone: "text-success" });
    expect(healthMark(false)).toEqual({ icon: "i-material-symbols-error-outline", tone: "text-error" });
    expect(healthMark(null)).toBeNull();
  });

  test("what names it is said by its kind in the pack's words, and anything else as the agency names it", () => {
    expect(usedByText(t, "supervisor agent-a")).toBe(wording("agents.label.used_by_supervisor", { name: "agent-a" }));
    expect(usedByText(t, "role builder")).toBe(wording("agents.label.used_by_role", { name: "builder" }));
    expect(usedByText(t, "repository repo-a")).toBe(wording("agents.label.used_by_repository", { name: "repo-a" }));
    expect(usedByText(t, "model file entry-a")).toBe("model file entry-a");
  });
});

describe("what a save of the box asks", () => {
  test("a new registration is its key, the model behind it and its card service, each trimmed", () => {
    expect(modelCreate({ name: "  model-a-0-1 ", model: " RVN-model ", cardService: " ", roleFiles: false, arbiterModel: " " })).toEqual({ key: "registered::model-a-0-1", model: "RVN-model", cardService: null, roleFiles: false, arbiterModel: null });
  });

  test("a change asks for everything but its name, which is fixed once made", () => {
    expect(modelChange({ name: "model-a-0-1", model: " RVN-model-2 ", cardService: " service-b ", roleFiles: true, arbiterModel: " model-w " })).toEqual({ model: "RVN-model-2", cardService: "service-b", roleFiles: true, arbiterModel: "model-w" });
    expect(modelForm(model)).toEqual({ name: "model-a-0-1", model: "RVN-model", cardService: "service-a", roleFiles: true, arbiterModel: "model-w" });
    expect(emptyModelForm()).toEqual({ name: "", model: "", cardService: "", roleFiles: false, arbiterModel: "" });
  });

  test("a refusal stands under the field the agency named, or at the box's foot", () => {
    expect(modelRefusalPlace("name")).toBe("name");
    expect(modelRefusalPlace("cardService")).toBe("cardService");
    expect(modelRefusalPlace("action")).toBe("form");
    expect(modelRefusalPlace(null)).toBe("form");
  });
});
