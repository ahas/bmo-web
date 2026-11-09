import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { agentUsage, figureText, kindFigures, knownMode, limitless, liveWindow, loudestTone, resetClock, resetDay, resetText, shareText, shareTone, titleAccountLabel, titleWindows, tokenText, totalText, unsplitText, untilText, usageBar, usageGroups, windowLabel, moneyText, requestsLabel, requestsText } from "../../../apps/web/app/domain/usage";

import type { AccountUsage, ActiveUsage, AgentTokenUsage, HeadlineWindow, UsageView } from "../../../apps/web/shared/types";
import type { UsageBar, UsageSegment } from "../../../apps/web/app/domain/usage";
import KO from "../../fixtures/app/domain/usage.test.ko.json";

// One line of a tally: the plain total, and the four kinds behind it. The default carries a split; a caller that
// wants a line from before the split says so.
function tally(over: Partial<AgentTokenUsage> = {}): AgentTokenUsage {
  return {
    agent: "agent-a",
    tokens: 2_000_000,
    runs: 12,
    inputTokens: 5_000,
    outputTokens: 45_000,
    cacheReadTokens: 1_900_000,
    cacheWriteTokens: 50_000,
    unsplitRuns: 0,
    unsplitTokens: 0,
    ...over,
  };
}

const session: HeadlineWindow = {
  name: "five_hour",
  utilization: 0.123,
  resetsAt: 1_788_570_000,
  durationMinutes: null,
  limitName: null
};

describe("what a window reads as", () => {
  test("the account's names, in the owner's words", () => {
    expect(windowLabel(wording, "five_hour")).toBe(KO.line_80);
    expect(windowLabel(wording, "seven_day")).toBe(KO.line_81);
    expect(windowLabel(wording, "seven_day_overage_included")).toBe(wording("usage.label.window_weekly_overage"));
  });

  test("a window the console has no word for keeps its own name", () => {
    expect(windowLabel(wording, "five_hour_opus")).toBe("five_hour_opus");
  });

  test("a share is a percentage with one decimal, and nothing at all when there is no reading", () => {
    expect(shareText(session)).toBe("87.7%");
    expect(shareText(null)).toBe("—");
  });

  test("it reads louder as it fills, and red where the bot rests", () => {
    expect(shareTone(session)).toBe("muted");
    expect(shareTone({ ...session, utilization: 0.6 })).toBe("warning");
    expect(shareTone({ ...session, utilization: 0.95 })).toBe("error");
  });


  test("names each provider's own two windows in the words the title bar uses", () => {
    const codexPrimary: HeadlineWindow = {
      ...session,
      name: "codex:codex:primary",
      utilization: 0.71,
      durationMinutes: 300
    };
    const codexSecondary: HeadlineWindow = {
      ...codexPrimary,
      name: "codex:codex:secondary",
      utilization: 0.27,
      durationMinutes: 10_080
    };
    expect(windowLabel(wording, codexPrimary)).toBe(KO.line_164);
    expect(windowLabel(wording, codexSecondary)).toBe(KO.line_165);
  });

  test("when it starts over, as how long is left of it", () => {
    const now = session.resetsAt as number;

    expect(resetText(wording, session, now - 3 * 3600 - 20 * 60)).toBe(KO.line_171);
    expect(resetText(wording, { ...session, resetsAt: null }, now)).toBe("");
    expect(resetText(wording, null, now)).toBe("");
  });

  test("and a reset already behind us says so rather than counting up from nought", () => {
    const now = session.resetsAt as number;

    // The account tells the bot of a new window only when a run answers inside it, so a figure
    // whose reset has passed is the old one still standing.
    expect(resetText(wording, session, now)).toBe(wording("usage.label.reset_passed"));
    expect(resetText(wording, session, now + 60)).toBe(wording("usage.label.reset_passed"));
  });

  test("the moment itself stands behind it, day and hour, for the reader who wants the clock", () => {
    expect(resetClock(wording, session)).toMatch(new RegExp(KO.line_186));
    expect(resetClock(wording, { ...session, resetsAt: null })).toBe("");
    expect(resetClock(wording, null)).toBe("");
  });
});

