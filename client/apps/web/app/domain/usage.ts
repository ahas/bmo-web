import { COUNT_LOCALE, countText } from "./numbers";
import { agentProviderNames } from "#shared/types";

import type { ActiveUsage, AgentMode, AgentTokenUsage, HeadlineWindow, TokenSplit, UsageBalance, UsageTally, UsageView } from "#shared/types";
import type { BarColor } from "bmo-ui/app/domain/bars";
import type { Translate } from "#shared/wording";

// What the accounts' usage reads as on screen. The figures themselves are the agency's; this is only how they are
// named, coloured and shortened, and which of them stand together.

// The account names its own windows. These are the ones this console has words for; any other
// window it reports stands under the name it came with rather than disappearing.
const WINDOW_LABELS: Record<string, string> = {
  five_hour: "usage.label.window_session",
  seven_day: "usage.label.window_weekly",
  seven_day_overage_included: "usage.label.window_weekly_overage",
};

function durationLabel(t: Translate, window: string | HeadlineWindow): string {
  const name = typeof window === "string" ? window : window.name;
  const known = WINDOW_LABELS[name];

  if (known !== undefined) {
    return t(known);
  }

  if (typeof window !== "string") {
    if (window.durationMinutes === 5 * 60) {
      return t("usage.label.window_session");
    }

    if (window.durationMinutes === 7 * 24 * 60) {
      return t("usage.label.window_weekly");
    }
  }

  return name.endsWith(":primary")
    ? t("usage.label.window_primary")
    : name.endsWith(":secondary")
      ? t("usage.label.window_secondary")
      : name;
}

export function windowLabel(t: Translate, window: string | HeadlineWindow): string {
  const label = durationLabel(t, window);
  return typeof window !== "string" && window.limitName ? t("usage.label.window_limit", { limit: window.limitName, label }) : label;
}

export const USAGE_REFRESH_MS = 60_000;

// Provider storage and rest policy use consumed fractions. Only the display reverses them.
export function remainingPercent(consumed: number): number {
  return Math.round(Math.max(0, Math.min(1, 1 - consumed)) * 1000) / 10;
}

// Tokens as a person reads them: thousands and millions, since one request is anywhere from a
// few hundred to a few million. A month of a busy room runs to thousands of millions, and those
// carry the thousands mark like any other figure.
export function tokenText(tokens: number): string {
  if (tokens < 1000) {
    return String(tokens);
  }

  if (tokens < 1_000_000) {
    return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}K`;
  }

  return `${(tokens / 1_000_000).toLocaleString(COUNT_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
}

// A window's share as a person reads it. The account gives a fraction; a percent with one
// decimal is what a number this small is worth on a title bar.
export function sharePercent(window: HeadlineWindow | null): number | null {
  return window === null ? null : remainingPercent(window.utilization);
}

export function shareText(window: HeadlineWindow | null): string {
  const percent = sharePercent(window);

  return percent === null ? "—" : `${percent}%`;
}

// How loudly a figure reads: quiet, worth a glance, or worth stopping at.
export type UsageTone = "muted" | "warning" | "error";

// How loudly a window reads. The bot rests at 95% of the five hours, so red starts where the
// rest does and yellow stands well before it.
export function shareTone(window: HeadlineWindow | null): UsageTone {
  const percent = sharePercent(window);
  if (percent === null) return "muted";

  if (percent <= 10) {
    return "error";
  }

  return percent <= 40 ? "warning" : "muted";
}

// How the meters read when they stand as one mark rather than as their figures. On a narrow
// bar there is no room for the numbers and an icon stands in for all of them, so the icon takes
// the loudest news any of the windows has: a share standing at red says red on the icon, and
// nothing is quietly hidden by the folding.
export function loudestTone(windows: readonly (HeadlineWindow | null)[]): UsageTone {
  const tones = windows.map((window) => shareTone(window));

  if (tones.includes("error")) {
    return "error";
  }

  return tones.includes("warning") ? "warning" : "muted";
}

// The provider a slot is on, where it is one this console has a name for; any other stands under the agency's
// label for it.
export function knownMode(provider: string): AgentMode | null {
  return (agentProviderNames as readonly string[]).includes(provider) ? (provider as AgentMode) : null;
}

// One group of the panel: whose figures they are — the provider, and the account's name where the slot is one
// account of several — whether the chat runs on it now, and its own windows, session first. A group with no
// window stated holds none, and says so rather than standing a figure.
export interface UsageGroup {
  id: string;
  provider: string;
  label: string;
  name: string | null;
  inUse: boolean;
  windows: HeadlineWindow[];
  balance: UsageBalance | null;
}

function windowsOf(slot: { session: HeadlineWindow | null; week: HeadlineWindow | null }): HeadlineWindow[] {
  return [slot.session, slot.week].filter((window): window is HeadlineWindow => window !== null);
}

// Every registered account as a group of its own, in the agency's order, each with its own windows. Where the chat
// runs on a provider that holds no login, that slot is a group of its own ahead of them, marked as the one in use;
// and each provider's own road that keeps a balance stands after them, under the provider's label.
export function usageGroups(view: UsageView): UsageGroup[] {
  const active = view.active;
  const slot: UsageGroup[] =
    active === null || active.account !== null
      ? []
      : [{ id: `slot:${active.provider}`, provider: active.provider, label: active.label, name: null, inUse: true, windows: windowsOf(active), balance: active.balance }];

  return [
    ...slot,
    ...view.accounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      label: account.label,
      name: account.name,
      inUse: account.inUse,
      windows: windowsOf(account),
      balance: account.balance
    })),
    ...view.roads.map((road) => ({ id: `road:${road.provider}`, provider: road.provider, label: road.label, name: null, inUse: false, windows: [], balance: road.balance }))
  ];
}

