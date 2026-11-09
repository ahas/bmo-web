import { wording } from "#shared/wording";

import { unitFetch } from "./units";

import type {
  ResearchAsk,
  ResearchCalendar,
  ResearchCategoryView,
  ResearchFilter,
  ResearchHold,
  ResearchItem,
  ResearchItemChange,
  ResearchLogLine,
  ResearchNewSource,
  ResearchNewTopic,
  ResearchOrigin,
  ResearchQueuePage,
  ResearchRunDetail,
  ResearchRunView,
  ResearchSource,
  ResearchSourceChange,
  ResearchStateChange,
  ResearchStateView,
  ResearchTopicChange
} from "#shared/research";

// The research unit, bmo-research, as the console reaches it: its state, its categories, its queue and an item's
// research run and its sources, for the research screen (its `docs/api.md`; docs/web.md, 「Research screen」). The unit publishes no
// TypeScript client, so it is called by its documented paths, at the address and with the token `RESEARCH_ADDRESS`
// and `RESEARCH_TOKEN` name.

const UNIT = "RESEARCH";

// The unit's codes that say nothing a person acts on, each said as a failure on its side.
const FAILED: Readonly<Record<string, string>> = {
  "bad-request": "research.error.failed",
  unauthorized: "research.error.failed",
  "no-route": "research.error.failed",
  failed: "research.error.failed",
  "upstream-failed": "research.error.failed",
  unavailable: "research.error.failed"
};

// What each call's refusals say, by what was asked.
const READ = { ...FAILED, "not-found": "research.error.no_item" };
const STATE = { ...FAILED, "not-found": "research.error.no_category" };
const ASK = { ...FAILED, "bad-request": "research.error.ask_refused", "not-found": "research.error.no_category", conflict: "research.error.ask_conflict" };
const FOLLOW = { ...FAILED, "bad-request": "research.error.follow_refused", "not-found": "research.error.follow_missing", conflict: "research.error.follow_conflict" };
const DISMISS = { ...FAILED, "not-found": "research.error.no_item", conflict: "research.error.dismiss_conflict" };
const REASK = { ...FAILED, "not-found": "research.error.no_item", conflict: "research.error.reask_conflict" };
const FRONT = { ...FAILED, "not-found": "research.error.no_item", conflict: "research.error.front_conflict" };
const RUN = { ...FAILED, "not-found": "research.error.no_run" };
const TOPIC_ADD = { ...FAILED, "bad-request": "research.error.topic_refused", conflict: "research.error.topic_taken" };
const TOPIC_CHANGE = { ...FAILED, "bad-request": "research.error.topic_refused", "not-found": "research.error.no_category", conflict: "research.error.topic_held" };
const SOURCE_READ = FAILED;
const SOURCE_ADD = { ...FAILED, "bad-request": "research.error.source_refused", "not-found": "research.error.no_category" };
const SOURCE_CHANGE = { ...FAILED, "bad-request": "research.error.source_refused", "not-found": "research.error.no_source" };

/** A call on the research unit, its refusals said in the pack's words by the table given; a unit not reached — no address named, or nothing took the call — is said as the research unit not answering. */
export async function researchFetch<T>(path: string, init: RequestInit | undefined, codes: Readonly<Record<string, string>>): Promise<T> {
  try {
    return await unitFetch<T>(UNIT, path, init, { codes });
  } catch (error) {
    throw unreached(error) ? fail(503, wording("research.error.unreachable")) : error;
  }
}

