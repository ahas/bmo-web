import { describe, expect, test } from "bun:test";

// The draft-process table on the tier tab (docs/web.md, the tier tab's draft-process table), read from the files
// that ship: what a rendered screen would not name is where each cell's value goes, that a set carries the whole row,
// that only the console's own rows can be taken away, and that refusals are the pack's sentences.

const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/components/", import.meta.url))).text();
const source = await read("./AgentsDraftProcesses.vue");
const list = await read("./DraftListCell.vue");
const page = await Bun.file(new URL("../../../apps/web/app/pages/agents/index.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
const script = source.slice(source.indexOf("<script"));
const listTemplate = list.slice(0, list.indexOf("<script"));

describe("the table", () => {
  test("stands on the tier tab under the co-worker table, read by the browser alone under the key the search reads", () => {
    expect(page.indexOf("<AgentsDraftProcesses")).toBeGreaterThan(page.indexOf("<AgentsCoworkerLimits"));
    expect(script).toContain('useFetch<DraftProcessesView>("/api/draft-processes", { key: "draft-processes", server: false, lazy: true })');
    expect(page).toContain('useFetch<DraftProcessesView>("/api/draft-processes", { key: "draft-processes", lazy: true, server: false })');
  });

  test("is a row per key with a column for each value and where it comes from", () => {
    for (const id of ['accessorKey: "provider"', 'accessorKey: "tier"', 'accessorKey: "agentName"', 'id: "rounds"', 'id: "light"', 'id: "lightChars"', 'id: "ceilingSeconds"', 'id: "pastCeiling"', 'id: "source"', 'id: "remove"']) {
      expect({ id, stood: script.includes(id) }).toEqual({ id, stood: true });
    }
    expect(template).toContain('<DataTable v-if="data" data-draft-processes :data="data.rows" :columns="columns">');
  });

  test("a cell sets its one value with the row's others as they stand", () => {
    expect(script).toContain("body: { provider: row.provider, tier: row.tier, agentName: row.agentName, ...draftValues(row), ...change }");
    expect(template).toContain(':save="(list: string[]) => save(row.original, { [field]: list })"');
    expect(template).toContain(':save="(text: string) => save(row.original, { lightChars: Number(text) })"');
    expect(template).toContain(':save="(text: string) => save(row.original, { ceilingSeconds: Number(text) })"');
    expect(template).toContain(':save="(value: string | number) => saveChoice(row.original, String(value))"');
  });

  test("checks the numbers against the receiver's bounds before they go", () => {
    expect(template).toContain(":check=\"(text: string) => draftNumberFault($t, text, LIGHT_CHARS_MIN, LIGHT_CHARS_MAX)\"");
    expect(template).toContain(":check=\"(text: string) => draftNumberFault($t, text, CEILING_SECONDS_MIN, CEILING_SECONDS_MAX)\"");
  });

  test("takes away only the console's own rows, asked first", () => {
    expect(template).toContain('<UTooltip v-if="row.original.source === \'set\'" :text="$t(\'common.action.delete\')">');
    expect(script).toContain('await askFirst({ title: t("agents.message.draft_process_remove_confirm"), item: keyText(row), confirm: t("common.action.delete") });');
    expect(script).toContain('$fetch("/api/draft-processes", { method: "DELETE", body: { provider: row.provider, tier: row.tier, agentName: row.agentName } })');
  });

  test("adds a key that stands nowhere yet, starting from the row it matches now", () => {
    expect(script).toContain("const from = draftRowFor(data.value.rows, newKey);");
    expect(script).toContain("await save({ ...from, ...newKey }, {});");
    expect(template).toContain(':disabled="keyTaken"');
  });

  test("says a refusal in the pack's words under the box", () => {
    expect(script).toContain('return failureText(failure, t("common.error.save_failed"));');
  });
});

describe("a list's cell", () => {
  test("names each question by the pack's word, the pick as well as the list", () => {
    expect(listTemplate).toContain("{{ draftQuestionLabel($t, name) }}");
    expect(list).toContain('.map((name) => ({ value: name, label: draftQuestionLabel(t, name) }))');
  });

  test("is an ordered pick: each question moved or taken out, final last and taken out only alone", () => {
    expect(listTemplate).toContain("@click=\"list = movedQuestion(list, name, -1)\"");
    expect(listTemplate).toContain("@click=\"list = movedQuestion(list, name, 1)\"");
    expect(listTemplate).toContain('v-if="name !== FINAL_QUESTION || list.length === 1"');
    expect(listTemplate).toContain("(list = withQuestion(list, value))");
    expect(list).toContain("const fault = computed(() => draftListFault(t, list.value, props.catalogue));");
  });
});

describe("the questions", () => {
  test("stand under the table, each text edited in its own box and a new name added", () => {
    expect(template.indexOf("data-draft-questions")).toBeGreaterThan(template.indexOf("data-draft-processes"));
    expect(script).toContain('$fetch("/api/draft-questions", { method: "POST", body: { name, text } })');
    expect(template).toContain(":maxlength=\"QUESTION_TEXT_MAX\"");
    expect(template).toContain("questionNameFault($t, newQuestion.name, catalogue)");
  });
});