// The words a length of time is said in. Two units at most, the second dropped when it is
// nought, and never a second — a figure that changes every second is flicker rather than news.
describe("how long is left, in words", () => {
  const minute = 60;
  const hour = 60 * minute;
  const day = 24 * hour;

  test("under a minute is the one word for what is about to happen", () => {
    expect(untilText(wording, 0)).toBe(wording("usage.label.until_soon"));
    expect(untilText(wording, 1)).toBe(wording("usage.label.until_soon"));
    expect(untilText(wording, 59)).toBe(wording("usage.label.until_soon"));
  });

  test("under an hour is minutes alone", () => {
    expect(untilText(wording, minute)).toBe(KO.line_206);
    expect(untilText(wording, 89)).toBe(KO.line_207);
    expect(untilText(wording, 59 * minute + 59)).toBe(KO.line_208);
  });

  test("under a day is hours and minutes, and hours alone on the hour", () => {
    expect(untilText(wording, hour)).toBe(wording("usage.label.until_hours", { h: "1" }));
    expect(untilText(wording, hour + 30 * minute)).toBe(wording("usage.label.until_hours_minutes", { h: "1", m: "30" }));
    expect(untilText(wording, 23 * hour + 59 * minute)).toBe(wording("usage.label.until_hours_minutes", { h: "23", m: "59" }));
  });

  test("a day and over is days and hours, and days alone on the day", () => {
    expect(untilText(wording, day)).toBe(KO.line_218);
    expect(untilText(wording, day + hour)).toBe(KO.line_219);
    expect(untilText(wording, day + 23 * hour + 59 * minute)).toBe(KO.line_220);
    expect(untilText(wording, 6 * day + 12 * hour)).toBe(KO.line_221);
  });
});

// The tally is per agent, and an agent with no run inside the window has no row at all. That
// absence is shown as nothing, never as a nought: the console did not measure none, it measured
// nothing.
describe("what one agent has cost", () => {
  const agents: AgentTokenUsage[] = [
    {
      agent: "worker",
      tokens: 900_874_777,
      runs: 77,
      inputTokens: 100_000,
      outputTokens: 800_000,
      cacheReadTokens: 899_074_777,
      cacheWriteTokens: 900_000,
      unsplitRuns: 0,
      unsplitTokens: 0
    },
    {
      agent: "content-judge",
      tokens: 3_156_122,
      runs: 268,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      unsplitRuns: 268,
      unsplitTokens: 3_156_122
    }
  ];

  test("its own row, whole, so every figure of it is read from one place", () => {
    expect(agentUsage(agents, "worker")?.tokens).toBe(900_874_777);
    expect(agentUsage(agents, "content-judge")?.tokens).toBe(3_156_122);
  });

  test("nothing at all for an agent that has not run inside the window", () => {
    expect(agentUsage(agents, "browse")).toBeNull();
    expect(agentUsage([], "worker")).toBeNull();
  });

  // Nine hundred million of traffic, and eight hundred and ninety-nine of them read back out of
  // the cache on every resumed turn. Each kind stands under its own name, and the total stands
  // with them rather than in place of them.
  test("each kind under its own name, and the total beside them", () => {
    const worker = agentUsage(agents, "worker") as AgentTokenUsage;

    expect(kindFigures(wording, worker).map((one) => figureText(wording, one))).toEqual([
      KO.line_273,
      KO.line_274,
      KO.line_275,
      KO.line_276,
    ]);
    expect(totalText(wording, worker)).toBe(KO.line_278);
  });

  // A screen showing a fresh figure says in the same breath how much of the window it leaves out,
  // so nobody reads a part for the whole.
  test("what a list of rows leaves unaccounted is the rows of it written before the split", () => {
    expect(unsplitText(wording, agents)).toBe(wording("usage.label.unsplit", { runs: "268", tokens: "3.2M" }));
    expect(unsplitText(wording, [agents[0] as AgentTokenUsage])).toBe("");
    expect(unsplitText(wording, [])).toBe("");
  });
});

describe("tokens as a person reads them", () => {
  test("shortened to a unit a row has room for", () => {
    expect(tokenText(940)).toBe("940");
    expect(tokenText(9_400)).toBe("9.4K");
    expect(tokenText(94_000)).toBe("94K");
    expect(tokenText(2_400_000)).toBe("2.4M");
    expect(tokenText(42_918_438_083)).toBe("42,918.4M");
  });
});