// The pack's words for what a request allowance covers, by the agency's word for it; an allowance of a scope the
// pack has no word for, or of none, is told as the day's requests.
const REQUEST_SCOPES: Readonly<Record<string, string>> = { "free-models": "usage.label.requests_free_models" };

/** What a balance's request allowance is called on the panel. */
export function requestsLabel(t: Translate, requests: NonNullable<UsageBalance["requests"]>): string {
  return t((requests.scope !== null ? REQUEST_SCOPES[requests.scope] : undefined) ?? "usage.label.requests_day");
}

/** How many requests an allowance has left of its ceiling, as the panel says it. */
export function requestsText(t: Translate, requests: NonNullable<UsageBalance["requests"]>): string {
  return t("usage.label.requests_left", { left: countText(requests.left), limit: countText(requests.limit) });
}

// A window's figure as it stands now: the window itself while its reset is still ahead, and nothing
// once the reset has passed. Past its reset the account is in a new window whose figure has not
// been read yet, and the old figure says nothing about it. A window not found is none.
export function liveWindow<T extends HeadlineWindow>(window: T | null | undefined, now: number): T | null {
  return window === null || window === undefined ? null : window.resetsAt === null || window.resetsAt > now ? window : null;
}

// What names the slot's login on the title bar, where the provider holds more than one to tell apart. With a single
// login there is nothing to distinguish and the title says nothing about it, and a provider that holds none has no
// login to name.
export function titleAccountLabel(active: ActiveUsage | null): string | null {
  return active === null || active.logins < 2 ? null : active.accountName;
}

// The two figures the title bar shows: the slot's session and weekly windows, as the agency picked them out of the
// provider's own vocabulary. A slot that reports none has none, and with no slot there is none.
export function titleWindows(active: ActiveUsage | null): [HeadlineWindow | null, HeadlineWindow | null] {
  return active === null ? [null, null] : [active.session, active.week];
}

// Whether the slot is on a provider with no limit to show: no login and no window. Its title is its name and the
// one dash, rather than two windows the provider does not have.
/** A balance in its own currency, written as the locale writes money. */
export function moneyText(balance: UsageBalance): string {
  try {
    return new Intl.NumberFormat(COUNT_LOCALE, { style: "currency", currency: balance.currency }).format(balance.amount);
  } catch {
    // A currency the runtime does not know stands as its code after the amount.
    return `${new Intl.NumberFormat(COUNT_LOCALE, { maximumFractionDigits: 2 }).format(balance.amount)} ${balance.currency}`;
  }
}

