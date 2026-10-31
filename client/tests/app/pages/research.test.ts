import { describe, expect, test } from "bun:test";

// The research screen as it ships (docs/web.md, 「Research screen」): its categories with their stop and resume, its
// queue narrowed by category and state and read newest first, an ask with its words and, for a follow-up, its parent,
// where each item came from, a dismissal asked once first, and an item's run
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
const origin = await read("./components/ResearchOriginLine.vue");
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
    expect(templateOf(page)).toContain("<template v-if=\"!failedFirst && tab === 'queue'\">");
  });

  test("narrows the queue by category and state, and stands what it read in the queue's order", () => {
    expect(templateOf(page)).toContain(':aria-label="$t(\'research.aria.category_filter\')"');
    expect(templateOf(page)).toContain(':aria-label="$t(\'research.aria.state_filter\')"');
    expect(scriptOf(page)).toContain("const shown = computed(() => queueOrder(items.value ?? []));");
  });

  test("stands the queue and the sources on two tabs, the tab in the address and its add at the row's end", () => {
    expect(templateOf(page)).toContain('<UTabs\n          :model-value="tab"\n          :items="tabItems"');
    expect(templateOf(page)).toContain("<template v-if=\"!failedFirst && tab === 'queue'\">");
    expect(templateOf(page)).toContain("<ResearchSources v-if=\"!failedFirst && tab === 'sources'\" ref=\"sourcesRef\"");
    expect(templateOf(page)).toContain('@click="sourcesRef?.openAdd()"');
    expect(templateOf(page)).toContain(':aria-label="$t(\'research.title.ask\')"');
    expect(scriptOf(page)).toContain('void router.push({ query: { ...route.query, tab: next === "queue" ? undefined : next } });');
    expect(templateOf(sources)).not.toContain("research-sources-title");
  });

  test("reads the queue's next page as its foot comes into view, with no button asking for more", () => {
    expect(templateOf(page)).not.toContain("common.action.more");
    expect(templateOf(page)).toContain('<div v-if="items !== null" ref="foot">');
    expect(templateOf(page)).toContain('<ContentSkeleton v-if="adding" :rows="2"');
    expect(scriptOf(page)).toContain('const atFoot = useFootInView(foot, queueReading, { rootMargin: "200px" });');
    expect(scriptOf(page)).toContain("more: () => more.value && queueError.value === null,");
    expect(scriptOf(page)).toContain("busy: () => queueReading.value,");
  });

  test("says the queue has ended only once it took more than one page", () => {
    expect(templateOf(page)).toContain('<p v-else-if="!more && wanted > PAGE && shown.length > 0"');
    expect(templateOf(page)).toContain('$t("research.status.queue_end")');
  });

  test("asks once in a dialog naming the item before a dismissal", () => {
    expect(scriptOf(page)).toContain('await askFirst({ title: t("research.message.dismiss_confirm"), item: item.name, effect: t("research.message.dismiss_note"), confirm: t("research.action.dismiss") });');
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

  test("says where it came from, and the same in its run sheet", () => {
    expect(templateOf(row)).toContain('<ResearchOriginLine :origin="props.item.origin" />');
    expect(templateOf(sheet)).toContain('<ResearchOriginLine v-if="props.origin !== null" :origin="props.origin" />');
    expect(templateOf(page)).toContain(':origin="runShown?.origin ?? null"');
    expect(templateOf(origin)).toContain(':href="line.link" target="_blank" rel="noopener noreferrer"');
  });

  test("offers a follow-up once it has filed a document, opening the ask as that item's follow-up", () => {
    expect(templateOf(row)).toContain('<UTooltip v-if="followable"');
    expect(scriptOf(row)).toContain("const followable = computed(() => props.item.documentId !== null);");
    expect(templateOf(page)).toContain('@follow-up="openAsk(followOfItem(item))"');
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
    expect(scriptOf(dialog)).toContain('$fetch<ResearchItem>("/api/research/queue", { method: "POST", body: {');
    expect(templateOf(dialog)).toContain('<p v-if="refusal !== null" role="alert"');
  });

  test("takes the owner's optional words for why, and carries them with the parent a follow-up follows from", () => {
    expect(templateOf(dialog)).toContain(':label="$t(\'research.label.because\')" :hint="$t(\'common.label.optional\')"');
    expect(templateOf(dialog)).toContain("$t(props.follows === null ? 'research.title.ask' : 'research.title.follow_up')");
    expect(scriptOf(dialog)).toContain("body: { ...draft.value, ...followFields(props.follows, because.value) }");
  });

  test("opens as a follow-up of the document the address names, and takes the number out once closed", () => {
    expect(scriptOf(page)).toContain("const follow = followOfAddress(named);");
    expect(scriptOf(page)).toContain("void router.replace({ query: { ...route.query, follows: undefined } });");
  });
});

describe("the sources", () => {
  test("stand on a tab of their own, the table the unit answers them in", () => {
    expect(templateOf(page)).toContain('ref="sourcesRef" :categories="stateView?.categories ?? []" :quiet="failing" />');
    expect(scriptOf(sources)).toContain('useFetch<{ items: ResearchSource[] }>("/api/research/sources"');

    for (const column of ["#target-cell", "#filter-cell", "#everyMinutes-cell", "#limit-cell", "#readAt-cell", "#failureCount-cell", "#actions-cell"]) {
      expect(templateOf(sources)).toContain(column);
    }
  });

  test("ask once in a dialog before a source is taken away", () => {
    expect(scriptOf(sources)).toContain("const taken = await askFirst({");
    expect(scriptOf(sources)).toContain('title: t("research.message.source_delete_confirm", { id: source.id })');
    expect(scriptOf(sources)).toContain('{ method: "DELETE" }');
  });

  test("register with the category and kind, and change only what differs", () => {
    expect(templateOf(sourceDialog)).toContain('<div v-if="props.source === null" class="grid gap-4 sm:grid-cols-2">');
    expect(scriptOf(sourceDialog)).toContain('$fetch<ResearchSource>("/api/research/sources", { method: "POST", body: newSource() })');
    expect(scriptOf(sourceDialog)).toContain("{ method: \"PATCH\", body: changed }");
  });
});