// On a narrow bar the figures fold into one mark, and that mark has to carry what they were
// saying: a share standing at red is not something a fold may hide.
describe("what the figures read as when they stand as one mark", () => {
  test("the loudest of them", () => {
    const quiet = { ...session, utilization: 0.1 };
    const warm = { ...session, utilization: 0.7 };
    const red = { ...session, utilization: 0.95 };

    expect(loudestTone([quiet, quiet])).toBe("muted");
    expect(loudestTone([quiet, warm])).toBe("warning");
    expect(loudestTone([warm, red])).toBe("error");
    expect(loudestTone([red, quiet])).toBe("error");
  });

  test("and quiet where there is no reading at all, since nothing is known to be loud", () => {
    expect(loudestTone([null, null])).toBe("muted");
    expect(loudestTone([])).toBe("muted");
  });
});

// The four kinds as one picture: a track cut into them, which is what a row of the popover draws
// under its name. Everything about the picture is settled here — the colours, what the widths are
// shares of, and when there is no picture to draw at all — so the screen that shows it works
// nothing out for itself and two screens showing it cannot disagree.
describe("a row's traffic as a bar", () => {
  // The colours the theme knows. Anything else would be handed to the group as a custom colour
  // and painted straight onto the segment, which is a colour nobody chose for this console.
  const THEME_COLORS = ["primary", "secondary", "success", "info", "warning", "error", "neutral"];

  test("a colour of its own for each kind, from the theme's list and never the red one", () => {
    const bar = usageBar(wording, tally()) as UsageBar;

    expect(bar.segments.map((one) => [one.figure.label, one.color])).toEqual([
      [KO.line_341, "primary"],
      [KO.line_342, "secondary"],
      [KO.line_343, "success"],
      [KO.line_344, "warning"],
    ]);

    for (const color of bar.segments.map((one) => one.color)) {
      expect(THEME_COLORS).toContain(color);
      // Red is what this console says a limit in. What a run cost is not a warning about
      // anything, and four kinds one of which reads as an alarm is a picture telling a story the
      // figures never told.
      expect(color).not.toBe("error");
    }
  });

  test("and the segments say what the kinds say, in the order the kinds stand in", () => {
    const row = tally();

    // The very figures, not figures worked out a second time: a bar and a line of text on the
    // same screen cannot say two different numbers about one kind.
    expect(usageBar(wording, row)?.segments.map((one) => one.figure)).toEqual(kindFigures(wording, row));
  });

  // A line can hold rows written before the kinds were kept apart, and such a row carries a total
  // with nothing under it. The max stays the row's own total, so where the kinds do not cover the
  // row the segments stop short of the end by exactly what is unaccounted — which is the true
  // picture of that row, and what the before-the-split line under the list is there to name.
  test("the widths are shares of the row's own total, so an uncovered remainder stays visible", () => {
    const row = tally({ tokens: 2_500_000, unsplitRuns: 3, unsplitTokens: 500_000 });
    const bar = usageBar(wording, row) as UsageBar;

    expect(bar.max).toBe(2_500_000);
    expect(bar.segments.reduce((sum, one) => sum + one.tokens, 0)).toBe(2_000_000);
  });

  test("no bar at all where the row states no kind, since there is nothing to divide", () => {
    const row = tally({
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      unsplitRuns: 12,
      unsplitTokens: 2_000_000,
    });

    expect(usageBar(wording, row)).toBeNull();
  });

  // A group handed a max of nought falls back to a hundred and draws an empty grey track, which
  // is a picture claiming the row was measured and found empty.
  test("and none where nothing went past at all", () => {
    const row = tally({ tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });

    expect(usageBar(wording, row)).toBeNull();
  });

  test("a kind too small to see keeps its true share, and keeps its figure in the legend", () => {
    const row = tally({
      tokens: 182_701_500,
      inputTokens: 1_500,
      outputTokens: 0,
      cacheReadTokens: 182_700_000,
      cacheWriteTokens: 0,
    });
    const bar = usageBar(wording, row) as UsageBar;

    // A hundred-thousandth of the row, drawn as a hundred-thousandth and as no pixels at all. A
    // floor lifting it to something the eye can catch would overstate it by thousands of times,
    // and a width allowed to lie in the small kind's favour has stopped meaning a share.
    expect(bar.segments.map((one) => one.tokens)).toEqual([1_500, 0, 182_700_000, 0]);
    expect((bar.segments[0] as UsageSegment).tokens / bar.max).toBeLessThan(0.0001);
    // Nothing is hidden by the honesty: the sliver keeps its word and its number under the bar,
    // which is where a figure that small is read anyway.
    expect((bar.segments[0] as UsageSegment).figure).toEqual({ label: KO.line_414, text: "1.5K" });
  });
});


