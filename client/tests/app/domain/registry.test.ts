import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { mappingText } from "../../../apps/web/app/domain/agent-settings";
import {
  answeringModels,
  emptyModelForm,
  healthMark,
  healthText,
  modelChange,
  modelCreate,
  modelForm,
  modelRefusalPlace,
  pinValue,
  registrationKey,
  registrationName,
  registryPinChoices
} from "../../../apps/web/app/domain/registry";

import type { ModelView } from "../../../apps/web/shared/agency";
import KO from "../../fixtures/app/domain/registry.test.ko.json";

// The registered models as the agents screen reads and changes them (the agency's docs/api.md,
// 「providers, models, pin-checks, tiers and fallback」): the model resource is one registration, its key
// naming the registry's provider and the registration apart.

const t = wording;

const model: ModelView = { key: "registered::model-a-0-1", provider: "registered", model: "RVN-model", tier: "large", healthy: true, lastAnsweredAt: null };

describe("what a row says", () => {
  test("a registration is named by the part of its key after the provider", () => {
    expect(registrationName("registered::model-a-0-1")).toBe("model-a-0-1");
    expect(registrationName("model-a-0-1")).toBe("model-a-0-1");
    expect(registrationKey("model-a-0-1")).toBe("registered::model-a-0-1");
  });

  test("health is one word and one mark, and nothing where the agency has not answered", () => {
    expect([true, false, null].map((healthy) => healthText(t, healthy))).toEqual([wording("agents.label.registry_healthy"), wording("agents.label.registry_unhealthy"), ""]);
    expect(healthMark(true)).toEqual({ icon: "i-material-symbols-check-circle-outline", tone: "text-success" });
    expect(healthMark(false)).toEqual({ icon: "i-material-symbols-error-outline", tone: "text-error" });
    expect(healthMark(null)).toBeNull();
  });

  test("a tier cell of the registry leaves thinking to the registration where it names none", () => {
    const mapping = { provider: "registered", model: "model-a-0-1", effort: null, answerTokens: null };

    expect(mappingText(t, mapping, true, true)?.detail).toBe(`${wording("common.label.default")}${KO.line_47}`);
    expect(mappingText(t, { ...mapping, effort: "no-thinking" }, true, true)?.detail).toContain(KO.line_48);
    expect(mappingText(t, mapping, true)?.detail).toContain(KO.line_49);
  });
});

describe("what a save of the box asks", () => {
  test("a new registration is its key and the model behind it, each trimmed", () => {
    expect(modelCreate({ name: "  model-a-0-1 ", model: " RVN-model " })).toEqual({ key: "registered::model-a-0-1", model: "RVN-model" });
  });

  test("a change asks for the model alone, the name fixed once made", () => {
    expect(modelChange({ name: "model-a-0-1", model: " RVN-model-2 " })).toEqual({ model: "RVN-model-2" });
    expect(modelForm(model)).toEqual({ name: "model-a-0-1", model: "RVN-model" });
    expect(emptyModelForm()).toEqual({ name: "", model: "" });
  });

  test("a refusal stands under the field the bot named, or at the box's foot", () => {
    expect(modelRefusalPlace("name")).toBe("name");
    expect(modelRefusalPlace("model")).toBe("model");
    expect(modelRefusalPlace("key")).toBe("key");
    expect(modelRefusalPlace("action")).toBe("form");
    expect(modelRefusalPlace(null)).toBe("form");
  });
});

describe("a worker's pin", () => {
  test("offers every registration whose addresses answer as a pin of its own, and reads one back", () => {
    const held = [model, { ...model, key: "registered::bare", healthy: false }, { ...model, key: "registered::unknown", healthy: null }];

    expect(answeringModels(held).map((one) => one.key)).toEqual(["registered::model-a-0-1"]);
    expect(registryPinChoices(held)).toEqual([{ label: "model-a-0-1", value: "registered::model-a-0-1" }]);
    expect(pinValue("registered", "model-a-0-1", "auto")).toBe("registered::model-a-0-1");
    expect(pinValue("registered", null, "auto")).toBe("registered");
    expect(pinValue(null, null, "auto")).toBe("auto");
  });
});