// A refusal the unit answered carries what it said; a call that never reached it carries nothing.
function unreached(error: unknown): boolean {
  const failure = error as { statusCode?: unknown; data?: unknown } | null;

  return failure?.statusCode === 503 && failure.data === undefined;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

interface UnitCategoryState {
  categoryName: string;
  state: string;
  waitingCount: number;
  runningCount: number;
  stuckCount: number;
}

interface UnitState {
  state: string;
  changedAt: number | null;
  categories: UnitCategoryState[];
  holds: ResearchHold[];
}

interface UnitCategory {
  name: string;
  purpose: string;
  shape: string;
  cadenceMinutes: number;
  gatherMinutes: number | null;
  provider: string | null;
  model: string | null;
  instruction?: string | null;
  calendar?: { realm?: string; calendarId?: string } | null;
  state: string;
  stateAt: number | null;
}

// The calendar a category names, where it names one of the two realms and an id.
function calendarOf(value: unknown): ResearchCalendar | null {
  const held = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  const realm = held?.realm;
  const calendarId = typeof held?.calendarId === "string" ? held.calendarId.trim() : "";

  return (realm === "mine" || realm === "organization") && calendarId !== "" ? { realm, calendarId } : null;
}

// Every category the unit holds, in its order, with the state and the part of the queue the state names for it.
function stateOf(state: UnitState, categories: readonly UnitCategory[]): ResearchStateView {
  const counted = new Map(state.categories.map((one) => [one.categoryName, one]));

  return {
    state: state.state,
    changedAt: state.changedAt ?? null,
    categories: categories.map((category): ResearchCategoryView => {
      const standing = counted.get(category.name);

      return {
        name: category.name,
        purpose: category.purpose,
        shape: category.shape,
        cadenceMinutes: category.cadenceMinutes,
        gatherMinutes: category.gatherMinutes ?? null,
        provider: category.provider ?? null,
        model: category.model ?? null,
        instruction: category.instruction ?? null,
        calendar: calendarOf(category.calendar),
        state: standing?.state ?? category.state,
        stateAt: category.stateAt ?? null,
        waitingCount: standing?.waitingCount ?? 0,
        runningCount: standing?.runningCount ?? 0,
        stuckCount: standing?.stuckCount ?? 0
      };
    }),
    holds: (state.holds ?? []).map((hold) => ({ registration: hold.registration, reason: hold.reason, since: hold.since, reported: hold.reported, categoryNames: hold.categoryNames ?? [] }))
  };
}

// The categories page holds every one the unit keeps: it registers a handful, never past one page's most.
async function categories(): Promise<UnitCategory[]> {
  return (await researchFetch<{ items: UnitCategory[] }>("/categories?limit=200", undefined, READ)).items;
}

export async function readResearchState(): Promise<ResearchStateView> {
  const [state, held] = await Promise.all([researchFetch<UnitState>("/state", undefined, READ), categories()]);

  return stateOf(state, held);
}

// The state as the unit answers the change, with the categories read again for the state each now stands in.
export async function changeResearchState(change: ResearchStateChange): Promise<ResearchStateView> {
  const state = await researchFetch<UnitState>("/state", json("PATCH", change), STATE);

  return stateOf(state, await categories());
}

// A topic's fields read off a body, each of its own shape where it stands: null where one is of another shape.
function topicFieldsOf(fields: Record<string, unknown>): ResearchTopicChange | null {
  const change: ResearchTopicChange = {};

  for (const field of ["purpose", "instruction"] as const) {
    if (fields[field] === undefined) continue;
    if (typeof fields[field] !== "string" || fields[field].trim() === "") return null;

    change[field] = fields[field].trim();
  }

  if (fields.gatherMinutes !== undefined) {
    if (typeof fields.gatherMinutes !== "number" || !Number.isInteger(fields.gatherMinutes) || fields.gatherMinutes < 1) return null;

    change.gatherMinutes = fields.gatherMinutes;
  }

  if (fields.calendar === null) {
    change.calendar = null;
  } else if (fields.calendar !== undefined) {
    const calendar = calendarOf(fields.calendar);

    if (calendar === null) return null;

    change.calendar = calendar;
  }

  return change;
}

/** A topic registered, read off a body: its name, its purpose and its instruction, and what else it names. */
export function researchNewTopicOf(body: unknown): ResearchNewTopic | null {
  if (typeof body !== "object" || body === null) return null;

  const fields = body as Record<string, unknown>;
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  const rest = topicFieldsOf(fields);

  if (name === "" || rest === null || rest.purpose === undefined || rest.instruction === undefined || rest.calendar === null) return null;

  return { name, purpose: rest.purpose, instruction: rest.instruction, ...(rest.gatherMinutes === undefined ? {} : { gatherMinutes: rest.gatherMinutes }), ...(rest.calendar === undefined ? {} : { calendar: rest.calendar }) };
}

/** A topic's change, read off a body: at least one field the change takes. */
export function researchTopicChangeOf(body: unknown): ResearchTopicChange | null {
  if (typeof body !== "object" || body === null) return null;

  const change = topicFieldsOf(body as Record<string, unknown>);

  return change === null || Object.keys(change).length === 0 ? null : change;
}

// A topic's name as a path holds it: null for one that is no name.
export function researchTopicNameOf(value: string | undefined): string | null {
  const name = (value ?? "").trim();

  return name === "" ? null : name;
}

// The topic a call names must be a topic: the other shapes' categories are not this screen's to change.
async function topicNamed(name: string): Promise<void> {
  const held = await researchFetch<UnitCategory>(`/categories/${encodeURIComponent(name)}`, undefined, TOPIC_CHANGE);

  if (held.shape !== "topic") throw fail(404, wording("research.error.no_category"));
}

/** A topic registered with the unit, a category of the shape `topic`. */
export async function addResearchTopic(topic: ResearchNewTopic): Promise<void> {
  await researchFetch<UnitCategory>("/categories", json("POST", { ...topic, shape: "topic" }), TOPIC_ADD);
}

/** A topic changed, every field the change leaves out kept. */
export async function changeResearchTopic(name: string, change: ResearchTopicChange): Promise<void> {
  await topicNamed(name);
  await researchFetch<UnitCategory>(`/categories/${encodeURIComponent(name)}`, json("PATCH", change), TOPIC_CHANGE);
}

/** A topic taken away with its recipients. */
export async function removeResearchTopic(name: string): Promise<void> {
  await topicNamed(name);
  await researchFetch<null>(`/categories/${encodeURIComponent(name)}`, { method: "DELETE" }, TOPIC_CHANGE);
}

/** A state change the console sends, read off a body: a state of the two, and a category's name where it names one. */
export function researchStateChangeOf(body: unknown): ResearchStateChange | null {
  if (typeof body !== "object" || body === null) return null;

  const fields = body as Record<string, unknown>;

  if (fields.state !== "running" && fields.state !== "stopped") return null;
  if (fields.categoryName === undefined || fields.categoryName === null) return { state: fields.state };

  return typeof fields.categoryName === "string" && fields.categoryName !== "" ? { state: fields.state, categoryName: fields.categoryName } : null;
}

type UnitItem = ResearchItem & Record<string, unknown>;

// Where an item came from as the unit answers it; an item it answers with no origin stands as an ask where it was
// asked and as a scan's otherwise, its source unnamed.
function originOf(item: UnitItem): ResearchOrigin {
  const origin: Partial<ResearchOrigin> = item.origin ?? {};

  return {
    kind: origin.kind ?? (item.asked === true ? "asked" : "source"),
    source: origin.source ?? null,
    because: origin.because ?? null,
    itemId: origin.itemId ?? null,
    documentId: origin.documentId ?? null,
    title: origin.title ?? null,
    shareUrl: origin.shareUrl ?? null
  };
}

function itemOf(item: UnitItem): ResearchItem {
  return {
    id: item.id,
    categoryName: item.categoryName,
    name: item.name,
    maker: item.maker ?? null,
    address: item.address ?? null,
    kind: item.kind,
    shape: item.shape,
    asked: item.asked === true,
    origin: originOf(item),
    state: item.state,
    tries: item.tries,
    retryAt: item.retryAt ?? null,
    runId: item.runId ?? null,
    documentId: item.documentId ?? null,
    title: item.title ?? null,
    shareUrl: item.shareUrl ?? null,
    languages: item.languages ?? [],
    narrations: item.narrations ?? [],
    fit: item.fit === true,
    fitNodes: item.fitNodes ?? [],
    repairItemId: item.repairItemId ?? null,
    error: item.error ?? null,
    errorAt: item.errorAt ?? null,
    createdAt: item.createdAt,
    changedAt: item.changedAt
  };
}

/** How the queue is narrowed and paged: by a category, by states, past an item, at most so many. */
export interface ResearchQueueQuery {
  categoryName: string | null;
  states: string[];
  after: number | null;
  limit: number | null;
}

const ITEM_STATES = new Set(["waiting", "running", "reported", "fit", "stuck", "taken", "dismissed"]);
const QUEUE_LIMIT = 200;

const wholeOf = (value: unknown): number | null => (typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null);

/** A queue query read off the console's own query; a part that is not of its shape is no query at all. */
export function researchQueueQueryOf(query: Record<string, unknown>): ResearchQueueQuery | null {
  const categoryName = typeof query.categoryName === "string" && query.categoryName !== "" ? query.categoryName : null;
  const states = typeof query.state === "string" && query.state !== "" ? query.state.split(",") : [];
  const after = query.after === undefined ? null : wholeOf(query.after);
  const limit = query.limit === undefined ? null : wholeOf(query.limit);

  if (states.some((state) => !ITEM_STATES.has(state))) return null;
  if ((query.after !== undefined && after === null) || (query.limit !== undefined && (limit === null || limit < 1 || limit > QUEUE_LIMIT))) return null;

  return { categoryName, states, after, limit };
}

export async function readResearchQueue(query: ResearchQueueQuery): Promise<ResearchQueuePage> {
  const params = new URLSearchParams();

  if (query.categoryName !== null) params.set("categoryName", query.categoryName);
  if (query.states.length > 0) params.set("state", query.states.join(","));
  if (query.after !== null) params.set("after", String(query.after));
  if (query.limit !== null) params.set("limit", String(query.limit));

  const asked = params.size === 0 ? "" : `?${params.toString()}`;
  const page = await researchFetch<{ items: UnitItem[]; more: boolean }>(`/queue${asked}`, undefined, READ);

  return { items: page.items.map(itemOf), more: page.more === true };
}

// A number naming an item or a document: a whole number above zero.
const numberOf = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null);

