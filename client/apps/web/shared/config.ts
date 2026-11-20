import { chatAgent } from "./agent-names";

import type { AgentProviderName, JobQuestion, QuestionSettler } from "./types";
import type { Translate } from "./wording";

export interface PagingLimits {
  defaultSize: number;
  maxSize: number;
}

export const PAGING: PagingLimits = { defaultSize: 30, maxSize: 500 };

// The most answers one read of round figures names; a room asking about more asks again for the rest.
export const ROUND_FIGURES_AT_ONCE = 100;

// How often a screen reads again on its own. The live stream carries the news as it happens;
// this clock is what a screen falls back to for as long as the stream is down.
export const POLL_INTERVAL_MS = 10_000;

// How long the live stream waits before its first try to open again after it dropped. A bot
// restart is over in one to three seconds, so the first try comes about when the bot is back.
export const EVENT_FIRST_RETRY_MS = 1_000;

// How much longer each try after the first waits than the one before it, so a bot that stays
// down is asked less and less often.
export const EVENT_RETRY_MS = 5_000;

// How long a break the bot announced reads as a restart before it reads as a break after all. A
// deployment waits ninety seconds for the new bot to answer, and systemd as long for the old one
// to stop, so a restart that has not spoken by then is not coming back on its own.
export const RESTART_GRACE_MS = 120_000;

// How often this app writes a keepalive frame on every stream it relays. The server this app
// runs on drops a request that says nothing for ten seconds, so this is well inside that.
export const STREAM_KEEPALIVE_MS = 5_000;

// How long a page hears nothing at all on its stream before it takes the stream for lost. Four
// keepalives missed in a row is not a slow line; it is a connection that died without closing.
export const STREAM_SILENCE_MS = STREAM_KEEPALIVE_MS * 4;


// How many of the last runs are read for each agent. It is a glance at
// what has just happened, not a log.
export const STATUS_HISTORY_LIMIT = 10;

// Whether a room's name already names that room's chat agent. The owner's own room does, since it is
// the session itself rather than a room the session sits in, and so does a title that carries the
// agent's label of its own. Every other room's session is that room's name with the label after it.
export function namesChatAgent(title: string): boolean {
  const { label } = chatAgent();

  return label !== "" && (title === label || title.endsWith(label));
}

// What one room reads as: the owner's own private chat, which carries no title of its own, by the
// chat agent's label; any other room by the title the receiver recorded for it; and a chat with no
// title by its own number, which is all there is left to say about it.
export function roomLabel(chatId: number, title: string | null, ownerChatId: number | null): string {
  if (ownerChatId !== null && chatId === ownerChatId && chatAgent().label !== "") {
    return chatAgent().label;
  }

  return title === null || title.trim() === "" ? String(chatId) : title;
}

// What the cache siren screen says when the watch itself is not answering. It is its own
// service, so the console reads without it and says only that it is not there.
export const SIREN_UNREACHABLE = "siren.error.unreachable";

// How often the cache siren screen asks the watch again. It is a read of a local process, and
// nothing is held open between the asks.
// How long an approval remark may be: a remark or a question, not a document. The box holds the owner
// to it and the route refuses anything past it.
export const NOTE_LIMIT = 2_000;

// The longest `model` label an item is given from the console: a provider, a slash and a model id.
export const MODEL_LABEL_LIMIT = 200;

export const SIREN_POLL_MS = 5_000;

// One kind of news the console may ring the owner's own device about. Each kind names for itself
// the keys of what the account screen calls it and of what its switch's note says, and whether a
// device that has just subscribed hears it; what rings it is that kind's owner on the server —
// the plugin reading the bot's stream for the queue's news and the rooms' words, the mail watcher
// for mail. The kinds differ because the owner acts on each differently: a question stops a job dead and
// runs out in a minute, a room message is an agent speaking where they may not be looking, and mail is
// someone outside writing in. Each is theirs to switch off on one device alone. A job's end is no kind:
// its report reaches them only as the chat agent's own answer in their room, which rings as a room message
// (docs/web.md, 「Notifications」).
export interface PushKindDefinition {
  id: string;
  label: string;
  note: string;
  onForNewDevice: boolean;
}

export const QUESTION_PUSH = {
  id: "question",
  label: "push.label.question",
  note: "push.message.question",
  onForNewDevice: true
} as const satisfies PushKindDefinition;

