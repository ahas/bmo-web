import { describe, expect, test } from "bun:test";

import { packEntries } from "../../../apps/web/shared/wording";
import KO from "../../fixtures/app/components/TodoPanel.test.ko.json";

// The keys whose words carry a phrase, so a check that a screen never says it reads the keys.
const keysSaying = (phrase: string) => packEntries().filter(([, value]) => value.includes(phrase)).map(([key]) => key);

// How a finished row is read. It is a record of what was done, so it stands at the brightness
// every other row stands at, and what tells it apart from the ones beside it is the colour of
// its word — which one place decides, for the panel and for anything else that asks. Both of
// those are an attribute on one element, which a rendered screen would name as neither, so the
// rule is read off the file that ships.

const source = await Bun.file(new URL("../../../apps/web/app/components/TodoPanel.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
// The open row's dialog is a component of its own, and what it draws is read off its own file.
const detailSource = await Bun.file(new URL("../../../apps/web/app/components/TodoItemDetail.vue", import.meta.url)).text();
const detailTemplate = detailSource.slice(0, detailSource.indexOf("<script"));
// A row's wait line reads the panel's clock on its own, so what it draws is read off its own file.
const waitSource = await Bun.file(new URL("../../../apps/web/app/components/TodoWaitLine.vue", import.meta.url)).text();
const waitTemplate = waitSource.slice(0, waitSource.indexOf("<script"));
const WAIT_LINE = '<TodoWaitLine v-if="item.waiting !== null"';
// What a row holds is a part of its own inside the panel's row, so what it draws is read off its own file.
const rowSource = await Bun.file(new URL("../../../apps/web/app/components/TodoRow.vue", import.meta.url)).text();
const rowTemplate = rowSource.slice(0, rowSource.indexOf("<script"));

// Every expression a template binds, attribute or interpolation.
function bindingsOf(drawn: string): string[] {
  return [...drawn.matchAll(/\s(?:[:@#]|v-)[\w.:-]*="([^"]*)"|\{\{([^}]*)\}\}/g)].map((found) => found[1] ?? found[2] ?? "");
}

// The opening tag of the one element a mark stands in, with its attributes and nothing of what
// it holds: the mark may be inside the tag or in the element's own text, and either way it is
// that tag alone that is being read.
function tagOf(mark: string, within: string = template): string {
  const at = within.indexOf(mark);

  expect(at).toBeGreaterThan(-1);

  const opened = within.lastIndexOf("<", at);

  return within.slice(opened, within.indexOf(">", opened) + 1);
}

// The row itself, and not the list around it: a row being carried by a drag wears an opacity of
// its own elsewhere in this file, and reading the whole template would let that mark answer for
// a question it is not the answer to.
const row = tagOf('v-for="item in section.items"');

// An order holding its worker's checkout and unable to use it puts what is in the way on the row,
// in the runner's own words. The panel never works one out of its own, so the line reads the
// item's own field and nothing else.
describe("the checkout a row's order is holding", () => {
  test("the reason is shown from the item, under its own label", () => {
    const line = rowTemplate.slice(rowTemplate.indexOf('v-if="item.holding !== null"'), rowTemplate.indexOf("</p>", rowTemplate.indexOf('v-if="item.holding !== null"')));

    expect(line).toContain("todo.label.field_checkout_reason");
    expect(rowTemplate).toContain(":text=\"$t('todo.label.field_checkout_reason', { reason: item.holding })\"");
  });
});

describe("a row of the list", () => {
  test("there is a template to read, so nothing below passes on an empty string", () => {
    expect(template.length).toBeGreaterThan(500);
    expect(rowTemplate).toContain('<SearchText :text="stateLabel($t, item)" :query="query" />');
    expect(row).toContain("<li");
  });

  test("is read at the same brightness whether it is done or not", () => {
    for (const dimming of ["opacity", "dimmed", "text-muted", "grayscale", "item.done"]) {
      expect({ dimming, said: row.includes(dimming) }).toEqual({ dimming, said: false });
    }
  });

  // What a row says in words stands under its title and its chips stand last, so a line such as
  // a job's wait never sits squeezed under a run of chips.
  test("stands its lines of words under the title and its chips at its foot", () => {
    const chips = rowTemplate.indexOf('<div class="mt-1 flex flex-wrap items-center gap-1">');
    const title = rowTemplate.indexOf("@click=\"emit('open', item.id)\"");

    expect(chips).toBeGreaterThan(-1);

    for (const line of [WAIT_LINE, "deployWaitsLine($t, item) !== null", "stoppedLine($t, item) !== null", "item.mergedInto !== null", 'v-if="item.holding !== null"']) {
      const at = rowTemplate.indexOf(line);

      expect({ line, underTitle: at > title, aboveChips: at < chips }).toEqual({ line, underTitle: true, aboveChips: true });
    }
  });

  // Each line under the title comes and goes by its height through the row's own moving list, and holds the space
  // above it as its own padding so that space folds with it (docs/web.md, 「Motion」). How the list moves is read in
  // the browser.
  test("moves its lines under the title through one moving list, each holding the space above it", () => {
    const opened = rowTemplate.indexOf("data-item-lines");
    const closed = rowTemplate.indexOf("</MovingList>", opened);

    expect(tagOf("data-item-lines", rowTemplate).startsWith("<MovingList")).toBe(true);

    for (const line of [WAIT_LINE, 'v-if="testbedTurn !== null"', "deployWaitsLine($t, item) !== null", "stoppedLine($t, item) !== null", "item.mergedInto !== null", 'v-if="item.holding !== null"']) {
      const at = rowTemplate.indexOf(line);
      const tag = tagOf(line, rowTemplate);
      // The wait line is a part of its own, whose padding stands on its own element.
      const drawn = line === WAIT_LINE ? tagOf("<p", waitTemplate) : tag;

      expect({ line, inside: at > opened && at < closed, keyed: tag.includes(" key="), padded: drawn.includes("pt-1"), margined: drawn.includes("mt-1") }).toEqual({ line, inside: true, keyed: true, padded: true, margined: false });
    }
  });

  test("gives a job's wait line no hover or press of its own", () => {
    const wait = tagOf("<p", waitTemplate);

    expect(wait.startsWith("<p")).toBe(true);
    expect(wait).not.toContain("hover:");
    expect(wait).not.toContain("active:");
    expect(wait).not.toContain("@click");
  });

  // A second's tick redraws the parts of a row that show a time and never the list (docs/web.md, the TODO panel's
  // section), so no binding the panel's own template or a row's draws the list with reads the clock.
  test("reads the clock in no binding of its own", () => {
    for (const drawn of [template, rowTemplate]) {
      const bindings = bindingsOf(drawn);

      expect(bindings.length).toBeGreaterThan(0);
      expect(bindings.filter((binding) => /\bnow\b/.test(binding))).toEqual([]);
    }
  });

  // A row is drawn again only when what it is handed changed (docs/web.md, the TODO panel's section). The moving
  // list redraws every part that is its own item, so the row's part stands inside the item rather than being it.
  test("holds its part inside the moving list's item, never as the item itself", () => {
    const item = template.indexOf('v-for="item in section.items"');
    const rowPart = template.indexOf("<TodoRow\n");

    expect(row.startsWith("<li")).toBe(true);
    expect({ afterItem: rowPart > item, insideItem: rowPart < template.indexOf("</li>", item) }).toEqual({ afterItem: true, insideItem: true });
    expect(tagOf("<TodoRow\n")).not.toContain("v-for");
    expect(rowTemplate).not.toContain("<li");
  });

  // What is typed stands in the search box alone, so a keystroke draws the box and no row: the panel reads only the
  // phrase the box hands it.
  test("reads nothing typed into the search box in a binding of its own", () => {
    expect(template).toContain('<TodoSearchBox :reading="pending" :tally="searchTallyLine" @search="onSearch" />');
    expect(bindingsOf(template).filter((binding) => /\bsearch\b/.test(binding))).toEqual([]);
  });
});


describe("the word a row wears", () => {
  const badge = tagOf('<SearchText :text="stateLabel($t, item)"', rowTemplate);
  const badgeTag = rowTemplate.slice(rowTemplate.lastIndexOf("<UBadge", rowTemplate.indexOf('<SearchText :text="stateLabel($t, item)"')), rowTemplate.indexOf('<SearchText :text="stateLabel($t, item)"'));

  test("takes its colour from the one place that decides it", () => {
    expect(badge).toContain('<SearchText');
    expect(badgeTag).toContain(':color="stateColour(item)"');
  });

  test("and none written into the template beside it", () => {
    expect(badgeTag).not.toMatch(/\scolor="/);
  });
});

// No row is told apart as co-work: how a job reaches its steps is its agent's, so no mark, switch or condition says
// it (docs/web.md, the TODO panel's section).
describe("a row's work", () => {
  test("carries no co-work mark, switch or condition", () => {
    expect(template).not.toContain("field_cowork");
    expect(detailTemplate).not.toContain("run_cowork");
    expect(source).not.toContain('key: "cowork"');
  });
});

describe("the queue's live refresh", () => {
  test("uses TODO events, the agency's job events and reopen catch-up without a polling fallback", () => {
    // A job the agency ends takes a reporting row to the finished ones (docs/web.md, the TODO panel's section).
    expect(source).toContain('on: ["todo", "work-order", "worker-run"]');
    expect(source).not.toContain("POLL_INTERVAL_MS");
  });

  // A running row says how far its work order has come, and an order moving a step on announces
  // itself as a work order rather than as a TODO, so the board is re-read on that news too.
  test("re-reads the board when a work order moves a step on", () => {
    expect(source).toMatch(/on: \[[^\]]*"work-order"[^\]]*\]/);
  });

  // The board does not bring back what an open item shows beside its row — the words added to it,
  // and an item a link opened from further back than the page — and a word that the queue moved
  // is as often about one of those: the chat agent adding words to an item, a runner handing them to its job.
  test("re-reads the open item's added words and a linked item on the same news, quietly", () => {
    expect(source).toMatch(/if \(whole\) \{\s*void reload\(\);\s*rereadOpened\(\);/);
    expect(source).toContain("if (opened.value !== null && named.has(opened.value)) detail.value?.reread(opened.value);");
    expect(source).toContain("detail.value?.reread(opened.value);");
    expect(detailSource).toContain("void loadNotes(id, true);");
    expect(source).toContain("void readStray(stray.value.id);");
  });
});

// Words added to an item that already stands. They go to the chat agent, which folds them into the item's
// brief, so what they say on the screen is whose words they are and when they landed, and the box
// that adds one stands with what was said about the item.
describe("the words added to an open item", () => {
  const box = tagOf(`:placeholder="$t('todo.placeholder.note')"`, detailTemplate);

  test("stand on the row with who said each and when", () => {
    expect(tagOf("{{ added.author }}", detailTemplate)).toContain("<span");
    // The moment is drawn by the one function every stamp on this console is drawn by, so the
    // hour reads the same here as it does on the row beside it.
    expect(detailTemplate).toContain("{{ formatStamp(added.addedAt) }}");
    expect(detailTemplate).toContain('<MarkdownText :text="added.text"');
  });

  test("say how many there are the way every count on this console is said", () => {
    expect(detailTemplate).toContain('$t("todo.label.summary_queue", { n: countText(standingNotes.length) })');
    expect(detailTemplate).not.toContain("notes.length }}");
    // What still asks something of the work and what was taken back are counted apart, because
    // only the first of them is what the work is told.
    expect(detailTemplate).toContain('$t("todo.label.notes_count_removed", { n: countText(standingNotes.length), removed: countText(removedNotes.length) })');
  });

  // A word said an hour into the work is sometimes the wrong word, and this is where it is unsaid.
  // The row is marked rather than struck off: the words stay readable as the record of what was
  // asked, and the screen says when they were taken back.
  test("each carries a way to take it back, and one already taken back carries none", () => {
    const button = tagOf(`:aria-label="$t('common.action.delete')"`, detailTemplate);

    expect(button).toContain("confirmingNote = added.id");
    expect(tagOf(`:text="$t('common.action.delete')"`, detailTemplate)).toContain("<UTooltip");
    expect(detailTemplate).toContain('v-if="added.removedAt === null && confirmingNote !== added.id"');
    expect(detailTemplate).toContain('$t("todo.label.removed_at", { time: formatStamp(added.removedAt) })');
    expect(detailTemplate).toContain("line-through");
  });

  // Words a change handed to a running job may carry are in that run's context, and nothing the
  // console does reaches into it. Taking them back keeps them out of every later reading and is the
  // whole of what it does, so the press that cannot be taken back says so before it is made.
  test("the press says first that a word a change already handed to a job may carry stays in that run", () => {
    expect(detailTemplate).toContain('<p v-if="added.carried" class="text-sm text-error">{{ $t("todo.message.note_delivered") }}</p>');
    expect(tagOf(`:label="$t('todo.action.confirm_delete')"`, detailTemplate)).toContain("unappend(openedItem.id, added.id)");
  });

  test("are added from the same open row in the console's writing box, and nothing is added to a finished item", () => {
    expect(box).toContain("<ChatInput");
    expect(box).toContain(':maxlength="APPEND_LIMIT"');
    expect(box).toContain("append(openedItem.id)");
    // The box stands only on an item still open and not merged: an item nobody will pick up again
    // is one the words would reach nobody through, and a merged one's words go to its target.
    expect(box).toContain('v-if="!openedItem.done && openedItem.mergedInto === null"');
  });

  test("stand under the item's instruction, in the tab of what was said, apart from the chat agent's changes", () => {
    const notesAt = detailTemplate.indexOf('>{{ $t("todo.title.notes") }}<');

    expect(notesAt).toBeGreaterThan(detailTemplate.indexOf('<TodoInstruction :item="openedItem" />'));
    expect(notesAt).toBeLessThan(detailTemplate.indexOf('<WorkOrderPanel part="order"'));
    expect(detailTemplate).toContain('<div v-for="added in addedNotes"');
    expect(detailSource).toContain('notes.value.filter((note) => note.kind !== "change")');
  });

  // The brief is the one text a job reads for the item, so the tab of what the work is told opens
  // on it: its rendering in the reader's language where one is held, its original on asking, and the chat agent's
  // changes with whether each was handed to the job running then.
  test("the tab of what the work is told stands the brief and the chat agent's changes above the work order", () => {
    const briefAt = detailTemplate.indexOf('>{{ $t("todo.title.brief") }}<');

    expect(briefAt).toBeGreaterThan(detailTemplate.indexOf('>{{ $t("todo.title.notes") }}<'));
    expect(briefAt).toBeLessThan(detailTemplate.indexOf('<WorkOrderPanel part="order"'));
    // The brief and each change to it stand in the original with the translation a press away in the same place.
    expect(detailTemplate).toContain('<TranslatedText v-else :text="openedItem.instruction" />');
    expect(detailTemplate).toContain('<TranslatedText :text="change.text" />');
    expect(detailTemplate).not.toContain("brief_original");
    expect(detailTemplate).toContain("{{ formatStamp(change.addedAt) }} · {{ changeHanded(change) }}");
    expect(detailSource).toContain('t("todo.status.change_handed", { time: formatStamp(change.deliveredAt) })');
  });

  // The chat agent answers when its session's turn comes, so the answer arrives as news of the talk moving,
  // and only the open item's news is this panel's to read.
  test("the talk beneath them is read again when the bot says the open item's talk moved", () => {
    expect(detailSource).toContain('on: ["todo-talk"]');
    expect(detailSource).toContain('event.type === "todo-talk" && event.todoId === opened.value');
    expect(detailTemplate).toContain('common.status.bmo_answering');
  });
});

// The edge this panel stands against, and how many lines are drawn down it. One boundary is one
// line, and here it is this panel's own leading border, drawn open and folded alike. The page
// stands in a box of its own beside the panel, so a page's panel never has the queue for a
// sibling; it draws its trailing edge only while some element follows it in that box, and the
// layout keeps the page last there so that it never does. A second line beside the queue's would
// read as one line twice as thick, which nothing a test that counts elements would notice, and no
// line at all is the boundary gone in both themes.

const layout = await Bun.file(new URL("../../../apps/web/app/layouts/default.vue", import.meta.url)).text();

// The class list of the aside in each of its two shapes: folded to a strip, and standing open.
function asideClasses(mark: string): string[] {
  return tagOf(mark)
    .split(/class="/)
    .slice(1)
    .flatMap((part) => part.slice(0, part.indexOf('"')).split(/\s+/));
}

describe("the edge the queue stands against", () => {
  test("there is a template to read, so nothing below passes on an empty string", () => {
    expect(template).toContain('todo.aria.panel_width');
    expect(template).toContain('todo.action.panel_expand');
  });

  test("the panel draws its own leading edge, open or folded", () => {
    for (const shape of ["props.place === 'aside' && collapsed", "props.place === 'aside' ? 'hidden shrink-0"]) {
      const classes = asideClasses(shape);

      expect({ shape, drawn: classes.includes("border-s") && classes.includes("border-default") }).toEqual({ shape, drawn: true });
    }
  });

  test("and the page beside it stays the last of its box, so it draws no second line", () => {
    // Anything standing after the page in its box would make the page's panel a not-last child, which
    // draws its trailing edge.
    expect(layout).toMatch(/<BundleScreenFrame>\s*<slot \/>\s*<\/BundleScreenFrame>\s*<TodoPanel place="aside" \/>/);
  });

  test("the line inside the handle is nothing at all until a drag begins", () => {
    // Painted at rest it would either double the boundary or, in the background's own colour,
    // rub it out. Its whole job is to light the boundary while the edge is being carried.
    const strip = tagOf('dragging ? \'bg-primary\'');

    expect(strip).toContain("w-px");
    expect(strip).not.toContain("bg-default");
    expect(strip).toContain("dragging ? 'bg-primary' : ''");
  });

  test("and it lies on that boundary rather than beside it", () => {
    // The handle straddles the edge, so a line whose far side is the handle's own midline covers
    // the panel's border exactly. Centred in the handle instead, it would sit a pixel off it.
    const strip = tagOf('dragging ? \'bg-primary\'');

    expect(strip).toContain("end-1/2");
    expect(strip).not.toContain("mx-auto");
  });
});

// The owner's switch on the auto-progression. What it holds is the calling of the next item, so
// the panel has to say it is off without being opened or scrolled: the button that throws it
// stands in the header beside the refresh button, a strip stands under the header while it is off, and
// even a panel folded away carries the word.
describe("the auto-progression switch", () => {
  const button = tagOf('@click="switchPause(!board.paused)"');

  test("one button throws it, and reads as what pressing it would do", () => {
    expect(button).toContain(":aria-label=\"board.paused ? $t('todo.action.auto_resume') : $t('todo.action.auto_pause')\"");
    expect(template).toContain("<UTooltip :text=\"board.paused ? $t('todo.action.auto_resume') : $t('todo.action.auto_pause')\">");
    expect(button).toContain(":icon=\"board.paused ? 'i-material-symbols-play-arrow' : 'i-material-symbols-pause'\"");
    expect(button).toContain('@click="switchPause(!board.paused)"');
  });

  test("the strip stands only while it is off, and carries the resume in it", () => {
    // The strip is the row the sentence and the resume both stand in, so it is read by a mark in
    // its own opening tag rather than by the sentence, which sits in a child of it.
    const strip = tagOf("bg-warning/10");

    expect(strip).toContain('v-if="board.paused"');
    expect(template).toContain('>{{ $t("todo.action.auto_pause") }}<');
    expect(template).toContain('@click="switchPause(false)"');
  });

  test("a folded panel says it too, since a folded panel is where it would be missed", () => {
    const folded = tagOf('TODO {{ loaded ? summary : $t("common.status.loading") }}');

    expect(folded).toContain("[writing-mode:vertical-rl]");
    expect(template).toContain('<template v-if="board.paused"> · {{ $t("todo.status.paused_suffix") }}</template>');
  });

  test("the press goes to the bot, and a refusal is said in the message pill", () => {
    expect(source).toContain('$fetch<QueuePauseChanged>("/api/queue-pause", { method: "POST", body: { paused } })');
    expect(source).toContain('island.fail(error, t("todo.error.auto_change_failed"))');
  });

  // A word naming the one item it moved reads that item's line alone (docs/web.md, the TODO panel's section): the
  // panel gathers the items a burst named, and a burst with a word naming none, or a stream come back, reads whole.
  test("reads the lines a burst named, and the whole board only where a word named none", () => {
    expect(source).toContain("const whole = namedAll || cause !== \"event\" || named.size === 0;");
    expect(source).toContain("void readRows([...named]);");
    expect(source).toContain('$fetch<TodoBoardRow[]>("/api/todos/rows", { query: { ids: ids.join(",") } })');
    expect(source).toContain("const next = rows.length === ids.length ? patchedBoard(board.value, rows) : null;");
  });

  test("nothing new is subscribed to for it: the queue's own news already re-reads the board", () => {
    // The panel has the one subscription; its dialog's is the open item's talk, which is no news
    // of the board.
    expect(source.match(/useLiveRefresh\(/g)?.length).toBe(1);
    expect(source.match(/on: \[[^\]]*"todo"[^\]]*\]/g)).toEqual(['on: ["todo", "work-order", "worker-run"]']);
    expect(detailSource.match(/useLiveRefresh\(/g)?.length).toBe(1);
    expect(detailSource).toContain('on: ["todo-talk"]');
  });
});

// The deployment's hold is a state of its own beside the owner's pause. Its band says which Jobs' end the
// batch goes up after, and pressing it opens the title bar's deployment popover, the one place the
// hold stands whole and is let go; the panel keeps no window of its own repeating it, and the resume
// in the pause's band never reaches it.
const mark = await Bun.file(new URL("../../../apps/web/app/components/DeployMark.vue", import.meta.url)).text();

describe("the deployment's hold", () => {
  test("stands in a band of its own while it holds, saying the mark's own words", () => {
    const band = tagOf('v-if="board.deployHold !== null" class=');

    expect(band).toContain("bg-warning/10");
    expect(template).toContain('@click="openDeploy"');
    expect(template).toContain("{{ holdSummary }}");
    expect(source).toContain('`${t("deploy.status.hold")} · ${holdWaits(t, hold)}`');
    expect(template).toContain('<template v-if="board.deployHold !== null"> · {{ $t("todo.status.deploy_hold_suffix") }}</template>');
  });

  test("opens the title bar's popover rather than a window of its own", () => {
    expect(template).not.toContain("holdOpen");
    expect(template).not.toContain("todo.label.deploy_hold_");
    expect(source).toContain('const deployOpen = useState<boolean>("deploy-open", () => false);');
    expect(mark).toContain('const open = useState<boolean>("deploy-open", () => false);');
  });

  test("is let go in the popover, asked first in a dialog, and never by the resume", () => {
    expect(mark).toContain("await askFirst({");
    expect(mark).toContain('effect: t("todo.message.release_hold_effect")');
    expect(mark).toContain('$fetch("/api/deploy-hold-release", { method: "POST" })');
    expect(mark).toContain('@click="releaseHold"');
    expect(template).not.toContain("releaseHold");
    // The band names the hold that still stands, so a resume adds no notice of its own.
    expect(source).not.toContain("todo.message.auto_");
  });
});

// A row's detail is read over the list rather than inside it. The panel is a column of fixed
// width standing beside a page, and what one row carries — an instruction, an account, a talk,
// and every button that acts on it — is longer than that column: opening it under the row
// pushed the rest of the queue off the screen. So it is read the way every long thing in this
// console is read, in the shape the other dialogs use, and the mechanisms that make a dialog
// behave — the scroll inside a fixed shell, and the back gesture — are the ones they use too.
const workOrder = await Bun.file(new URL("../../../apps/web/app/components/WorkOrderPanel.vue", import.meta.url)).text();

describe("the detail of a row", () => {
  const dialog = tagOf('v-if="shows"', detailTemplate);

  test("stands in a dialog and no longer inside the list", () => {
    expect(dialog).toContain("narrow ? UDrawer : UModal");
    expect(detailTemplate).toContain("<template #content>");
    // The row itself holds nothing but the row: the branch that drew the detail under it is
    // gone, and what it drew now reads the one row the dialog is on.
    expect(template).not.toContain('v-if="opened === item.id"');
    expect(detailTemplate).toContain('v-if="openedItem !== null"');
  });

  test("is a sheet on a narrow screen and a modal on a wide one, at the heights the others use", () => {
    expect(detailSource).toContain('ui: { content: "h-[92dvh]" }');
    expect(detailSource).toContain('ui: { content: "max-w-3xl h-[80dvh] lg:max-w-[min(96vw,88rem)] lg:h-[90dvh]" }');
    expect(detailSource).toContain('direction: "bottom" as const');
  });

  test("carries the row in its head and a way out of it", () => {
    expect(detailTemplate).toContain("#{{ openedItem?.id }}");
    expect(detailTemplate).toContain("{{ openedItem?.title }}");
    expect(tagOf(`:aria-label="$t('common.action.close')"`, detailTemplate)).toContain("@click=\"detailOpen = false\"");
  });

  // A set-aside row opens like any other: its dialog is where it is thrown away or let back into
  // the queue, and a stopped order held there says where it stands in that dialog's order panel.
  test("reads the row it opens out of every list the board holds, the set-aside one included", () => {
    const lookup = source.slice(source.indexOf("function boardItem"), source.indexOf("\n}", source.indexOf("function boardItem")));

    for (const list of ["queue", "pending", "held", "done"]) {
      expect(lookup).toContain(`board.value.${list}`);
    }
  });

  test("scrolls inside itself, so no length of detail pushes it past the window", () => {
    expect(detailTemplate).toContain("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain");
    expect(detailTemplate).toContain(`class="flex min-h-0 flex-1 flex-col gap-2 overscroll-contain px-4 py-3" :class="shownRight === 'talk' ? 'overflow-hidden' : 'overflow-y-auto'"`);
  });

  test("holds no scroll inside its scroll: a report, a note and the talk's column stand whole", () => {
    expect(detailTemplate).not.toContain("max-h-96 overflow-auto");
    expect(detailTemplate).not.toContain("max-h-64 overflow-auto");
    expect(detailTemplate).toContain('ref="talkList" class="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain"');
  });

  // What is done about an outstanding note is written against the words themselves, so both boxes
  // stand in the status tab beside them; the manage tab keeps nothing about the note, and a
  // finished item's manage tab says so.
  test("writes about an unfinished note where the note is read, and leaves management nothing of it", () => {
    const result = detailTemplate.slice(detailTemplate.indexOf(`v-if="shownLeft === 'result'"`), detailTemplate.indexOf(`v-else-if="shownLeft === 'conversation'"`));
    const manage = detailTemplate.slice(detailTemplate.lastIndexOf('v-else-if="openedItem !== null"'));

    expect(result).toContain(`:aria-label="$t('todo.aria.resolve_reason')"`);
    expect(result).toContain('<div v-if="raising.has(openedItem.id)"');
    expect(result).not.toContain("todo.action.create_item");
    for (const key of keysSaying(KO.line_437)) {
      expect(manage).not.toContain(key);
    }
    expect(manage).toContain('todo.status.done_nothing_to_do');
  });

  // A dialog takes half a second to slide away, and one that empties itself the moment it is
  // dismissed slides away as a blank frame.
  test("keeps what it was reading until it is off the screen", () => {
    expect(detailSource).toContain("const openedItem = useHeldWhileClosing(() => props.item)");
  });

  test("names itself TODO in its head and leaves the counts to the tabs", () => {
    expect(template).toContain('<h2 class="shrink-0 text-base font-semibold text-highlighted">TODO</h2>');
    expect(source).toContain("filterCount(shownBoard.value, choice)");
  });

  test("offers no other order than the queue's, and says nothing about a filter taking the handles away", () => {
    expect(source).not.toContain("view.sort");
    for (const key of keysSaying(KO.line_456)) {
      expect(source).not.toContain(key);
    }
  });

  // Both panels are mounted while a narrow screen is being read — the aside is hidden by a
  // class rather than unmounted — and a dialog is teleported out of the layout it was written
  // in. Two of them would stand on the screen at once, and each would push its own entry onto
  // the back stack, so one press of back would close neither.
  test("is drawn by the one panel a person is actually reading", () => {
    expect(source).toContain('props.place === "aside" ? wideEnoughForAside.value : !wideEnoughForAside.value');
    expect(template).toContain(':shows="showsDetail"');
  });

  // Closing goes through the one place that lets go of the row: whichever way it is dismissed,
  // the address stops naming the row and the boxes are emptied exactly once.
  test("lets go of the row the same way however it was dismissed", () => {
    expect(detailSource).toContain('emit("close")');
    expect(template).toContain('@close="dismiss"');
    expect(source).toContain("toggle(opened.value)");
  });

  // The back gesture reaches both dialogs through the library's own layers, which the overlays
  // watch registers on its own; neither registers itself a second time.
  test("leaves the back gesture to the overlays watch, for its own dialog and the work order's", () => {
    expect(source).not.toContain("useBackClose(");
    expect(detailSource).not.toContain("useBackClose(");
    expect(workOrder).not.toContain("useBackClose(");
  });
});

// The owner's stop, beside the hold: offered while something of the item is in flight, pressed only
// with a reason, and sent as the stop verb with that reason (docs/web.md).
describe("stopping an opened item", () => {
  test("stands only where the item can be stopped, and waits for a reason", () => {
    expect(tagOf('v-if="canStop(openedItem)"', detailTemplate)).toContain("border-t");
    const button = tagOf(`:label="$t('todo.action.stop')"`, detailTemplate);
    expect(button).toContain(":disabled=\"stopWhy.trim() === ''\"");
    expect(button).toContain('@click="stop(openedItem.id)"');
    expect(tagOf(`:aria-label="$t('todo.label.stop_reason')"`, detailTemplate)).toContain(":maxlength=\"STOP_REASON_LIMIT\"");
  });

  test("posts the stop verb with the trimmed reason and clears the box once it lands", () => {
    expect(detailSource).toContain('if (await act(id, "stop", { why: reason }, undefined, (said) => (stopFailure.value = said))) stopWhy.value = "";');
    expect(detailSource).toContain("const reason = stopWhy.value.trim();");
    expect(detailSource).toContain('stopWhy.value = "";');
  });

  test("a held item says which kind of hold it is and why", () => {
    expect(detailTemplate).toContain("heldLine($t, openedItem, formatStamp)");
    for (const key of ["todo.label.held_since", "todo.label.held_since_reason"]) {
      expect(detailTemplate).not.toContain(key);
    }
  });
});

// An item that has ended is opened to read how it ended, so what the closing job wrote stands on
// the left row's first tab, which is there only where there is something to put on it, and is the
// one opened with.
describe("the result of an item", () => {
  const result = detailTemplate.slice(detailTemplate.indexOf(`v-if="shownLeft === 'result'"`), detailTemplate.indexOf(`v-else-if="shownLeft === 'conversation'"`));
  const status = detailTemplate.slice(detailTemplate.indexOf(`<template v-if="shownRight === 'status'">`), detailTemplate.indexOf(`v-else-if="shownRight === 'talk'"`));

  test("stands every report and the unfinished note, with what is done about it, in the result tab and nowhere else", () => {
    for (const mark of ['v-for="report in shownReports"', "unfinishedLabel($t, openedItem)", "todo.label.resolved_at", "resolve(openedItem.id)", "raise(openedItem.id)"]) {
      expect(result).toContain(mark);
      expect(status).not.toContain(mark);
      expect(detailTemplate.split(mark).length).toBe(2);
    }
  });

  // A new item raised out of the note is the dialog's one add, so it stands just before the close mark as the
  // layer's contained create button, which never floats and answers no key, and only where there is a note to raise
  // from: on the title's line of a narrow dialog, at the form block's top right on a wide one, never both.
  test("raises a new item from the head's contained create button, which brings the result forward with its form", () => {
    const head = detailTemplate.slice(0, detailTemplate.indexOf("<!-- The body is two parts"));
    const narrow = head.slice(0, head.indexOf("data-item-state"));
    const wide = head.slice(head.indexOf('v-if="openedItem !== null && twoColumns"'));
    const raising = detailSource.slice(detailSource.indexOf("function startRaise("), detailSource.indexOf("// The notes he may name"));

    expect(narrow).toContain('<UTheme v-if="openedItem !== null && openedItem.unfinished !== null && !twoColumns" :props="ROW_BUTTONS">');
    expect(wide).toContain('<UTheme v-if="openedItem.unfinished !== null" :props="ROW_BUTTONS">');
    for (const part of [narrow, wide]) {
      const button = tagOf("<CreateButton", part);

      expect(button).toContain(" contained ");
      expect(button).toContain(`:label="$t('todo.action.create_item')"`);
      expect(button).toContain('@click="startRaise(openedItem.id)"');
      expect(button).not.toContain("shortcut");
      expect(part.indexOf("<CreateButton")).toBeLessThan(part.indexOf("common.action.close"));
    }
    expect(detailTemplate.split("todo.action.create_item").length).toBe(3);
    expect(raising).toContain('leftTab.value = "result"');
    expect(raising).toContain('singleTab.value = "result"');
    expect(raising).toContain("raiseTitleBox.value?.inputRef?.focus()");
    expect(result).toContain('ref="raiseTitleBox"');
  });

  test("the tabs stand in one order across both columns: result, state, instruction, the request, then the talk and management", () => {
    const left = detailSource.slice(detailSource.indexOf("const BODY_TABS = ["), detailSource.indexOf("const RIGHT_TABS = ["));
    const right = detailSource.slice(detailSource.indexOf("const RIGHT_TABS = ["), detailSource.indexOf("const hasResult"));

    expect([...left.matchAll(/value: "([a-z]+)"/g)].map((one) => one[1])).toEqual(["status", "order", "conversation"]);
    expect(left).toContain('t("todo.label.request_text")');
    expect([...right.matchAll(/value: "([a-z]+)"/g)].map((one) => one[1])).toEqual(["talk", "manage"]);
    expect(right).toContain('t("todo.label.discussion")');
    expect(detailSource).toContain("const detailTabs = computed(() => [...leftTabs.value, ...RIGHT_TABS]");
    expect(detailSource).toContain('rightTab.value = "talk";');
  });

  test("the state tab stands the item's last job as its runs read it, whether that job runs or has ended", () => {
    expect(detailTemplate).toContain('<ItemRunFigures :job="lastJob" :running="openedItem.running" />');
  });

  test("is the left row's first tab, on an item carrying a report or an unfinished note alone, and is the tab it opens on", () => {
    expect(detailSource).toContain("const hasResult = computed(() => openedItem.value !== null && (shownReports.value.length > 0 || openedItem.value.unfinished !== null));");
    expect(detailSource).toContain("...(hasResult.value ? [RESULT_TAB] : []), ...(reviews.value.length > 0 ? [reviewTab.value] : []), ...BODY_TABS");
    expect(detailSource).toContain('(props.item.reports.length > 0 || props.item.unfinished !== null) ? "result" : "status"');
    expect(tagOf(':items="leftTabs"', detailTemplate)).toContain('v-model="leftTab"');
    expect(tagOf(':items="detailTabs"', detailTemplate)).toContain('v-model="singleTab"');
  });

  test("every report stands whole, headed by its kind, its moment and who wrote it, the closing one first", () => {
    const report = tagOf('v-for="report in shownReports"', result);

    expect(report).toContain('data-report');
    expect(result).toContain("$t(REPORT_KIND_LABELS[report.kind])");
    expect(result).toContain("formatStamp(report.at)");
    expect(result).toContain("report.actor");
    expect(result).toContain('<TranslatedText :text="report.body" class="mt-1" />');
    expect(result).not.toContain("UCollapsible");
    expect(detailSource).toContain("$fetch<TodoReport[]>(`/api/todos/${id}/reports`)");
    expect(detailSource).toContain("void loadReports(id, true);");
  });

  test("the row's report mark stands for any report, with how many where more than one", () => {
    expect(rowTemplate).toContain('<UTooltip v-if="item.reports.length > 0" :text="reportsTip($t, item.reports)">');
    expect(rowTemplate).toContain('<template v-if="item.reports.length > 1">{{ countText(item.reports.length) }}</template>');
  });

  test("carries no box inside the unfinished note's box: the resolution stands under a line", () => {
    expect(tagOf('v-if="openedItem.unfinishedResolvedAt !== null"', result)).toContain("border-t");
    expect(tagOf('v-if="openedItem.unfinishedResolvedAt !== null"', result)).not.toContain("rounded");
  });
});

// The model chip and the agent chooser (docs/web.md, the TODO panel's section): the chip names the road on the line
// and in the opened item's form block and is pressed nowhere; whom an item names is chosen in the form block, any agent
// the agency registers or a model its role's agents run, its pick sent as the `agent` or the `model` verb.
const assignSource = await Bun.file(new URL("../../../apps/web/app/components/TodoAssignFields.vue", import.meta.url)).text();
const assignTemplate = assignSource.slice(0, assignSource.indexOf("<script"));
const chip = await Bun.file(new URL("../../../apps/web/app/components/ItemModelChip.vue", import.meta.url)).text();
const agentChip = await Bun.file(new URL("../../../apps/web/app/components/ItemAgentChip.vue", import.meta.url)).text();

describe("the model chip and the agent chooser", () => {
  const chipTemplate = chip.slice(0, chip.indexOf("<script"));
  const agentTemplate = agentChip.slice(0, agentChip.indexOf("<script"));
  const agentScript = agentChip.slice(agentChip.indexOf("<script"));

  test("the chip names the road on the line and in the form block and is pressed nowhere", () => {
    // On the line a tap opens the item, so a finger rests on the chip to read its tooltip; in the form block a tap reads it.
    expect(rowTemplate).toContain('<ItemModelChip :item="item" :query="query" press />');
    expect(chipTemplate).toMatch(/<HintTip [^>]*:press="props.press">/);
    expect(assignTemplate).toContain('<ItemModelChip v-if="itemModel(props.ranItem ?? props.item) !== null" :item="props.ranItem ?? props.item" />');
    // Where no road is named yet the cell says so, as the agent's does, rather than standing empty.
    expect(assignTemplate).toContain(`{{ $t("todo.label.model_unnamed") }}`);
    expect(chipTemplate).not.toContain("<ChoiceSelect");
    expect(chipTemplate).toMatch(/<UBadge[^>]*data-item-model/);
    expect(chip).toContain("itemModelTip(t, props.item)");
  });

  test("the agent is chosen in the form block among every agent the agency registers, grouped by role, with no automatic choice", () => {
    expect(assignTemplate).toContain('<ItemAgentChip');
    expect(assignTemplate).toContain(':editable="!props.item.done && props.item.mergedInto === null"');
    expect(agentTemplate).toContain('<ChoiceSelect\n    v-else-if="props.editable"');
    expect(agentScript).toContain('$fetch<RolesView>("/api/roles")');
    expect(agentScript).not.toContain("AUTO");
    expect(agentTemplate).toContain(":placeholder=\"$t('todo.label.agent_unnamed')\"");
    // The line names the agent its work runs on: the running job's own, else the one the item names, else the role
    // whose free agent on its model takes it.
    expect(rowTemplate).toContain('data-item-agent-named>{{ itemAgent(item) }}');
    expect(rowTemplate).toMatch(/<HintTip v-else-if="itemFreeAgent\(item\) !== null"[^>]*press>\s*<UBadge[^>]*data-item-agent-free>/);
  });

  test("while a job runs the form block stands the agent it runs on, read and not chosen", () => {
    expect(agentTemplate).toMatch(/<HintTip v-if="running !== null"[^>]*>\s*<UBadge[^>]*data-item-agent-running>\{\{ running \}\}/);
    expect(agentScript).toContain("props.item.jobAgent ?? null");
  });

  test("sends its pick as the agent or the model verb from the form block", () => {
    expect(detailSource).toContain('await act(id, "agent", { agent: assignment.agent }, "todo.error.agent_change_failed");');
    expect(detailSource).toContain('await act(id, "model", { model: assignment.model, role: assignment.role ?? undefined }, "todo.error.agent_change_failed");');
    expect(assignTemplate).toContain(`@pick="(assignment: ItemAssignment) => emit('agent', assignment)"`);
    expect(detailTemplate).toContain('@agent="(chosen: ItemAssignment) => void setAgent(openedItem!.id, chosen)"');
  });
});
