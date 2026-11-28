import { wording } from "#shared/wording";

// The agency's codes for what it says in English — why a road cannot be taken, a provider and a bundle — each with the
// pack's key for its words (the agency's `docs/api.md`). A role is never worded here: every screen shows it by its name
// alone (docs/web.md, the roles tab). The codes are the agency's and its providers' own; the
// table is where the console says them. A code the pack holds no words for is said by the pack's generic word for its
// sort, never by the agency's English.

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
  laya: "agents.label.provider_laya",
  anthropic: "agents.label.provider_anthropic"
};

// The bundles a role may give, by code: every one the agency's policy declares (its `policy/roles.toml`, `[[bundles]]`)
// among them.
export const BUNDLE_LABELS: Readonly<Record<string, string>> = {
  "room-chat": "agents.label.bundle_room_chat",
  "room-send": "agents.label.bundle_room_send",
  "web-read": "agents.label.bundle_web_read",
  "web-sites": "agents.label.bundle_web_sites",
  "web-images": "agents.label.bundle_web_images",
  "web-branches": "agents.label.bundle_web_branches",
  "web-rulebooks": "agents.label.bundle_web_rulebooks",
  "graph-read": "agents.label.bundle_graph_read",
  "queue-read": "agents.label.bundle_queue_read",
  "brain-lessons": "agents.label.bundle_brain_lessons"
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

// The pack's key for a code, the code being the agency's where it sends one and the name otherwise.
function keyOf(table: Readonly<Record<string, string>>, code: unknown, name: string): { named: string; key: string | undefined } {
  const named = typeof code === "string" && code !== "" ? code : name;

  return { named, key: Object.hasOwn(table, named) ? table[named] : undefined };
}

function labelOf(table: Readonly<Record<string, string>>, code: unknown, name: string): string {
  const { named, key } = keyOf(table, code, name);

  return key === undefined ? wording("agents.label.unknown_code", { code: named }) : wording(key);
}

// The sources a slot is asked under, as the agency's `docs/role-slots.md` names them, each with the pack's key for its
// word: the agency's own vocabulary of who asks, not the name of any role.
const SLOT_SOURCES: Readonly<Record<string, string>> = {
  job: "live.label.slot_source_job",
  ask: "live.label.slot_source_ask",
  cowork: "live.label.slot_source_cowork",
  native: "live.label.slot_source_native",
  search: "live.label.slot_source_search",
  browse: "live.label.slot_source_browse",
  translate: "live.label.slot_source_translate"
};

/** The source a slot was asked under, in the pack's words; one the pack holds none for is said as the code it is. */
export function slotSourceOf(source: string | null): string {
  if (source === null) return wording("live.label.slot_source_none");

  const key = SLOT_SOURCES[source];

  return key === undefined ? wording("agents.label.unknown_code", { code: source }) : wording(key);
}

/** A bundle the screen names, in the pack's words by its code, and as another bundle where the pack holds none. */
export function bundleWordOf(code: unknown, name: string): string {
  const { key } = keyOf(BUNDLE_LABELS, code, name);

  return wording(key ?? "agents.label.bundle_other");
}

/** A provider's name in the pack's words, by its code. */
export function providerLabelOf(code: unknown, name: string): string {
  return labelOf(PROVIDER_LABELS, code, name);
}