export const ROOM_PUSH = {
  id: "room",
  label: "push.label.room",
  note: "push.message.room",
  onForNewDevice: true
} as const satisfies PushKindDefinition;

export const MAIL_PUSH = {
  id: "mail",
  label: "push.label.mail",
  note: "push.message.mail",
  onForNewDevice: true
} as const satisfies PushKindDefinition;

// Every kind there is, in the order the account screen lists them.
export const PUSH_KIND_LIST = [QUESTION_PUSH, ROOM_PUSH, MAIL_PUSH] as const;

export type PushKind = (typeof PUSH_KIND_LIST)[number]["id"];

export function isPushKind(value: unknown): value is PushKind {
  return PUSH_KIND_LIST.some((kind) => kind.id === value);
}

// What a device that has just subscribed hears.
export function newDevicePushKinds(): PushKind[] {
  return PUSH_KIND_LIST.filter((kind) => kind.onForNewDevice).map((kind) => kind.id);
}

// How often an open tab tells the server which room it shows, hidden or not, and how long the
// server takes one that has said nothing for as still standing there (docs/web.md, 「Notifications」).
// A tab is hidden or closed without a word as often as with one — a phone locked, a browser killed —
// so a report is only good for a few of its own intervals.
export const WATCH_REPORT_MS = 30_000;
export const WATCH_STALE_MS = 3 * WATCH_REPORT_MS;

// How often a room's box tells the receiver again that its reader is still writing, while they go on typing: well
// inside the base's six seconds a mark stands for (docs/web.md, 「Presence and typing」).
export const TYPING_RENEW_MS = 4_000;

// How often an open stream of a reader of some rooms reads those rooms again (docs/web.md, 「Access」). A room the
// reader's account is let into, leaves or is taken out of through the console reaches the stream at once; this is for
// what changes elsewhere, such as a private room standing as the account's own BMO is made.
export const ROOM_REACH_REFRESH_MS = 60_000;

// How much of a line one notification carries. A notification is a nudge to open the console,
// not the thing itself, and a body longer than this is cut short on every platform anyway.
export const PUSH_BODY_LIMIT = 160;

// What the console says where push cannot work at all: no keys on this machine, or a browser
// that has no push of its own.
export const PUSH_UNCONFIGURED = "push.error.unconfigured";
export const PUSH_UNSUPPORTED = "push.error.unsupported";
export const PUSH_DENIED = "push.error.denied";
export const PUSH_NO_WORKER = "push.error.no_worker";

// How long a login the reader asked to keep stands with no visit. It is counted from the last
// request that carried the session, not from the login, so a console in use stays logged in and
// one left unopened this long asks for the password again. A kept login is a cookie sitting on a
// machine and the console is reachable from outside this house, so it is given an end rather than
// left standing for ever; without the switch the cookie is the browser's own session and is gone
// when the browser closes.
export const REMEMBER_LOGIN_DAYS = 7;
export const REMEMBER_LOGIN_SECONDS = REMEMBER_LOGIN_DAYS * 24 * 60 * 60;

// How long a login the reader did not ask to keep stands at most, counted from the login. Its cookie is
// the browser's own session and goes when the browser closes; the seal inside it ends here all the same,
// so a copy of the cookie lifted off a browser left open opens nothing past it.
export const BROWSER_LOGIN_HOURS = 12;
export const BROWSER_LOGIN_SECONDS = BROWSER_LOGIN_HOURS * 60 * 60;

// How many finished items come over at a time. The queue and the requests waiting on them are
// their working set and come whole — a queue with rows missing could not be dragged into order —
// but the finished ones only grow, so the panel takes them a page at a time and asks for the
// next page as they reach the end of what they have.
export const DONE_PAGE_SIZE = 20;

// The most finished items one read will carry, however far down they have scrolled. It is far past
// what this table holds; what it is there for is that a number in an address is a number anybody
// may type.
export const DONE_MAX = 500;

// How long the board keeps what it read of an item's reports while the item is unchanged. bmo-job's rows count no
// reports, so each listed item's are a read of their own, and a report appended moves nothing on the item; a
// minute bounds how late a new report reaches a row's mark (docs/boundary.md, 「Gaps the console meets」).
export const TODO_REPORTS_FRESH_MS = 60_000;

// How close behind its unfinished note a closing job's account is written. bmo-job's `todo --done` writes both in
// one call, the note first, so an unlabelled held report, one written before bmo-job labelled the note, followed this
// soon by its writer's final one is that note; a hold's reason has no final report written with it (docs/web.md, the
// TODO panel's section).
export const UNFINISHED_PAIR_MS = 10_000;

