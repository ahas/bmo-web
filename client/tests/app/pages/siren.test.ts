import { describe, expect, test } from "bun:test";

// What this screen's own toolbar carries about the watch, and what it does with it when there is no
// room. A phone's toolbar cannot hold the line beside the filters, so below the width this console
// folds at the line becomes the one mark that opens it. That is the fold the usage figures in the
// top bar already take, at the same width and in the same shape, and taking it again rather than
// inventing a second one is the whole point: the two presses behave alike.
//
// The rule is read off the files that ship, because what makes it true is a pair of variants on
// two elements and nothing a rendered screen would name.

const source = await Bun.file(new URL("../../../apps/web/app/pages/siren.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
// The popover the standing line opens; the filters fold into a popover of their own before it.
const STANDING = '<UPopover v-if="standing !== null"';

// The one element, with its classes: the mark, or the line, or the button that holds both.
function tagOf(mark: string): string {
  const at = template.indexOf(mark);

  expect(at).toBeGreaterThan(-1);

  const opened = template.lastIndexOf("<", at);

  return template.slice(opened, template.indexOf(">", at) + 1);
}

describe("the mark the standing line folds into", () => {
  test("there is a template to read, so nothing below passes on an empty string", () => {
    expect(template.length).toBeGreaterThan(500);
    expect(template).toContain("i-material-symbols-schedule-outline");
    expect(template).toContain("standing.line");
  });

  test("stands only below the width this console folds at, and the line only above it", () => {
    // sm, which is where every other thing in this console changes its mind about a phone.
    expect(tagOf("i-material-symbols-schedule-outline")).toContain("sm:hidden");
    expect(tagOf("standing.line")).toContain("hidden sm:inline");
  });

  test("is inside the button that opens the popover, so one press does the whole of it", () => {
    const popover = template.indexOf(STANDING);
    const mark = template.indexOf("i-material-symbols-schedule-outline");
    const closed = template.indexOf("</UButton>", popover);

    expect(popover).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(popover);
    expect(mark).toBeLessThan(closed);
  });

  test("is the library's own small button, square once folded", () => {
    // It folds as the usage figures in the title bar fold, and like them it is the library's ghost button with
    // no hover of its own: a second look for the same kind of press is what this is here to prevent.
    const press = tagOf(`:aria-label="$t('siren.label.window_last')"`);

    expect(press.startsWith("<UButton")).toBe(true);
    expect(press).toContain('size="sm"');
    expect(press).toContain('variant="ghost"');
    expect(press).toContain(':square="narrow"');
    expect(press).not.toContain("hover:");
  });

  test("and is nothing at all while the watch does not answer", () => {
    // The body of the screen says that in its own words. A mark opening onto two blanks is worse
    // than no mark, and an empty popover is what a line that merely went blank would leave.
    expect(template).toContain(STANDING);
  });
});

describe("what the press opens onto", () => {
  const opened = template.indexOf(STANDING);
  const content = template.slice(template.indexOf("<template #content>", opened), template.indexOf("</UPopover>", opened));

  test("the same facts the line is made of, rather than a second copy of them", () => {
    // Written twice they would drift; read out of the one shape they cannot.
    expect(content).toContain('v-for="fact in standing.facts"');
    expect(content).toContain("{{ fact.label }}");
    expect(content).toContain("{{ fact.value }}");
  });

  test("each on its own row, with the digits lined up as the console lines digits up", () => {
    expect(content).toContain("tabular-nums");
  });
});

// How the request list is laid out. What makes it true is a stylesheet and a handful of classes,
// neither of which a rendered row would name, so it is read off the file that ships. What the
// browser actually does with it — whether a cell stands at one place down the list, and whether
// anything runs off the side — is checked by driving the screen, not here.
describe("the columns of the request list", () => {
  const style = source.slice(source.indexOf("<style"));
  const columns = /grid-template-columns:\s*([^;]+);/.exec(style);

  test("are declared once, on the list, and every row is laid out on them", () => {
    // Declared per row instead, each row would size its own columns out of its own words and the
    // list would read ragged down every cell — which is the whole of what this is here to prevent.
    expect(columns).not.toBeNull();
    expect(style).toContain(".siren-rows > li,\n  .siren-row {");
    expect(style).toContain("grid-template-columns: subgrid;");
    expect(style.match(/grid-template-columns:\s*subgrid/g)).toHaveLength(1);
  });

  test("switch to the one line at the width the list itself has, not the width of the window", () => {
    // A sidebar and the TODO panel take their width first, so a wide window can still leave a
    // narrow list — and nine columns squeezed into a column of prose is where the words go missing.
    expect(style).toContain("container-type: inline-size;");
    expect(style).toMatch(/@container \(width >= \d+rem\)/);
    expect(style.indexOf("@container")).toBeLessThan(style.indexOf("grid-template-columns"));
  });

  test("and stand the one line inside the reading column, which is 48rem wide", () => {
    const threshold = Number(/@container \(width >= (\d+(?:\.\d+)?)rem\)/.exec(style)?.[1]);

    // The screen stands in the console's column like every other list, so a threshold above the
    // column's own width would fold every row at the width the screen is actually read at.
    expect(source).not.toContain("max-w-none");
    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThanOrEqual(48);
  });

  test("give the three that identify a request their own width, the reason its whole width, and the road the rest", () => {
    const said = ((columns as RegExpExecArray)[1] as string).trim().split(/\s+(?![^(]*\))/);

    // Time, agent and session are read for what the request was; each takes what its own words ask
    // for, the agent up to a ceiling. The reason is read before the model, so it takes the width its
    // own words ask for with no ceiling, and the model takes what the reason leaves, down to a floor
    // it still reads at.
    expect(said).toHaveLength(9);
    expect(said.filter((one) => one.startsWith("fit-content("))).toEqual(["fit-content(8rem)"]);
    expect(said[4]).toBe("minmax(6rem, 1fr)");
    expect(said[5]).toBe("minmax(0, max-content)");
  });

  test("hold a column open for a value the watch could not give", () => {
    // Left out of the line, every cell after it slides one place to the left and that row alone
    // reads a column out of step with the rest.
    expect(template).toContain(`class="siren-clip siren-held shrink-0 font-mono text-muted" :class="row.event.session === '' ? 'hidden' : ''"`);
    expect(template).toContain(`class="siren-held min-w-0" :class="row.noted ? '' : 'hidden'"`);
    expect(style).toContain(".siren-held {\n    display: block;\n  }");
  });

  test("stand the token counts at the trailing end, lined up down the list", () => {
    expect(template.match(/class="siren-figure shrink-0 tabular-nums"/g)).toHaveLength(2);
    expect(style).toContain(".siren-figure {\n    text-align: end;\n  }");
  });

  test("and keep the mark that says a row can be pressed in a column of its own", () => {
    // A row that leads nowhere draws no chevron, and the column left empty is what stands its
    // figures exactly where the row above stands them.
    const marked = template.indexOf('v-if="row.to !== null" name="i-material-symbols-chevron-right"');

    expect(marked).toBeGreaterThan(-1);
    expect(template.indexOf("</component>", marked)).toBeGreaterThan(marked);
  });
});

describe("what the watch is seeing right now", () => {
  test("stands the ten minutes against the figures, half the width each", () => {
    expect(template).toContain('<section class="flex flex-col gap-3 lg:grid lg:grid-cols-2" :aria-busy="!loaded">');
  });

  // Every card's own name and frame are the screen's, so they stand from the first frame and only
  // the figure inside each one is waited for.
  test("the cards stand named while their figures are read", () => {
    expect(template).toContain('>{{ $t("siren.label.new_tokens") }}</p>');
    expect(template).toContain('>{{ $t("siren.title.recent_requests") }}</h2>');
    expect(template).toContain('<SkeletonBar v-if="!loaded" class="mt-1 h-6 w-20" />');
    expect(template).not.toContain('v-if="!loaded && !loadError" class="flex flex-col gap-6"');
  });

  test("and lets the bars take the height that half gives them, down to a floor", () => {
    // Written as a fixed height, the card standing beside a taller neighbour is mostly empty.
    expect(template).toContain('class="flex min-h-16 flex-1 items-end gap-1"');
    expect(template).not.toContain('style="height: 64px"');
  });
});
