import type { FallbackProfile } from "#shared/types";
import type { Translate } from "#shared/wording";

// What the agent-management screen says about the searchers: which work keys are theirs and the names
// they stand under (docs/web.md, 「Agent management screen」).

// The run lines a research goes out on, as the agency names them.
const RESEARCH_LINES: readonly string[] = ["search", "browse"];

// Each research key's name, by the key of the words it is said in.
export const PROFILE_LABELS: Record<string, string> = {
  "search:basic": "research.label.profile_search_basic",
  "search:thorough": "research.label.profile_search_thorough",
  "search:exhaustive": "research.label.profile_search_exhaustive",
  browse: "research.label.profile_browse"
};

// A research key this screen has no words for stands under the key the agency gave it.
export function profileLabel(t: Translate, key: string): string {
  const label = PROFILE_LABELS[key];

  return label === undefined ? key : t(label);
}

// The line a key no profile declares goes out on, read off its name the way the agency reads it.
function lineByName(key: string): string | null {
  if (key === "browse") return "browse";
  if (key.startsWith("search")) return "search";

  return null;
}

function onResearchLine(line: string | null): boolean {
  return line !== null && RESEARCH_LINES.includes(line);
}

/** The searchers' work keys: every profile on a research line, then every assigned key no profile declares that goes out on one. */
export function researchKeys(profiles: readonly Pick<FallbackProfile, "key" | "line">[], assignments: readonly { key: string }[]): string[] {
  const keys = profiles.filter((profile) => onResearchLine(profile.line)).map((profile) => profile.key);

  for (const { key } of assignments) {
    if (!keys.includes(key) && !profiles.some((profile) => profile.key === key) && onResearchLine(lineByName(key))) keys.push(key);
  }

  return keys;
}