// How long after it ended a summary the tab hears of late still stands in the player waiting for a press; one older
// still is left to its line, so a stream handing back what it kept does not queue the day's briefings.
export const BRIEFING_SHOWN_MS = 30 * 60_000;

// How long the words they are searching for may be. It is a phrase to find a row by, not a
// document, and the route refuses more.
export const TODO_SEARCH_LIMIT = 200;

// What a screen says of the bot's control API: one line while it is still being asked, which a busy
// bot is, another once nothing took the call, and nothing once it has answered. Not having heard yet is
// not a failure and a busy bot is not a gone one, so the first is calm and only the second wears the
// error colour. The archive still reads either way, so these stand where the bot's part of the screen
// stands rather than over the whole view.
export const CONTROL_CHECKING = "control.status.checking";
export const CONTROL_UNREACHABLE = "control.error.unreachable";

// What the prompt says when the bot is there but the owner's reader account is not.
export const READER_DISCONNECTED = "control.error.reader_disconnected";

// A model run is not a Telegram message. Keep the control request bounded without imposing any
// message length on jobs, searches and gate probes.
export const MAX_RUN_PROMPT_LENGTH = 1_000_000;

// What the owner may send into a room at once, words or the words beside a file. A Telegram
// message holds far less, and the bot divides what does not fit into consecutive messages, so
// this only keeps one request bounded.
export const MAX_SAY_TEXT_LENGTH = 100_000;

// What one Telegram message and one caption hold. Words past the first go as a message of their
// own and past the second go ahead of the file, so the console knows the room's copy by them.
export const TELEGRAM_MESSAGE_LENGTH = 4096;
export const TELEGRAM_CAPTION_LENGTH = 1024;

// A paste this long is text to hand over rather than to edit, so it stands in the prompt's tray
// as one entry instead of filling the box.
export const PASTE_ENTRY_CHARS = 2_000;

// How many files one word said to a worker may carry, and how large one may be: the agency's own bound on a word
// (its `policy/worker-words.toml`), which it serves on no route, so the worker's box and the word's route hold a file
// to it before anything is sent. A room's box holds no limit of the console's own (docs/web.md, the room screen's
// input box).
export const WORKER_WORD_FILES = 10;
export const WORKER_WORD_FILE_BYTES = 8 * 1024 * 1024;

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

// The bot's own names for the agents that stand whether it answers or not. The gates to test are
// GATE_STAGES; these are the rest, and together with a chat session's own name they are every
// name an agent log is kept under.
export const RUNNER_AGENTS = ["search", "browse"] as const;
export const EDITOR_AGENTS = ["digest", "people-digest"] as const;
export const WORKER_AGENT = "worker";

export type RunnerAgent = (typeof RUNNER_AGENTS)[number];
export type EditorAgent = (typeof EDITOR_AGENTS)[number];

// A chat session keeps its log under the room it serves, and a chat number may be negative.
const CHAT_AGENT_NAME = /^chat:-?\d+$/;

// A worker the owner added is an agent name too, and its shape is what says so: the catalogue
// is the archive's, so this app cannot hold a list of the names that exist. Every fixed agent's
// name is of that shape as well, which is why one pattern answers for all of them.
const PLAIN_AGENT_NAME = /^[a-z0-9][a-z0-9._-]{1,31}$/;

export function isAgentName(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  return PLAIN_AGENT_NAME.test(value) || CHAT_AGENT_NAME.test(value);
}

// The three the console can launch on the owner's own words: the two runners and the worker.
export const LAUNCH_AGENTS = [...RUNNER_AGENTS, WORKER_AGENT] as const;

export type LaunchAgent = (typeof LAUNCH_AGENTS)[number];

export function isLaunchAgent(value: unknown): value is LaunchAgent {
  return typeof value === "string" && (LAUNCH_AGENTS as readonly string[]).includes(value);
}

// How deep a search runs, under the names the launcher uses.
export const SEARCH_DEPTHS = ["basic", "thorough", "exhaustive"] as const;

export type SearchDepth = (typeof SEARCH_DEPTHS)[number];

export function isSearchDepth(value: unknown): value is SearchDepth {
  return typeof value === "string" && (SEARCH_DEPTHS as readonly string[]).includes(value);
}

// Jobs accept execution-time automatic selection or an explicit provider/model.
export const JOB_MODELS = [
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001"
] as const;