test("remaining usage reaches zero when spent and does not confuse model-specific windows", () => {
  expect(shareText({ ...session, utilization: 1 })).toBe("0%");
  expect(shareText({ ...session, utilization: 0 })).toBe("100%");
  expect(shareText({ ...session, utilization: 1.2 })).toBe("0%");
  const weekly = { ...session, name: "codex:codex:primary", durationMinutes: 10080 };
  const spark = { ...weekly, name: "codex:codex_bengalfox:primary", durationMinutes: 300, limitName: "GPT-5.3-Codex-Spark" };
  expect(windowLabel(wording, spark)).toBe(KO.line_425);
});

// Every registered account stands as a group of its own, in the agency's order, whichever of them the chat runs
// on: each login keeps its own limit, and one account's figures are never read in place of another's.
describe("the panel's groups", () => {
  const week: HeadlineWindow = { ...session, name: "seven_day", utilization: 0.4 };

  function account(id: string, over: Partial<AccountUsage> = {}): AccountUsage {
    return { id, name: `Account ${id}`, provider: "claude-code", label: "Claude Code", inUse: false, session: null, week: null, balance: null, ...over };
  }

  function active(over: Partial<ActiveUsage> = {}): ActiveUsage {
    return { provider: "claude-code", label: "Claude Code", account: "a", accountName: "Account a", logins: 2, session, week, balance: null, ...over };
  }

  function view(over: Partial<UsageView> = {}): UsageView {
    return { active: null, roads: [], accounts: [], agents: [], contexts: [], ...over };
  }

  test("each account holds its own windows alone, session first, in the agency's order", () => {
    const groups = usageGroups(view({ active: active(), accounts: [account("a", { inUse: true, session, week }), account("b", { week })] }));

    expect(groups.map((group) => [group.id, group.name, group.inUse, group.windows.map((window) => window.name)])).toEqual([
      ["a", "Account a", true, ["five_hour", "seven_day"]],
      ["b", "Account b", false, ["seven_day"]],
    ]);
  });

  test("an account with no window stated still has its group, holding nothing", () => {
    expect(usageGroups(view({ accounts: [account("a")] }))[0]?.windows).toEqual([]);
  });

  test("a slot on a provider with no login stands ahead of the accounts, marked, and no account is", () => {
    const slot = active({ provider: "provider-x", label: "Provider X", account: null, accountName: null, logins: 0, session: null, week: null });
    const groups = usageGroups(view({ active: slot, accounts: [account("a"), account("b")] }));

    expect(groups.map((group) => [group.label, group.name, group.inUse])).toEqual([
      ["Provider X", null, true],
      ["Claude Code", "Account a", false],
      ["Claude Code", "Account b", false],
    ]);
    expect(groups[0]?.windows).toEqual([]);
  });

  test("nothing at all where the agency names no slot and lists no account", () => {
    expect(usageGroups(view())).toEqual([]);
  });

  test("a provider this console has a name for is known by it, and any other stands under the agency's label", () => {
    expect(knownMode("claude-code")).toBe("claude-code");
    expect(knownMode("provider-x")).toBeNull();
  });
});

// A window whose reset has passed is the old window still standing: the account is in a new one
// whose figure has not been read yet, so the old figure is not shown as though it were live.
describe("a window past its reset", () => {
  test("has no live figure, and says it was reset", () => {
    const at = session.resetsAt as number;

    expect(liveWindow(session, at - 60)).toEqual(session);
    expect(liveWindow(session, at)).toBeNull();
    expect(shareText(liveWindow(session, at + 60))).toBe("—");
    expect(resetText(wording, session, at + 60)).toBe(wording("usage.label.reset_passed"));
    // A window with no reset has nothing to have passed.
    expect(liveWindow({ ...session, resetsAt: null }, at)).toEqual({ ...session, resetsAt: null });
  });
});

// Two logins keep their weeks on different days, and the day is what tells one week from the other
// at a glance. Under a day the length alone says it.
describe("the day a window starts over on", () => {
  test("is named where it is more than a day away", () => {
    const friday = Math.floor(new Date(2026, 8, 25, 6, 0).getTime() / 1000);
    const monday = Math.floor(new Date(2026, 8, 28, 2, 0).getTime() / 1000);
    const now = Math.floor(new Date(2026, 8, 24, 11, 0).getTime() / 1000);

    expect(resetDay(wording, { ...session, resetsAt: friday }, now)).toBe("");
    expect(resetDay(wording, { ...session, resetsAt: monday }, now)).toBe(KO.line_528);
    expect(resetDay(wording, { ...session, resetsAt: friday }, now - 86_400)).toBe(KO.line_529);
    expect(resetDay(wording, { ...session, resetsAt: null }, now)).toBe("");
    expect(resetDay(wording, null, now)).toBe("");
  });
});

