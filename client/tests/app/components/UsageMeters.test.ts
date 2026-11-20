import { describe, expect, test } from "bun:test";
import KO from "../../fixtures/app/components/UsageMeters.test.ko.json";

// What the title bar carries, and what it does with it when there is no room. The bar is one
// axis — the two limit windows, as percentages — and a phone has no room to carry even those
// beside the room's own name, which is what must not be cut, so below the width this console
// folds at the two become the one mark that opens them. The rule is read off the file that
// ships, because what makes it true is a pair of variants on two elements and nothing a
// rendered screen would name.

const source = await Bun.file(new URL("../../../apps/web/app/components/UsageMeters.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
// What one group of the panel holds is the figures component the providers tab shows too.
const figuresSource = await Bun.file(new URL("../../../apps/web/app/components/UsageFigures.vue", import.meta.url)).text();
const figures = figuresSource.slice(0, figuresSource.indexOf("<script"));

// The one element of a template, with its classes: by default the bar's, whose button opens the figures.
function tagOf(mark: string, within: string = template): string {
  const at = within.indexOf(mark);

  expect(at).toBeGreaterThan(-1);

  const opened = within.lastIndexOf("<", at);

  return within.slice(opened, within.indexOf(">", at) + 1);
}

describe("the mark the figures fold into", () => {
  test("there is a template to read, so nothing below passes on an empty string", () => {
    expect(template.length).toBeGreaterThan(500);
    expect(template).toContain("i-material-symbols-speed");
    expect(template).toContain("shareText(liveWindow(session, now))");
  });

  test("stands only on a short bar, and the figures only on a bar that is not", () => {
    // The fold is the bar's own width, the one every part of the bar folds by (docs/web.md, 「The title bar」).
    expect(tagOf("i-material-symbols-speed")).toContain("@3xl/title-bar:hidden");
    expect(template).toContain('<span v-else class="hidden @3xl/title-bar:contents">');
  });

  // Folded there is nowhere on the bar to name the login, and the mark is named on hover like
  // every icon button, so the login is said there.
  test("names the login in the tooltip it already carries", () => {
    expect(template).toContain("$t('usage.title.remaining_of', { name: accountName })");
  });

  test("carries the loudest of the figures in its colour, so folding hides no warning", () => {
    expect(tagOf("i-material-symbols-speed")).toContain("toneClass(loudest)");
  });

  test("opens the same popover the figures always opened", () => {
    // The mark is inside the button, not beside it: one press, and the whole of what the bar
    // was saying stands in the popover.
    expect(template.indexOf("<UPopover")).toBeLessThan(template.indexOf("i-material-symbols-speed"));
    expect(template.indexOf("i-material-symbols-speed")).toBeLessThan(template.indexOf("</UButton>"));
  });

  // The press is the library's own button, so its hover fills its own rounded shape, and folded it is
  // the library's square, the one every icon button of the bar is.
  test("is the library's own button, square once the figures fold away", () => {
    const press = tagOf(`:aria-label="$t('usage.title.remaining')"`);

    expect(press.startsWith("<UButton")).toBe(true);
    expect(press).toContain('variant="ghost"');
    expect(press).toContain(':square="short"');
    expect(template).not.toContain("<button");
    expect(template).not.toContain("hover:");
  });
});

// One axis on the bar and no second one. A count of tokens set beside a percentage is read as
// another percentage, so the counts stand with the totals in the popover instead.
describe("what the wide bar carries", () => {
  // The wide shape of the bar: what stands where the fold is not in force.
  const wide = template.slice(template.indexOf('<span v-else class="hidden @3xl/title-bar:contents">'), template.indexOf("</UButton>"));

  test("the two limit windows, by name and as shares", () => {
    expect(wide).toContain('$t("usage.label.window_session")');
    expect(wide).toContain('$t("usage.label.window_weekly")');
    expect(wide).toContain("shareText(liveWindow(session, now))");
    expect(wide).toContain("shareText(liveWindow(weekly, now))");
  });

  // A window belongs to the login that reported it, and the agency holds more than one. So the bar says
  // whose the two figures are — the login a run goes out on now — and a figure with no login
  // named is a figure about nobody.
  test("and the login those two figures belong to", () => {
    expect(wide).toContain("accountName");
    // And the figures themselves are the slot the agency says the chat runs on, read off its answer
    // rather than taken as the first row of the order.
    expect(source).toContain("titleWindows(usage.value.active)");
    expect(source).toContain("titleAccountLabel(usage.value.active)");
    expect(wide).toContain("slotName(usage.active)");
  });

  // A provider with no login and no window has no limit, so it stands as one dash rather than as two
  // windows it does not have.
  test("and one dash where the slot has no limit to show", () => {
    expect(wide).toContain('v-if="limitless(usage.active)"');
  });

  test("and no figure of tokens beside them", () => {
    for (const figure of [KO.line_81, "tokenText", "totalText", "kindFigures"]) {
      expect(wide).not.toContain(figure);
    }
  });

  test("the letters stand in the interface's own face, and only the digits are held to a width", () => {
    // What this bar wants is columns of digits that do not shove the bar along as they change,
    // and tabular figures are that. A fixed-width face is the other thing — the face code is read
    // in — and the words here are not code: they are the interface's own, and they read in the
    // interface's own face.
    expect(template).not.toContain("font-mono");
    expect(tagOf(`:aria-label="$t('usage.title.remaining')"`)).toContain("tabular-nums");
  });
});

describe("what the popover holds", () => {
  test("each account's remaining windows by name, and no account marked as the one in use", () => {
    expect(template).toContain("usage.title.remaining");
    expect(template).toContain('v-for="group in groups"');
    expect(template).toContain("slotName(group)");
    expect(template).toContain('<UsageFigures :group="group" :now="now" />');
    expect(figures).toContain("windowLabel($t, window)");
    expect(template).not.toContain("usage.label.in_use");
    // An account the agency states no window for says so, and with none at all the panel says there is none.
    expect(figures).toContain('$t("usage.status.no_info")');
    expect(template).toContain('$t("usage.status.no_accounts")');
  });

  // The panel is what the accounts have left and nothing else: no tally of tokens and no list of sessions.
  test("and no tally of tokens and no list of sessions", () => {
    for (const absent of ["<UsageSplit", "totalText", "kindFigures(", "sessionGroups", "usage.title.weekly_by_gate", "usage.title.weekly_by_user", "usage.title.saved_sessions"]) {
      expect({ absent, said: template.includes(absent) }).toEqual({ absent, said: false });
    }
  });

  // The room a popover has was worked out for it before it was drawn, and this console takes its
  // ceiling from there in one place for every popover there is. A height written on this one
  // would be a second answer to a question already answered, and the answer that loses is
  // whichever of the two the reader is not looking at.
  test("and no ceiling, no height and no overflow of its own on what it opens", () => {
    const popover = tagOf("<UPopover");

    // What it does say about itself is its width and its padding, which is the shape it wants
    // where there is room for it.
    expect(popover).toContain("w-96");

    for (const rule of ["max-h-", "h-full", "overflow", "overscroll"]) {
      expect({ rule, said: popover.includes(rule) }).toEqual({ rule, said: false });
    }
  });

  // A mark that stands on every screen leads to what it is about, and a panel opened from one
  // carries the way to that thing's own page. What these figures are read against is the list of
  // logins, their order and their switches, at their group on the administrator's screen.
  test("and the way to the accounts the figures are of", () => {
    expect(tagOf(':to="ACCOUNTS_ADDRESS"')).toContain(`:label="$t('usage.label.claude_accounts')"`);
  });

  test("a window says how long is left of it, and keeps the hour behind that", () => {
    const row = tagOf(":title=\"resetClock($t, window)\"", figures);

    // The length is what stands on the row; the clock face the account gave is on the row
    // itself, for the reader who wants the hour rather than the length.
    expect(row).toContain(':title="resetClock($t, window)"');
    // It counts down while it is read, so its digits are the fixed-width ones.
    expect(row).toContain("tabular-nums");
  });
});