export function limitless(active: ActiveUsage | null): boolean {
  return active !== null && active.account === null && active.session === null && active.week === null;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A length of time in the words a person uses for one: days and hours while there is more than
// a day of it, hours and minutes below that, minutes alone under the hour, and one word for what
// is about to happen. Two units are as far as it goes — the third would be noise at the scale
// the first two are already saying — and the second is dropped when it is nought, so a day and
// no hours reads as a day.
//
// Seconds are never shown. A figure that changes every second is read as flicker rather than as
// news, and it drags the line it stands on about as it changes width.
export function untilText(t: Translate, seconds: number): string {
  if (seconds < MINUTE) {
    return t("usage.label.until_soon");
  }

  if (seconds < HOUR) {
    return t("usage.label.until_minutes", { m: Math.floor(seconds / MINUTE) });
  }

  if (seconds < DAY) {
    const hours = Math.floor(seconds / HOUR);
    const minutes = Math.floor((seconds % HOUR) / MINUTE);

    return minutes === 0 ? t("usage.label.until_hours", { h: hours }) : t("usage.label.until_hours_minutes", { h: hours, m: minutes });
  }

  const days = Math.floor(seconds / DAY);
  const hours = Math.floor((seconds % DAY) / HOUR);

  return hours === 0 ? t("usage.label.until_days", { d: days }) : t("usage.label.until_days_hours", { d: days, h: hours });
}

// When the window starts over, as how long is left of it. A clock face is the account's own way
// of saying it, but what is wanted from it is how long there is, and reading that off a clock is
// arithmetic the reader should not be made to do. A window with no reset says nothing at all.
//
// A reset already behind us says so rather than counting down from nought: the account tells the
// bot of a new window only when a run answers inside it, so a figure whose reset has passed is
// the old window still standing there, and pretending it is about to turn over would be a lie
// about what the console actually knows.
export function resetText(t: Translate, window: HeadlineWindow | null, now: number): string {
  if (window === null || window.resetsAt === null) {
    return "";
  }

  const left = window.resetsAt - now;

  return left <= 0 ? t("usage.label.reset_passed") : t("usage.label.reset_in", { time: untilText(t, left) });
}

// The moment itself, as a clock reads, for the place a reader goes when the length is not what
// they wanted. It stands behind the length rather than beside it.
export function resetClock(t: Translate, window: HeadlineWindow | null): string {
  if (window === null || window.resetsAt === null) {
    return "";
  }

  const at = new Date(window.resetsAt * 1000);

  return t("usage.label.reset_at", {
    month: at.getMonth() + 1,
    date: at.getDate(),
    weekday: t(WEEKDAYS[at.getDay()]!),
    hour: String(at.getHours()).padStart(2, "0"),
    minute: String(at.getMinutes()).padStart(2, "0")
  });
}

// The days of the week, Sunday first as `Date` counts them.
const WEEKDAYS = [
  "usage.label.weekday_sun",
  "usage.label.weekday_mon",
  "usage.label.weekday_tue",
  "usage.label.weekday_wed",
  "usage.label.weekday_thu",
  "usage.label.weekday_fri",
  "usage.label.weekday_sat"
] as const;

// The day a window starts over on, where that is more than a day away. Two logins keep their weeks
// on different days, and the day is what tells one week from the other at a glance; under a day the
// length alone says it.
export function resetDay(t: Translate, window: HeadlineWindow | null, now: number): string {
  if (window === null || window.resetsAt === null || window.resetsAt - now < DAY) {
    return "";
  }

  return t("usage.label.weekday_name", { day: t(WEEKDAYS[new Date(window.resetsAt * 1000).getDay()]!) });
}

// What one agent has burnt over the week: its whole row, so every figure a screen shows of it —
// the four kinds, the total, what the kinds do not cover — is read off one thing. Nothing
// at all where no run of its was recorded, and nothing is not nought: a runner that has never
// answered inside the window has no figure, and the screen leaves the place empty rather than
// claiming it spent none.
export function agentUsage(agents: AgentTokenUsage[], name: string): AgentTokenUsage | null {
  return agents.find((agent) => agent.agent === name) ?? null;
}

// The four kinds a run reports, in the words a person reads them in. A model reads what it is
// sent and writes what it answers, and the cache is those same two verbs against the store the
// session keeps; so the kinds are read, write, cache read and cache write, and each one stands as its own
// figure. They are never added into a single figure standing for the lot: which of them the
// reader is asking about is their question, not this module's to answer for them.
//
// The bot says the same words from its own copy of them. The console reads the archive itself
// and cannot import the bot's module, so the two say the same thing in two places, and a test
// holds them to it.

// One figure as it stands on a screen: the word for what it counts, and the count. A kind the
// rows say nothing about carries no word at all, only a dash — a word in front of a dash would
// put a name to a figure that is not there, and a nought would claim the run burnt none.
export interface TokenFigure {
  label: string;
  text: string;
}

const NOTHING: TokenFigure = { label: "", text: "—" };

function figure(label: string, tokens: number | null): TokenFigure {
  return tokens === null ? NOTHING : { label, text: tokenText(tokens) };
}

// The four, in the order a run makes them: what went in, what came back, and the cache behind
// both. Each one is declared whole here — the word it is read by, the colour it wears wherever
// it is drawn as a share of a row, and where its count sits on a row — so that a kind renamed,
// dropped or moved carries its colour with it. A second list of colours standing beside this one
// would be kept in step by hand, and the day it slipped, every screen would go on drawing a bar
// that looked right and named the wrong kind.
//
// Nothing here is red. Red is the colour this console says a limit in, and none of these four is
// a warning: they are what a run cost, and a run costing what it costs is not news.
interface TokenKind {
  label: string;
  color: BarColor;
  // The field of a split the kind's count is kept in.
  key: keyof TokenSplit;
}

const KINDS: TokenKind[] = [
  { label: "usage.label.kind_input", color: "primary", key: "inputTokens" },
  { label: "usage.label.kind_output", color: "secondary", key: "outputTokens" },
  { label: "usage.label.kind_cache_read", color: "success", key: "cacheReadTokens" },
  { label: "usage.label.kind_cache_write", color: "warning", key: "cacheWriteTokens" }
];

// The four as figures, which is the full form, for a place with room to lay four of them out.
export function kindFigures(t: Translate, split: TokenSplit): TokenFigure[] {
  return KINDS.map((kind) => figure(t(kind.label), split[kind.key]));
}

export function figureText(t: Translate, one: TokenFigure): string {
  return one.label === "" ? one.text : t("usage.label.figure", { label: one.label, text: one.text });
}

// What the account saw go past, whichever kinds it divided into. It stands with the kinds
// rather than in place of them: the kinds are the answer to what a run cost, and this is the
// answer to how much traffic there was.
export function totalText(t: Translate, tally: { tokens: number }): string {
  return t("usage.label.total", { tokens: tokenText(tally.tokens) });
}

// One kind as a bar draws it: how wide it stands, the colour it wears, and the very figure the
// legend under the bar reads out for it. The figure is the one the kinds are named by anywhere
// else on the console, carried along rather than worked out again, so a bar and a line of text
// standing on the same screen cannot say different numbers about the same kind.
export interface UsageSegment {
  figure: TokenFigure;
  tokens: number;
  color: BarColor;
}

// A row's traffic as a bar: what the widths are shares of, and the kinds it divides into.
export interface UsageBar {
  max: number;
  segments: UsageSegment[];
}

// The bar for one row of a tally, and nothing at all where there is no bar to be drawn: a row
// that states none of the four has nothing to divide, and a row nothing went past on has nothing
// to divide it into. Neither may be handed to a bar — a group given a max of nought falls back to
// a hundred and draws an empty grey track, which is a picture claiming a row was measured and
// found empty, standing where the figures should be.
//
// The max is the row's own total rather than the sum of the four. Where every row of the line
// carries its split the two are the same number and the track fills end to end; where one does
// not, the segments fall short of the end by exactly what is unaccounted, which is the honest
// picture of the row and is already named in words by the line standing under the list.
//
// A kind's width is its true share and never a floor: a kind holding a ten-thousandth of a row
// is drawn at a ten-thousandth, which is no pixels at all. A minimum width would overstate it by
// hundreds of times, and a width that means a share is the whole of what this picture is worth.
// Nothing is hidden by the honesty — the kind keeps its row in the legend, with its own dot, its
// own word and its own number, which is where a figure that small is read anyway.
export function usageBar(t: Translate, tally: TokenSplit & { tokens: number }): UsageBar | null {
  const segments = KINDS.flatMap((kind) => {
    const tokens = tally[kind.key];

    return tokens === null ? [] : [{ figure: figure(t(kind.label), tokens), tokens, color: kind.color }];
  });

  return segments.length === 0 || tally.tokens <= 0 ? null : { max: tally.tokens, segments };
}

// What the rows shown could not account for: how many of them were written before the kinds were
// kept apart, and what they carry. Every place that shows the kinds shows this beside it, so a
// reader who sees dashes where the figures should be is told how much of the window they are.
// Nothing to say is said as nothing.
export function unsplitText(t: Translate, tallies: readonly UsageTally[]): string {
  const runs = tallies.reduce((sum, tally) => sum + tally.unsplitRuns, 0);
  const tokens = tallies.reduce((sum, tally) => sum + tally.unsplitTokens, 0);

  return runs === 0 ? "" : t("usage.label.unsplit", { runs, tokens: tokenText(tokens) });
}

export function emptyUsage(): UsageView {
  return { active: null, roads: [], accounts: [], agents: [], contexts: [] };
}
