import { describe, expect, test } from "bun:test";

// The research screen as it ships (docs/web.md, 「Research screen」): its categories with their stop and resume, its
// queue narrowed by category and state and read newest first, an ask, a dismissal asked once first, and an item's run
// opening in a sheet over the list, read again on its clock while it has not closed, and the sources registered,
// changed and taken away. The words and values are the
// domain's (domain/research.test.ts) and the calls the server's (server/api/research.test.ts); these checks hold the
// screen to what the document promises.

const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const page = await read("./pages/research.vue");
const categories = await read("./components/ResearchCategories.vue");
const row = await read("./components/ResearchItemRow.vue");
const sheet = await read("./components/ResearchRunSheet.vue");
const dialog = await read("./components/ResearchAskDialog.vue");
const sources = await read("./components/ResearchSources.vue");
const sourceDialog = await read("./components/ResearchSourceDialog.vue");

describe("the research screen", () => {
  test("stands in the reading column, releasing no width", () => {
    expect(templateOf(page)).toContain('<UDashboardPanel id="research">');
    expect(page).not.toContain("max-w-none");
  });

  test("reads the state and the queue at its own routes, again on its clock while the tab is seen", () => {
    expect(scriptOf(page)).toContain('useFetch<ResearchStateView>("/api/research/state"');
    expect(scriptOf(page)).toContain('$fetch<ResearchQueuePage>("/api/research/queue", { query })');
    expect(scriptOf(page)).toContain("const POLL_MS = 10_000;");
    expect(scriptOf(page)).toContain('if (document.visibilityState === "visible") rereadAll();');
  });

  test("says a unit that does not answer as one failure with its reread, and draws nothing else before a first read", () => {
    expect(templateOf(page)).toContain('<ReadFailure :failure="readFailure" :message="failureMessage" :reading="reading" @retry="rereadAll()" />');
    expect(templateOf(page)).toContain('<template v-if="!failedFirst">');
  });

  test("narrows the queue by category and state, and stands what it read newest first", () => {
    expect(templateOf(page)).toContain(':aria-label="$t(\'research.aria.category_filter\')"');
    expect(templateOf(page)).toContain(':aria-label="$t(\'research.aria.state_filter\')"');
    expect(scriptOf(page)).toContain("const shown = computed(() => newestFirst(items.value ?? []));");
  });

  test("asks once in the message pill before a dismissal", () => {
    expect(scriptOf(page)).toContain('island.ask({ title: t("research.message.dismiss_confirm")');
    expect(scriptOf(page)).toContain('{ method: "PATCH", body: { state: "dismissed" } }');
  });
});

describe("the categories", () => {
  test("change one category or every one through the state route", () => {
    expect(templateOf(categories)).toContain("emit('change', category.name, category.state === 'running' ? 'stopped' : 'running')");
    expect(templateOf(categories)).toContain("emit('change', null, loopRunning ? 'stopped' : 'running')");
    expect(scriptOf(page)).toContain('$fetch<ResearchStateView>("/api/research/state", { method: "PATCH"');
  });

  test("stand each hold under the categories it names", () => {
    expect(templateOf(categories)).toContain('v-for="hold in holdsOf(props.view.holds, category.name)"');
  });
});

describe("an item", () => {
  test("opens its run from its name where it has one", () => {
    expect(templateOf(row)).toContain('v-if="props.item.runId !== null"');
    expect(templateOf(row)).toContain("@click=\"emit('open-run')\"");
  });

  test("links its document and its maker in a new tab, and offers dismissal only where the unit takes it", () => {
    expect(templateOf(row)).toContain(':href="documentLink" target="_blank" rel="noopener noreferrer"');
    expect(templateOf(row)).toContain(':href="link" target="_blank" rel="noopener noreferrer"');
    expect(templateOf(row)).toContain('v-if="dismissible(props.item.state)"');
  });
});

describe("the run sheet", () => {
  test("is a sheet over the list, reading the run with its log", () => {
    expect(templateOf(sheet)).toContain("<USlideover");
    expect(scriptOf(sheet)).toContain("$fetch<ResearchRunDetail>(`/api/research/runs/${runId}`)");
  });

  test("reads again every three seconds while the run has not closed", () => {
    expect(scriptOf(sheet)).toContain("const POLL_MS = 3_000;");
    expect(scriptOf(sheet)).toContain("runOpen(detail.value.run.state)");
  });
});

describe("the ask", () => {
  test("posts the category, the name and the address, and keeps the unit's refusal under the dialog", () => {
    expect(scriptOf(dialog)).toContain('$fetch<ResearchItem>("/api/research/queue", { method: "POST", body: draft.value })');
    expect(templateOf(dialog)).toContain('<p v-if="refusal !== null" role="alert"');
  });
});

describe("the sources", () => {
  test("stand last on the screen, the table the unit answers them in", () => {
    expect(templateOf(page)).toContain('<ResearchSources :categories="stateView?.categories ?? []" :quiet="failing" />');
    expect(scriptOf(sources)).toContain('useFetch<{ items: ResearchSource[] }>("/api/research/sources"');

    for (const column of ["#target-cell", "#filter-cell", "#everyMinutes-cell", "#limit-cell", "#readAt-cell", "#failureCount-cell", "#actions-cell"]) {
      expect(templateOf(sources)).toContain(column);
    }
  });

  test("ask once before a source is taken away", () => {
    expect(scriptOf(sources)).toContain('title: t("research.message.source_delete_confirm", { id: source.id })');
    expect(scriptOf(sources)).toContain('{ method: "DELETE" }');
  });

  test("register with the category and kind, and change only what differs", () => {
    expect(templateOf(sourceDialog)).toContain('<div v-if="props.source === null" class="grid gap-4 sm:grid-cols-2">');
    expect(scriptOf(sourceDialog)).toContain('$fetch<ResearchSource>("/api/research/sources", { method: "POST", body: newSource() })');
    expect(scriptOf(sourceDialog)).toContain("{ method: \"PATCH\", body: changed }");
  });
});
