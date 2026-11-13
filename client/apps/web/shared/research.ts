// The settings every research run is held to and the search engines' state, as the research unit answers them
// (bmo-research's `docs/api.md`, 「research-settings」; docs/web.md, 「Research screen」, its settings tab), with the co-worker roles a
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
  // The roles a search's branches may go out as: those the agency lists with an agent switched on, each by its name and the words
  // the screen names it by.
  roles: { name: string; label: string }[];
}

// One change to the research settings: the field named alone, every other kept.
export type ResearchSettingsChange =
  | { branchRole: string }
  | { strategy: string }
  | { hostIntervalMs: number | null }
  | { engineIntervalMs: number | null }
  | { keys: ResearchKeySettings[] };

// What the research screen reads of the research unit (bmo-research's `docs/api.md`, 「state」, 「categories」,
// 「queue」 and 「research runs」; docs/web.md, 「Research screen」), each in the unit's own words: a state, a shape, a
// reason or a kind stands as the unit names it, and the screen says it in the pack's.

/** A watched model that keeps runs from starting now: a bench, or a wait on its health. */
export interface ResearchHold {
  registration: string;
  reason: string;
  since: number;
  reported: boolean;
  categoryNames: string[];
}

/** The calendar a topic writes its dated findings to: the owner's own or the organisation's, and the calendar's id. */
export interface ResearchCalendar {
  realm: "mine" | "organization";
  calendarId: string;
}

/** A topic registered: a category of the shape `topic`, gathered under its own instruction. */
export interface ResearchNewTopic {
  name: string;
  purpose: string;
  instruction: string;
  // How often it is gathered; the unit's own where none is named.
  gatherMinutes?: number;
  calendar?: ResearchCalendar;
}

/** A topic's change: every field it leaves out is kept, and a calendar given as null stops it writing to one. */
export interface ResearchTopicChange {
  purpose?: string;
  instruction?: string;
  gatherMinutes?: number;
  calendar?: ResearchCalendar | null;
}

/** One category with its state and its part of the queue. */
export interface ResearchCategoryView {
  name: string;
  purpose: string;
  shape: string;
  cadenceMinutes: number;
  gatherMinutes: number | null;
  provider: string | null;
  model: string | null;
  // A topic's own instruction, and the calendar its dated findings are written to; null for another shape, and for
  // a topic that writes to none.
  instruction: string | null;
  calendar: ResearchCalendar | null;
  state: string;
  stateAt: number | null;
  waitingCount: number;
  runningCount: number;
  // Its items past their retries, still asked again on the retry wait while their repair is worked on.
  stuckCount: number;
}

/** Whether the loop runs, every category in the unit's order and what holds the queue. */
export interface ResearchStateView {
  state: string;
  changedAt: number | null;
  categories: ResearchCategoryView[];
  holds: ResearchHold[];
}

/** A category's state, or every category's where none is named, changed. */
export interface ResearchStateChange {
  state: "running" | "stopped";
  categoryName?: string;
}

/**
 * Where an item came from: a source a scan read, the owner's ask, or a follow-up of an earlier research. The fields a
 * kind does not use are null.
 */
export interface ResearchOrigin {
  kind: string;
  // For a scanned item, the source that found it, as the unit names it; null where it no longer stands.
  source: string | null;
  // The words the ask was made with.
  because: string | null;
  // For a follow-up, the item and the document it follows from, with that document's title and live link as they
  // stood when the ask was made.
  itemId: number | null;
  documentId: number | null;
  title: string | null;
  shareUrl: string | null;
}

/** One thing in the queue. */
export interface ResearchItem {
  id: number;
  categoryName: string;
  name: string;
  maker: string | null;
  address: string | null;
  kind: string;
  shape: string;
  asked: boolean;
  origin: ResearchOrigin;
  state: string;
  tries: number;
  retryAt: number | null;
  runId: number | null;
  documentId: number | null;
  title: string | null;
  shareUrl: string | null;
  languages: string[];
  narrations: string[];
  fit: boolean;
  fitNodes: string[];
  // The job item filed for the helper while the item was stuck; null where none was.
  repairItemId: number | null;
  // Why its latest try failed or was interrupted, and when that try ended: that try's outcome, not how it stands now.
  error: string | null;
  errorAt: number | null;
  createdAt: number;
  changedAt: number;
}

/** A change the console makes on an item: its dismissal, or a stuck one asked again afresh or moved to its category's front. */
export type ResearchItemChange = { state: "dismissed" } | { state: "waiting" } | { front: true };

/** A page of the queue in the unit's order, and whether more stand past it. */
export interface ResearchQueuePage {
  items: ResearchItem[];
  more: boolean;
}

/**
 * A thing asked for by its category, its name and its maker's address, with the owner's words for why where they gave
 * some, and, for a follow-up, the item or the document it follows from.
 */
export interface ResearchAsk {
  categoryName: string;
  name: string;
  address: string;
  because?: string;
  followsItemId?: number;
  followsDocumentId?: number;
}

/** One research run as the runner's ledger holds it. */
export interface ResearchRunView {
  runId: number;
  key: string;
  query: string;
  provider: string;
  model: string;
  state: string;
  outcome: string | null;
  startedAt: number;
  closesAt: number | null;
  finishedAt: number | null;
  documentId: number | null;
  link: string | null;
  error: string | null;
  branches: number;
}

/** One line of a research run's log. */
export interface ResearchLogLine {
  id: number;
  at: number;
  kind: string;
  text: string;
}

/** A research run with its log, oldest first. */
export interface ResearchRunDetail {
  run: ResearchRunView;
  lines: ResearchLogLine[];
}

/** The words an item must carry, and the words that rule it out. */
export interface ResearchFilter {
  require: string[];
  exclude: string[];
}

/** A registered source: where a category's candidates are read, how often and how many at a time. */
export interface ResearchSource {
  id: number;
  categoryName: string;
  kind: string;
  address: string;
  query: string | null;
  filter: ResearchFilter;
  everyMinutes: number | null;
  limit: number;
  failureCount: number;
  lastError: string | null;
  readAt: number | null;
  createdAt: number;
  changedAt: number;
}

/** A source to register: its category and kind, and what the kind takes; a field left out is the unit's default. */
export interface ResearchNewSource {
  categoryName: string;
  kind: string;
  address?: string;
  query?: string;
  filter?: ResearchFilter;
  everyMinutes?: number;
  limit?: number;
}

/** A change of a source; a field left out keeps what it holds. */
export interface ResearchSourceChange {
  address?: string;
  query?: string;
  filter?: ResearchFilter;
  everyMinutes?: number;
  limit?: number;
}