export type JobModel = "auto" | (typeof JOB_MODELS)[number] | `${AgentProviderName}::${string}`;

// What the console says when the queue moved while somebody was dragging a row. The bot refuses
// an order that is no longer its queue rather than writing a stale one over it.
export const QUEUE_MOVED = "todo.error.queue_moved";

// How long the line that resolves an open matter may be: what makes it no longer outstanding, in a
// sentence or two. The open matter itself stays on the row whole, so the story does not go here.
export const RESOLUTION_LIMIT = 500;

// How long the line raising a row out of an open matter may be, and its title. The line says what the
// piece of work is; the open matter it came out of rides on the row whole, so the line is a sentence or
// two rather than the story.
export const RAISE_TITLE_LIMIT = 200;

// How long a group room's name may be, as a person names it when they open it in the console.
export const ROOM_TITLE_LIMIT = 100;
export const RAISE_LIMIT = 2_000;

// What the console says when setting one aside, or taking it back, is refused. A finished item
// has nothing to defer; a row that is not set aside has nothing to take back.
export const CANNOT_HOLD = "todo.error.cannot_hold";
export const NOT_HELD = "todo.error.not_held";

// What the console says when closing an item himself is refused: one already finished, one a job
// still runs for, and one wound down or stopped, which is work they mean to have resumed.
export const CANNOT_FINISH = "todo.error.cannot_finish";

// How long the line saying why an item is set aside may be. It is required, as bmo-job requires it, and it is a
// phrase; the same bound holds the reason an item's job notices are switched off for.
export const HOLD_REASON_LIMIT = 500;
export const HOLD_REASON_NEEDED = "todo.error.hold_reason_needed";
export const NOTICES_REASON_LIMIT = HOLD_REASON_LIMIT;
export const NOTICES_REASON_NEEDED = "todo.error.notices_reason_needed";

// How long the reason for stopping an item's running work may be. It is required: a stop cuts work in
// flight, and the reason is what the item carries until it is taken up again.
export const STOP_REASON_LIMIT = 2_000;
export const STOP_REASON_NEEDED = "todo.error.stop_reason_needed";

// What the console says when the bot refused to raise a row. An open matter is what such a row comes out
// of, so an item that left none has nothing to raise one from.
export const NOTHING_TO_RAISE = "todo.error.nothing_to_raise";

// What the console says when the bot refused to resolve an open matter. The row either left none or has
// been resolved already, and neither is written over.
export const UNFINISHED_NOT_OPEN = "todo.error.unfinished_not_open";

// How long an answer written in words may be. The options are phrases and this is a sentence or
// two in their place, not a document; the box holds them to it and the route refuses more.
export const ANSWER_LIMIT = 2_000;

// How long one turn of the talk about an item may be. It is a thing said in a narrow panel, not
// a document; the box holds them to it and the route refuses more.
export const TALK_LIMIT = 2_000;

// The document viewer: how many matches a search of the documents returns, how long a question
// asked of them may be, and how much of a selected passage a talk turn carries.
export const DOCUMENT_SEARCH_LIMIT = 100;
export const DOCUMENT_QUESTION_LIMIT = 500;
export const DOCUMENT_PASSAGE_LIMIT = 4_000;

// The width at and below which the document viewer's list, document and table of contents stand one
// at a time behind tabs, and the split view is not offered: two panes of text on a phone are two
// panes nobody can read.
export const DOCUMENT_VIEW = {
  tabsMaxPx: 1023,
  // How many documents stand open as tabs; past it the one looked at longest ago is closed.
  openTabsMax: 10
} as const;

// How long one lot of words added to an item may be. It is the next condition of a piece of work
// — a paragraph at most — and the job reads it beside the instruction, so a document here would
// stand where the instruction is meant to be read.
export const APPEND_LIMIT = 2_000;

// What the console says when the bot refused to add words to an item. A finished item is one
// nobody is working on and nobody will be handed anything for, so what is added to it reaches
// nobody; taking it back off done is what makes the words work again.
export const CANNOT_APPEND = "todo.error.cannot_append";

// What the console says when the bot refused to take words back. The row is marked rather than
// deleted, so the one thing that cannot happen is taking back the same words twice — which is what
// a screen reading a list from before somebody else's press is asking for.
export const CANNOT_UNAPPEND = "todo.error.cannot_unappend";

