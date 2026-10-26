import { countText } from "./numbers";

import { TURN_ENDED, useLiveRefresh } from "./events";
import { layaModeWord } from "./gate-order";

import type { LayaAgreement, LayaGateView, LayaHealth, LayaMode, LayaModeRefusal, LayaView, NodeTone } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";

// Laya on the agent management screen (docs/web.md, the agents page's gates tab): the server's last health check and
// each gate's agreement with its LLM, as the gate unit's `GET /laya` answers them; this decides how they read.

export function emptyLayaView(t: Translate): LayaView {
  return {
    health: {
      state: "unreachable", stateWord: t("agents.status.laya_unavailable"), tone: "bad", node: null, model: null, device: null, vramBytes: null,
      loadMs: null, versions: {}, address: null, checkMs: null, checkedAt: null, healthyAt: null,
    },
    gates: [],
    modes: [],
    taus: [],
  };
}

// The words and the tone each state of the server's health check is said in.
const STATE_LOOKS: Record<string, { key: string; tone: NodeTone }> = {
  up: { key: "agents.status.laya_up", tone: "good" },
  busy: { key: "agents.status.laya_busy", tone: "good" },
  off: { key: "agents.status.laya_off", tone: "unknown" },
  unknown: { key: "agents.status.laya_unchecked", tone: "unknown" },
  unreachable: { key: "agents.status.laya_unreachable", tone: "bad" },
  timeout: { key: "agents.status.laya_timeout", tone: "bad" },
  refused: { key: "agents.status.laya_refused", tone: "bad" },
  "bad-answer": { key: "agents.status.laya_bad_answer", tone: "bad" },
  "too-large": { key: "agents.status.laya_too_large", tone: "bad" }
};

/** The view a screen stands from the gate unit's answer: the state in its words and tone, each mode in its words. */
export function layaViewOf(t: Translate, read: { health: LayaHealth; gates: LayaGateView[]; modes: LayaMode[]; taus: number[] }): LayaView {
  const look = STATE_LOOKS[read.health.state] ?? { key: "agents.status.laya_unchecked", tone: "unknown" as NodeTone };

  return {
    health: { ...read.health, stateWord: t(look.key), tone: look.tone, node: null },
    gates: read.gates,
    modes: read.modes.map((mode) => ({ value: mode, label: layaModeWord(t, mode) })),
    taus: read.taus
  };
}

// How often the band is read again while it stands.
const LAYA_POLL_MS = 30_000;

// The view as the gate unit answers it, read again every half minute and as a turn ends; where the unit is not
// reached, Laya not reached and no gate of its.
export function useLaya(t: Translate): { laya: Ref<LayaView>; status: Ref<string>; refresh: () => Promise<void> } {
  const { data, status, refresh } = useFetch<{ health: LayaHealth; gates: LayaGateView[]; modes: LayaMode[]; taus: number[] }>("/api/laya", { key: "laya", lazy: true, server: false });
  const laya = computed(() => (data.value == null ? emptyLayaView(t) : layaViewOf(t, data.value)));

  useLiveRefresh(() => void refresh(), { on: TURN_ENDED, everyMs: LAYA_POLL_MS });

  return { laya, status, refresh: async () => await refresh() };
}

export function percentText(share: number | null): string {
  return share === null ? "—" : `${(share * 100).toFixed(1)}%`;
}

export function tauText(t: Translate, tau: number | null): string {
  return tau === null ? t("common.label.none") : tau.toFixed(2);
}

export function layaModeLabel(view: LayaView, mode: LayaMode): string {
  return view.modes.find((one) => one.value === mode)?.label ?? mode;
}

// A gate's own line of the view: the mode and tau it runs on and its agreement, or null for a gate that
// has no Laya probe.
export function layaGateOf(view: LayaView, stage: string): LayaGateView | null {
  return view.gates.find((gate) => gate.stage === stage) ?? null;
}

export function agreementOf(view: LayaView, stage: string): LayaAgreement | null {
  return layaGateOf(view, stage)?.agreement ?? null;
}

// A gate's agreement where a cell shows it: the share over every pair, or a dash where none is recorded.
export function agreementText(agreement: LayaAgreement | null): string {
  return agreement === null || agreement.pairs === 0 ? "—" : percentText(agreement.agreement);
}

// What stands under it: how many pairs the share rests on — questions, for a gate Laya settles one
// question at a time, with the share of them it settled — and, at the gate's tau, the share Laya
// would settle and how often it agrees there.
export function agreementNote(t: Translate, agreement: LayaAgreement | null, tau: number | null): string {
  if (agreement === null) return t("common.label.no_record");

  const counted = agreement.unit === "question" ? "agents.label.laya_questions" : "agents.label.laya_pairs";
  const parts = [t(counted, { n: countText(agreement.pairs) })];

  if (agreement.failures > 0) parts.push(t("agents.label.laya_failures", { n: countText(agreement.failures) }));

  if (agreement.settled !== null) parts.push(t("agents.label.laya_settled", { share: percentText(agreement.settled) }));

  const at = tau === null ? undefined : agreement.byTau.find((one) => one.tau === tau);

  if (at !== undefined && at.coverage !== null) parts.push(
      t("agents.label.laya_at_tau", { tau: tauText(t, tau), coverage: percentText(at.coverage), agreement: percentText(at.agreement) })
    );

  return parts.join(" · ");
}

// Why the bot would not put a gate in a mode, as the mode's list says it.
export function layaRefusalText(t: Translate, why: LayaModeRefusal): string {
  const keys: Record<LayaModeRefusal, string> = {
    "no-probe": "agents.label.laya_refused_no_probe",
    "no-safe-verdict": "agents.label.laya_refused_no_safe_verdict",
    "no-checkpoint": "agents.label.laya_refused_no_checkpoint",
  };

  return t(keys[why]);
}

export function vramText(bytes: number | null): string {
  return bytes === null ? "" : `${(bytes / 1024 ** 3).toLocaleString("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} GB`;
}

// The model's last name, which is what a line has room for.
export function modelShortName(model: string | null): string {
  if (model === null) return "";

  const parts = model.split("/").filter(Boolean);

  return parts.at(-1) ?? model;
}
