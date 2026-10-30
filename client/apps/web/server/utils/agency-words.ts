import { wording } from "#shared/wording";

// The agency's codes for what it says in English — why a road cannot be taken, a provider, a role and a bundle — each with the
// pack's key for its words (the agency's `docs/api.md`). The codes are the agency's and its providers' own; the
// table is where the console says them. A code the pack holds no words for is said as the code itself.

const ROAD_REASONS: Readonly<Record<string, string>> = {
  "openrouter-key-unset": "agents.status.road_openrouter_key_unset",
  "deepseek-key-unusable": "agents.status.road_deepseek_key_unusable",
  "codex-missing": "agents.status.road_codex_missing",
  "gateway-key-unusable": "agents.status.road_gateway_key_unusable",
  "no-registration-addressed": "agents.status.road_no_registration_addressed",
  "line-not-carried": "agents.status.road_line_not_carried",
  "laya-url-unset": "agents.status.road_laya_url_unset"
};

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  "claude-code": "agents.label.provider_claude_code",
  codex: "agents.label.provider_codex",
  openrouter: "agents.label.provider_openrouter",
  deepseek: "agents.label.provider_deepseek",
  registered: "agents.label.provider_registered",
  laya: "agents.label.provider_laya"
};

const ROLE_LABELS: Readonly<Record<string, string>> = {
  chat: "agents.label.role_chat",
  worker: "agents.label.role_worker",
  searcher: "agents.label.role_searcher",
  translator: "agents.label.role_translator",
  gate: "agents.label.role_gate"
};

const BUNDLE_LABELS: Readonly<Record<string, string>> = {
  "room-chat": "agents.label.bundle_room_chat",
  "room-send": "agents.label.bundle_room_send",
  "web-read": "agents.label.bundle_web_read",
  "web-sites": "agents.label.bundle_web_sites",
  "web-images": "agents.label.bundle_web_images",
  "web-branches": "agents.label.bundle_web_branches",
  "web-rulebooks": "agents.label.bundle_web_rulebooks",
  "graph-read": "agents.label.bundle_graph_read",
  "queue-read": "agents.label.bundle_queue_read"
};

/** Why a road cannot be taken, in the pack's words, beside the agency's own sentence — its fuller `detail` where it
 * sends one beside a short clause; both null on a road that can. */
export function roadReasonOf(reason: unknown, code: unknown, detail?: unknown): { reason: string | null; reasonEnglish: string | null } {
  const english = typeof detail === "string" && detail !== "" ? detail : typeof reason === "string" && reason !== "" ? reason : null;
  const named = typeof code === "string" && code !== "" ? code : null;

  if (english === null && named === null) return { reason: null, reasonEnglish: null };

  const key = named === null ? undefined : ROAD_REASONS[named];
  const said = key !== undefined ? wording(key) : named !== null ? wording("agents.status.road_unknown_code", { code: named }) : wording("agents.status.road_unavailable");

  return { reason: said, reasonEnglish: english };
}

function labelOf(table: Readonly<Record<string, string>>, code: unknown, name: string): string {
  const named = typeof code === "string" && code !== "" ? code : name;
  const key = table[named];

  return key === undefined ? wording("agents.label.unknown_code", { code: named }) : wording(key);
}

// A code the pack holds words for is said in them; any other is said by the label the agency keeps for it.
function wordOr(table: Readonly<Record<string, string>>, code: unknown, name: string, label: string): string {
  const named = typeof code === "string" && code !== "" ? code : name;
  const key = table[named];

  return key === undefined ? (label === "" ? named : label) : wording(key);
}

/** A role the screen names, in the pack's words where the pack holds them, by its agency label otherwise. */
export function roleWordOf(code: unknown, name: string, label: string): string {
  return wordOr(ROLE_LABELS, code, name, label);
}

/** A bundle the screen names, in the pack's words where the pack holds them, by its agency label otherwise. */
export function bundleWordOf(code: unknown, name: string, label: string): string {
  return wordOr(BUNDLE_LABELS, code, name, label);
}

/** A role's name in the pack's words, by its code. */
export function roleLabelOf(code: unknown, name: string): string {
  return labelOf(ROLE_LABELS, code, name);
}

/** A bundle's name in the pack's words, by its code. */
export function bundleLabelOf(code: unknown, name: string): string {
  return labelOf(BUNDLE_LABELS, code, name);
}

/** A provider's name in the pack's words, by its code. */
export function providerLabelOf(code: unknown, name: string): string {
  return labelOf(PROVIDER_LABELS, code, name);
}