// The one line a question's answer comes down to: the words the owner wrote where they wrote any,
// and the text of the option it settled on otherwise. The job reads exactly this.
export function questionAnswerText(question: JobQuestion): string {
  return question.answer ?? question.options[question.chosen ?? question.recommended ?? -1] ?? "";
}

// What the console says to an answer that arrived after the question was already settled. The
// first settlement stands, so this says what it was settled on rather than pretending to write.
export function questionSettledNotice(t: Translate, by: QuestionSettler | null, answer: string): string {
  return by === "recommendation"
    ? t("question.error.settled_by_recommendation", { answer })
    : t("question.error.settled_elsewhere", { answer });
}

// How many lines of an agent's log one page carries, and how often the screen asks the
// archive for what came after the last line it has. It asks the archive, not the bot.
export const AGENT_LOG_PAGE_SIZE = 200;
// How many of the newest lines an agent's log opens on at its end: enough to fill the screen, so it is laid out
// and stood at its end at once, the rest read a page at a time as the reader scrolls up.
export const AGENT_LOG_OPENING_SIZE = 50;
// How many lines of an agent's log one read of a run's newest lines, or of the page before a line of the run, looks
// through for that run's own before it answers with what it found and says the rest waits above.
export const AGENT_LOG_RUN_SCAN = 2_000;
export const AGENT_LOG_POLL_MS = 2_000;

// How much of the list of searches one read carries, and the most one read may ever carry however
// far the address asks for. The list grows only at the head, so it is read a page at a time and
// the next page comes as the foot of it is reached.
export const SEARCHES_PAGE_SIZE = 30;
export const SEARCHES_MAX = 200;

// How long the phrase the list of searches is searched by may be. It is a phrase to find a document
// by, and the route reads no more of it.
export const SEARCHES_PHRASE_LIMIT = 200;

// How much of a row's one-line text stands before a hit in a searched list, so the hit is still in
// view where a phone cuts the line short.
export const SEARCHES_HIT_LEAD = 8;

// What a document of the Archive is called: its headline, and its question where it wrote none. Both the
// console's screens and the server naming a document for a share page read it here, since a
// document with two names would be a document nobody could point at.
export function searchTitle(search: { title: string | null; query: string }): string {
  return search.title ?? search.query;
}

// The word for a link that does not end, wherever one is named or its remaining life is read.
export const FOREVER_LABEL = "common.label.forever";

// How long a document's share link may live. One span runs out of nothing at all: a link
// the owner means to hand out and leave standing has no end, and is ended by being taken away.
//
// That endlessness is carried as the absence of a span rather than as a span long enough to pass
// for one. A time set far off is a time, and everything downstream — the row, the answer, the
// chip counting down — would go on treating it as one and quietly say the wrong thing about a
// link that was never meant to end.
//
// This list is the one place a span is written. A request names a key out of it and the server
// works out the expiry itself, so a caller never hands over a time of its own and the screen and
// the server can never come to mean different things by one choice. The spans are seconds, as
// every time this console stores is.
export const SHARE_SPANS = [
  { key: "1h", label: "common.label.span_1h", seconds: 60 * 60 },
  { key: "6h", label: "common.label.span_6h", seconds: 6 * 60 * 60 },
  { key: "24h", label: "common.label.span_24h", seconds: 24 * 60 * 60 },
  { key: "7d", label: "common.label.span_7d", seconds: 7 * 24 * 60 * 60 },
  { key: "30d", label: "common.label.span_30d", seconds: 30 * 24 * 60 * 60 },
  { key: "forever", label: FOREVER_LABEL, seconds: null }
] as const;

export type ShareSpanKey = (typeof SHARE_SPANS)[number]["key"];

export function isShareSpanKey(value: unknown): value is ShareSpanKey {
  return SHARE_SPANS.some((span) => span.key === value);
}

// How long the named span lasts, and null where it does not end. The fallback is named rather
// than reached by ??, which would read an endless span as a missing one and hand back an hour.
export function shareSpanSeconds(key: ShareSpanKey): number | null {
  const span = SHARE_SPANS.find((one) => one.key === key);

  return span === undefined ? SHARE_SPANS[0].seconds : span.seconds;
}

// The same two for the siren's feed. The watch keeps a ring of the last few hundred requests and
// hands back the newest of them; asking for more is how a reader reaches further back, so a page
// here is a bigger ask rather than a cursor. The ceiling is the ring the watch itself keeps —
// past it there is nothing left to ask for.
export const SIREN_PAGE_SIZE = 60;
export const SIREN_MAX = 600;