/**
 * An ask the console sends, read off a body: a category, a name and an address, each a word; the words for why, where
 * they stand and are not blank; and the item or the document a follow-up follows from, each a number where it stands.
 */
export function researchAskOf(body: unknown): ResearchAsk | null {
  if (typeof body !== "object" || body === null) return null;

  const fields = body as Record<string, unknown>;
  const word = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
  const categoryName = word(fields.categoryName);
  const name = word(fields.name);
  const address = word(fields.address);

  if (categoryName === null || name === null || address === null) return null;

  const ask: ResearchAsk = { categoryName, name, address };

  if (fields.because !== undefined && fields.because !== null) {
    if (typeof fields.because !== "string") return null;

    const because = word(fields.because);

    if (because !== null) ask.because = because;
  }

  for (const [field, named] of [["followsItemId", fields.followsItemId], ["followsDocumentId", fields.followsDocumentId]] as const) {
    if (named === undefined || named === null) continue;

    const number = numberOf(named);

    if (number === null) return null;

    ask[field] = number;
  }

  return ask;
}

// A follow-up's refusals also speak of its parent: one the unit does not hold, did not take, or that has filed no
// document yet.
export async function askResearch(ask: ResearchAsk): Promise<ResearchItem> {
  const follows = ask.followsItemId !== undefined || ask.followsDocumentId !== undefined;

  return itemOf(await researchFetch<UnitItem>("/queue", json("POST", ask), follows ? FOLLOW : ASK));
}

