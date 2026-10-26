import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { agreementNote, agreementOf, agreementText, emptyLayaView, layaGateOf, layaModeLabel, layaRefusalText, layaViewOf, modelShortName, percentText, tauText, vramText } from "../../../apps/web/app/domain/laya";

import type { LayaAgreement, LayaView } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/laya.test.ko.json";

const gate: LayaAgreement = {
  stage: "output-format",
  unit: "pair",
  settled: null,
  pairs: 1_234,
  failures: 3,
  agreement: 0.9214,
  byTau: [
    { tau: 0.5, coverage: 1, agreement: 0.9214, safeCount: null, safeAgreement: null },
    { tau: 0.9, coverage: 0.8, agreement: 0.97, safeCount: null, safeAgreement: null },
  ],
};

const view: LayaView = {
  ...emptyLayaView(wording),
  gates: [{ stage: "output-format", mode: "shadow", tau: null, agreement: gate, checkpoint: "output-format/real-2-fold/step-000100", refused: {} }, { stage: "classifier", mode: "shadow", tau: null, agreement: null, checkpoint: null, refused: { asymmetric: "no-safe-verdict", filter: "no-checkpoint" } }],
  modes: [{ value: "shadow", label: KO.line_25 }],
  taus: [0.5, 0.9],
};

describe("a gate's agreement as a cell reads it", () => {
  test("is its share with one decimal, or a dash where nothing is recorded", () => {
    expect(agreementText(gate)).toBe("92.1%");
    expect(agreementText(null)).toBe("—");
    expect(agreementText({ ...gate, pairs: 0, agreement: null })).toBe("—");
  });

  test("stands over how many pairs it rests on, the failures beside them, and at the gate's tau the share Laya would settle", () => {
    expect(agreementNote(wording, gate, null)).toBe(KO.line_37);
    expect(agreementNote(wording, gate, 0.9)).toBe(KO.line_38);
    expect(agreementNote(wording, { ...gate, failures: 0 }, null)).toBe(KO.line_39);
    expect(agreementNote(wording, null, 0.9)).toBe(wording("common.label.no_record"));
  });

  test("a refused mode says why in the pack's words", () => {
    expect(layaRefusalText(wording, "no-safe-verdict")).toBe(wording("agents.label.laya_refused_no_safe_verdict"));
    expect(layaRefusalText(wording, "no-checkpoint")).toBe(wording("agents.label.laya_refused_no_checkpoint"));
    expect(layaRefusalText(wording, "no-probe")).toBe(wording("agents.label.laya_refused_no_probe"));
  });

  test("counts questions, and the share Laya settled, for a gate settled one question at a time", () => {
    expect(agreementNote(wording, { ...gate, unit: "question", settled: 0.625, failures: 0 }, 0.9))
      .toBe(KO.line_51);
  });

  test("is found by the gate's key", () => {
    expect(agreementOf(view, "output-format")).toBe(gate);
    expect(agreementOf(view, "classifier")).toBeNull();
    expect(layaGateOf(view, "classifier")?.mode).toBe("shadow");
    expect(layaGateOf(view, "translator")).toBeNull();
    expect(layaGateOf(view, "output-format")?.checkpoint).toBe("output-format/real-2-fold/step-000100");
  });
});

describe("the rest of what Laya shows", () => {
  test("reads tau, shares, memory, the model and the mode", () => {
    expect(tauText(wording, 0.9)).toBe("0.90");
    expect(tauText(wording, null)).toBe(KO.line_66);
    expect(percentText(null)).toBe("—");
    expect(percentText(1)).toBe("100.0%");
    expect(vramText(1_587_544_064)).toBe("1.5 GB");
    expect(vramText(20 * 1024 ** 2)).toBe("20 MB");
    expect(vramText(1_000 * 1024 ** 2)).toBe("1,000 MB");
    expect(vramText(1024 ** 3)).toBe("1.0 GB");
    expect(vramText(4_096)).toBe("1 MB");
    expect(vramText(null)).toBe("");
    expect(modelShortName("convaiinnovations/laya/multilingual")).toBe("multilingual");
    expect(modelShortName("/home/user/laya/checkpoints/smoke")).toBe("smoke");
    expect(layaModeLabel(view, "shadow")).toBe(KO.line_73);
    expect(layaModeLabel(view, "filter")).toBe("filter");
  });
});

// The band stands the gate unit's answer in its words (docs/web.md, the agents page's gates tab): each state of the
// health check in its word and tone, each mode in its words; a unit not reached stands as not reached.
describe("the Laya view", () => {
  test("stands each state in its words and tone, and each mode in its words", () => {
    const health = { state: "up" as const, model: "m", device: "cuda", vramBytes: 1, loadMs: 1, versions: {}, address: null, checkMs: 7, checkedAt: 1, healthyAt: 1 };
    const view = layaViewOf(wording, { health, gates: [], modes: ["off", "shadow"], taus: [0.5] });

    expect(view.health).toMatchObject({ stateWord: wording("agents.status.laya_up"), tone: "good" });
    expect(layaViewOf(wording, { health: { ...health, state: "timeout" }, gates: [], modes: [], taus: [] }).health.tone).toBe("bad");
    expect(view.modes).toEqual([
      { value: "off", label: wording("agents.label.laya_mode_off") },
      { value: "shadow", label: wording("agents.label.laya_mode_shadow") }
    ]);
    expect(emptyLayaView(wording).health).toMatchObject({ stateWord: wording("agents.status.laya_unavailable"), tone: "bad" });
  });
});