// The road a kept file goes down, and what it lets the file be: the sound and the video a row
// plays, the picture it previews, the file it hands over to keep. It goes out behind the
// console's login, in the console's own origin, and nothing on it is ever allowed to be code.
export const KEPT_FILE_ISOLATION = {
  policy: [
    "default-src 'none'",
    "script-src 'none'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' data:",
    "font-src 'self' data:",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'"
  ].join("; "),
  referrerPolicy: "no-referrer"
} as const;

// The road a kept HTML page goes down, which is the same road as every kept file: the page opens as
// a page, with its own scripts, but in a sandbox that gives it an origin of its own — no cookie, no
// storage and no request of the console's is its — and with nowhere to send anything. It loads the
// pictures, styles, fonts and scripts it is drawn with, from inside itself or over https, and
// nothing it runs can reach the console it was opened from. The console alone may frame it, which
// is how a page document stands on its own screen.
//
// The sandbox is one list of permissions, which the policy carries and which the console's own frame
// gives the page it stands; neither grants the same origin, so the frame adds nothing the page
// served alone would not have.
export const HOSTED_PAGE_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

export const HOSTED_PAGE_ISOLATION = {
  policy: [
    `sandbox ${HOSTED_PAGE_SANDBOX}`,
    "default-src 'none'",
    "script-src 'unsafe-inline' https:",
    "style-src 'unsafe-inline' data: https:",
    "img-src data: blob: https:",
    "media-src data: blob: https:",
    "font-src data: https:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'"
  ].join("; "),
  referrerPolicy: "no-referrer"
} as const;

// What the DB screen holds itself to. One page of a table, the most rows a typed query is
// allowed to answer with, how much of a long value the list carries, and how much the one-row view
// carries.
export const DB_VIEW = {
  pageSize: 50,
  rowCap: 500,
  cellCap: 400,
  fullCellCap: 200_000
} as const;

// What a value stands as when the column it came from is one this console does not put on a
// screen. The row is still shown and the column still stands in its place: what is withheld is
// the value alone, and it says so.
export const DB_MASKED_TEXT = "db.label.masked";

// What the code review holds itself to (the review unit's `docs/code-review.md`). How much of a file the viewer
// carries before it says the rest was cut, how far into a file it looks for a NUL before calling it
// binary, how many entries of one commit's tree come over at once, how many commits the picker
// offers, what one content search may return, how much of a matched line
// is shown, how many lines a line review may span and how much of them it keeps, how many files
// stand open as tabs, and the width at and below which the three parts become tabs.
export const CODE_VIEW = {
  fileCap: 1_000_000,
  binaryProbe: 8_000,
  treeCap: 50_000,
  commitCap: 100,
  searchQueryMax: 200,
  searchPerFile: 5,
  searchTotal: 200,
  // Two numbers stand for one file because the search deliberately over-matches: an expression
  // holding every language's shapes finds, in a file of one of them, lines another language would
  // have declared something on — a bare call at the head of a line is a shell function's own shape
  // — and those are dropped by the file's own language afterwards. So the lines read from a file
  // are the larger number and the definitions kept out of them the smaller one, or five lines that
  // declare nothing would stand in for the five declarations under them.
  definitionScanPerFile: 40,
  definitionPerFile: 5,
  definitionTotal: 50,
  matchLineMax: 300,
  reviewExcerptMax: 20_000,
  openTabsMax: 10,
  tabsMaxPx: 1023
} as const;

// How long a code review's title, its "what to do" and its conclusion may be when a row is filed
// out of it.
export const CODE_REVIEW_TITLE_LIMIT = 200;
export const CODE_REVIEW_TODO_LIMIT = 8_000;
export const CODE_REVIEW_CONCLUSION_LIMIT = 4_000;

// How the remote desktop is drawn (the remote unit's docs/remote.md, 「Connection settings」): the quality the owner
// picks, which the relay turns into the RDP performance flags it asks for.
export const REMOTE_DESKTOP_QUALITIES = ["fast", "balanced", "sharp"] as const;

export type RemoteDesktopQuality = (typeof REMOTE_DESKTOP_QUALITIES)[number];

export function isRemoteDesktopQuality(value: unknown): value is RemoteDesktopQuality {
  return typeof value === "string" && (REMOTE_DESKTOP_QUALITIES as readonly string[]).includes(value);
}