/**
 * An item's change the console sends, read off a body naming exactly one: a dismissal, a stuck item asked again, or a
 * stuck item moved to the front. The console marks nothing taken, since that is the chat agent's to record.
 */
export function researchItemChangeOf(body: unknown): ResearchItemChange | null {
  if (typeof body !== "object" || body === null || Object.keys(body).length !== 1) return null;

  const fields = body as Record<string, unknown>;

  if (fields.state === "dismissed" || fields.state === "waiting") return { state: fields.state };

  return fields.front === true ? { front: true } : null;
}

// Each change's refusals say what was asked: an item no longer dismissed, or one no longer stuck.
function changeCodes(change: ResearchItemChange): Readonly<Record<string, string>> {
  if ("front" in change) return FRONT;

  return change.state === "waiting" ? REASK : DISMISS;
}

export async function changeResearchItem(itemId: number, change: ResearchItemChange): Promise<ResearchItem> {
  return itemOf(await researchFetch<UnitItem>(`/queue/${itemId}`, json("PATCH", change), changeCodes(change)));
}

type UnitRun = ResearchRunView & Record<string, unknown>;

function runOf(run: UnitRun): ResearchRunView {
  return {
    runId: run.runId,
    key: run.key,
    query: run.query,
    provider: run.provider,
    model: run.model,
    state: run.state,
    outcome: run.outcome ?? null,
    startedAt: run.startedAt,
    closesAt: run.closesAt ?? null,
    finishedAt: run.finishedAt ?? null,
    documentId: run.documentId ?? null,
    link: run.link ?? null,
    error: run.error ?? null,
    branches: run.branches ?? 0
  };
}

export async function readResearchRun(runId: number): Promise<ResearchRunDetail> {
  const [run, log] = await Promise.all([
    researchFetch<UnitRun>(`/research-runs/${runId}`, undefined, RUN),
    researchFetch<{ items: ResearchLogLine[] }>(`/research-runs/${runId}/log-lines`, undefined, RUN)
  ]);

  return { run: runOf(run), lines: log.items.map((line) => ({ id: line.id, at: line.at, kind: line.kind, text: line.text })) };
}

/** A whole number a path's segment names, or null where it names none. */
export function researchIdOf(segment: string | undefined): number | null {
  return wholeOf(segment);
}