// The title bar stands for what a run is about to meet, so it reads the slot the agency says the chat runs on. The
// head of the account order is not that login whenever the road has passed it over, and reading it there would
// stand that login's red on the bar while every run answers on another.
describe("whose window the title bar shows", () => {
  const second = { name: "five_hour", utilization: 0.9, resetsAt: 1_788_570_000, durationMinutes: null, limitName: null };

  function active(over: Partial<ActiveUsage> = {}): ActiveUsage {
    return { provider: "claude-code", label: "Claude Code", account: "default", accountName: "Account A", logins: 2, session, week: null, balance: null, ...over };
  }

  test("the figures are the slot's, not the first of the order", () => {
    expect(titleWindows(active())[0]?.utilization).toBe(0.123);
    expect(titleWindows(active({ account: "second", accountName: "Account B", session: second }))[0]?.utilization).toBe(0.9);
  });

  test("the login is named on the bar, and only where there is more than one", () => {
    expect(titleAccountLabel(active())).toBe("Account A");
    expect(titleAccountLabel(active({ logins: 1 }))).toBeNull();
  });

  test("a provider holding no login names none, and with no window it has no limit to show", () => {
    const other = active({ provider: "provider-x", label: "Provider X", account: null, accountName: null, logins: 0, session: null });

    expect(titleAccountLabel(other)).toBeNull();
    expect(limitless(other)).toBe(true);
    expect(limitless(active({ provider: "codex", account: null, accountName: null, logins: 0 }))).toBe(false);
    expect(limitless(active({ session: null }))).toBe(false);
  });

  // The agency's own answer is what names the slot, so with none the bar shows dashes rather than guessing at the
  // head of the list.
  test("with no slot named the bar shows no login's figures", () => {
    expect(titleAccountLabel(null)).toBeNull();
    expect(titleWindows(null)).toEqual([null, null]);
    expect(limitless(null)).toBe(false);
  });
});

// What a provider paid by the request or an endpoint account has left in money stands in its own currency, and the
// panel carries it beside the windows, or alone where there are none.
describe("a balance", () => {
  test("is written in its own currency", () => {
    expect(moneyText({ amount: 25.6, currency: "USD", seenAt: 0, requests: null })).toContain("25.60");
    expect(moneyText({ amount: 3, currency: "NOT-A-CODE", seenAt: 0, requests: null })).toBe("3 NOT-A-CODE");
  });

  test("stands in the slot's group of the panel", () => {
    const balance = { amount: 1, currency: "USD", seenAt: 0, requests: null };
    const groups = usageGroups({ active: { provider: "provider-x", label: "Provider X", account: null, accountName: null, logins: 0, session: null, week: null, balance }, roads: [], accounts: [], agents: [], contexts: [] });

    expect(groups[0]?.balance).toEqual(balance);
  });

  test("of a provider's own road stands as a group of its own after the accounts, under the provider's label", () => {
    const balance = { amount: 9.55, currency: "USD", seenAt: 0, requests: { used: 12, limit: 1000, left: 988, scope: "free-models" } };
    const account = { id: "a", name: "Account A", provider: "claude-code", label: "Claude Code", inUse: false, session: null, week: null, balance: null };
    const groups = usageGroups({ active: null, roads: [{ provider: "provider-y", label: "Provider Y", balance }], accounts: [account], agents: [], contexts: [] });

    expect(groups.map((group) => group.id)).toEqual(["a", "road:provider-y"]);
    expect(groups[1]).toMatchObject({ provider: "provider-y", label: "Provider Y", name: null, inUse: false, windows: [], balance });
  });

  test("says what its request allowance covers in the pack's words, and how many are left of the day's ceiling", () => {
    const allowance = { used: 12, limit: 1000, left: 988, scope: "free-models" as string | null };

    expect(requestsLabel(wording, allowance)).toBe(wording("usage.label.requests_free_models"));
    expect(requestsLabel(wording, { ...allowance, scope: "a-scope-the-pack-has-no-word-for" })).toBe(wording("usage.label.requests_day"));
    expect(requestsLabel(wording, { ...allowance, scope: null })).toBe(wording("usage.label.requests_day"));
    expect(requestsText(wording, allowance)).toBe(wording("usage.label.requests_left", { left: "988", limit: "1,000" }));
  });
});
