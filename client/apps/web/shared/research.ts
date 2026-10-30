// The settings every research run is held to and the search engines' state, as the research unit answers them
// (bmo-research's `docs/api.md`, 「research-settings」; docs/web.md, the searcher tab), with the co-worker roles a
// search's branches may go out on beside them. They are written here because the console reads the unit over
// HTTP and imports none of its code.

// One research key's branches and clock; its page budgets are the unit's to keep and the screen does not read them.
export interface ResearchKeySettings {
  key: string;
  branches: number;
  minutes: number;
}

export interface SearchEngineState {
  name: string;
  category: string | null;
  state: string;
  reason: string | null;
  observedAt: number | null;
  suspendedUntil: number | null;
}

export interface ResearchSettingsView {
  branchRole: string;
  strategy: string;
  hostIntervalMs: number | null;
  engineIntervalMs: number | null;
  keys: ResearchKeySettings[];
  source: string;
  engines: SearchEngineState[] | null;
  enginesUnread: string | null;
  // The co-worker roles a search's branches may go out on, as the agency's pool lists them.
  roles: string[];
}

// One change to the research settings: the field named alone, every other kept.
export type ResearchSettingsChange =
  | { branchRole: string }
  | { strategy: string }
  | { hostIntervalMs: number | null }
  | { engineIntervalMs: number | null }
  | { keys: ResearchKeySettings[] };