type UnitSource = ResearchSource & Record<string, unknown>;

function sourceOf(source: UnitSource): ResearchSource {
  return {
    id: source.id,
    categoryName: source.categoryName,
    kind: source.kind,
    address: source.address,
    query: source.query ?? null,
    filter: { require: source.filter?.require ?? [], exclude: source.filter?.exclude ?? [] },
    everyMinutes: source.everyMinutes ?? null,
    limit: source.limit,
    failureCount: source.failureCount ?? 0,
    lastError: source.lastError ?? null,
    readAt: source.readAt ?? null,
    createdAt: source.createdAt,
    changedAt: source.changedAt
  };
}

// How many pages of sources one read walks at most: a deployment registers a few dozen.
const SOURCE_PAGES = 10;

/** Every registered source, by id, read page after page. */
export async function readResearchSources(): Promise<ResearchSource[]> {
  const sources: ResearchSource[] = [];
  let after: number | null = null;

  for (let page = 0; page < SOURCE_PAGES; page += 1) {
    const asked: string = after === null ? "/sources?limit=200" : `/sources?limit=200&after=${after}`;
    const answered: { items: UnitSource[]; more: boolean } = await researchFetch(asked, undefined, SOURCE_READ);

    sources.push(...answered.items.map(sourceOf));

    if (answered.more !== true || answered.items.length === 0) break;

    after = answered.items.at(-1)?.id ?? null;
  }

  return sources;
}

const wordOf = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
const countOf = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) ? value : null);

// A list of words, each a word; anything else is no list.
function wordsOf(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const words = value.map(wordOf);

  return words.every((word): word is string => word !== null) ? words : null;
}

function filterOf(value: unknown): ResearchFilter | null {
  if (typeof value !== "object" || value === null) return null;

  const fields = value as Record<string, unknown>;
  const required = wordsOf(fields.require ?? []);
  const excluded = wordsOf(fields.exclude ?? []);

  return required === null || excluded === null ? null : { require: required, exclude: excluded };
}

// The fields a source's change and its registration share, each of its own shape where it stands; null where one
// that stands is not.
function sourceFieldsOf(fields: Record<string, unknown>): ResearchSourceChange | null {
  const change: ResearchSourceChange = {};

  for (const name of ["address", "query"] as const) {
    if (fields[name] === undefined) continue;

    const word = wordOf(fields[name]);

    if (word === null) return null;

    change[name] = word;
  }

  for (const name of ["everyMinutes", "limit"] as const) {
    if (fields[name] === undefined) continue;

    const count = countOf(fields[name]);

    if (count === null) return null;

    change[name] = count;
  }

  if (fields.filter !== undefined) {
    const filter = filterOf(fields.filter);

    if (filter === null) return null;

    change.filter = filter;
  }

  return change;
}

/** A source to register, read off a body: a category, a kind and the fields of their shapes; anything else is none. */
export function researchNewSourceOf(body: unknown): ResearchNewSource | null {
  if (typeof body !== "object" || body === null) return null;

  const fields = body as Record<string, unknown>;
  const categoryName = wordOf(fields.categoryName);
  const kind = wordOf(fields.kind);
  const rest = sourceFieldsOf(fields);

  return categoryName === null || kind === null || rest === null ? null : { categoryName, kind, ...rest };
}

/** A source's change, read off a body: at least one field the change takes, each of its own shape. */
export function researchSourceChangeOf(body: unknown): ResearchSourceChange | null {
  if (typeof body !== "object" || body === null) return null;

  const fields = body as Record<string, unknown>;

  if (Object.keys(fields).some((name) => !["address", "query", "filter", "everyMinutes", "limit"].includes(name))) return null;

  const change = sourceFieldsOf(fields);

  return change === null || Object.keys(change).length === 0 ? null : change;
}

export async function addResearchSource(source: ResearchNewSource): Promise<ResearchSource> {
  return sourceOf(await researchFetch<UnitSource>("/sources", json("POST", source), SOURCE_ADD));
}

export async function changeResearchSource(sourceId: number, change: ResearchSourceChange): Promise<ResearchSource> {
  return sourceOf(await researchFetch<UnitSource>(`/sources/${sourceId}`, json("PATCH", change), SOURCE_CHANGE));
}

export async function removeResearchSource(sourceId: number): Promise<void> {
  await researchFetch<null>(`/sources/${sourceId}`, { method: "DELETE" }, SOURCE_CHANGE);
}
