import { describe, expect, test } from "bun:test";

// The draft-process table on the supervisors tab (docs/web.md, 「Agent management screen」, the supervisors tab's draft
// process), read from the files that ship: what a rendered screen would not name is where each cell's value goes, that a set carries the whole row,
// that only the console's own rows can be taken away, and that refusals are the pack's sentences.

const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/components/", import.meta.url))).text();
const source = await read("./AgentsDraftProcesses.vue");
const list = await read("./DraftListCell.vue");
const page = await Bun.file(new URL("../../../apps/web/app/pages/agents/index.vue", import.meta.url)).text();
const supervisors = await read("./AgentsSupervisors.vue");
const template = source.slice(0, source.indexOf("<script"));
const script = source.slice(source.indexOf("<script"));
const listTemplate = list.slice(0, list.indexOf("<script"));

describe("the table", () => {
  test("stands on the supervisors tab under the supervisors' table, read by the browser alone under the key the search reads", () => {
    expect(supervisors.indexOf("<AgentsDraftProcesses")).toBeGreaterThan(supervisors.indexOf("<SettingsTable"));
    expect(script).toContain('useFetch<DraftProcessesView>("/api/draft-processes", { key: "draft-processes", server: false, lazy: true })');
    expect(page).toContain('useFetch<DraftProcessesView>("/api/draft-processes", { key: "draft-processes", lazy: true, server: false, immediate: readable("supervisors") })');
  });

  test("is a row per key with a column for each value and none for where it comes from", () => {
    for (const id of ['accessorKey: "provider"', 'accessorKey: "tier"', 'accessorKey: "agentName"', 'id: "rounds"', 'id: "light"', 'id: "lightChars"', 'id: "remove"']) {
      expect({ id, stood: script.includes(id) }).toEqual({ id, stood: true });
    }
    // What the receiver reads no more stands in no column.
    expect(script).not.toContain('id: "ceilingSeconds"');
    expect(script).not.toContain('id: "pastCeiling"');
    expect(script).not.toContain('id: "source"');
    expect(template).toContain("markedDefault($t, draftKeyText($t, row.original.agentName), row.original.source === 'default')");
    expect(template).toContain("markedDefault($t, row.original.name, row.original.source === 'default')");
    expect(template).toContain('<SettingsTable v-if="data" data-draft-processes :data="data.rows" :columns="columns">');
  });

  test("stands every column at its content's width, a list under a ceiling", () => {
    expect(script).toContain('{ accessorKey: "agentName", header: t("agents.label.draft_agent") }');
    expect(script).toContain('{ id: "rounds", header: t("agents.label.draft_rounds"), ceiling: 304 }');
    expect(template).toContain('class="max-w-full truncate font-mono text-sm text-highlighted"');
  });

  test("a cell sets its one value with the row's others as they stand", () => {
    expect(script).toContain("body: { provider: row.provider, tier: row.tier, agentName: row.agentName, ...draftValues(row), ...change }");
    expect(template).toContain(':save="(list: string[], off: string[]) => saveList(row.original, field, list, off)"');
    expect(template).toContain(':save="(text: string) => save(row.original, { lightChars: Number(text) })"');
  });

  test("a list is set with what the row has switched off, a question taken out of both lists off no more", () => {
    expect(template).toContain(':off="row.original.off"');
    expect(script).toContain("return await save(row, { [field]: list, off: keptOff(off, lists.rounds, lists.light) });");
  });

  test("stands a question switched off in its list, dimmed and struck through", () => {
    expect(template).toContain('v-for="(part, index) in draftListParts(row.original[field], row.original.off)"');
    expect(template).toContain(":class=\"part.off ? 'text-dimmed line-through' : ''\"");
  });

  test("checks the numbers against the receiver's bounds before they go", () => {
    expect(template).toContain(":check=\"(text: string) => draftNumberFault($t, text, LIGHT_CHARS_MIN, LIGHT_CHARS_MAX)\"");
  });

  test("takes away only the console's own rows, asked first", () => {
    expect(template.split('<UTooltip v-if="row.original.source === \'set\' && !props.readonly" :text="$t(\'common.action.delete\')">')).toHaveLength(3);
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

  test("carries a checkbox on every question but final, which switches it off or on where it stands", () => {
    expect(listTemplate).toContain('v-if="name !== FINAL_QUESTION"');
    expect(listTemplate).toContain(':model-value="!offs.includes(name)"');
    expect(listTemplate).toContain("(offs = switchedQuestion(offs, name, on === true))");
    expect(list).toContain("const answer = await props.save([...list.value], [...offs.value]);");
    expect(list).toContain("offs.value = [...props.off];");
  });
});

describe("the questions", () => {
  test("stand under the table, each text edited in its own box and a new name added", () => {
    expect(template.indexOf("data-draft-questions")).toBeGreaterThan(template.indexOf("data-draft-processes"));
    expect(script).toContain('$fetch("/api/draft-questions", { method: "POST", body: { name, text } })');
    expect(template).toContain(":maxlength=\"QUESTION_TEXT_MAX\"");
    expect(template).toContain("questionNameFault($t, newQuestion.name, catalogue)");
  });

  test("take the console's text of one away, asked first, the refusal standing under the table", () => {
    expect(script).toContain('await askFirst({ title: t("agents.message.draft_question_remove_confirm"), item: question.name, confirm: t("common.action.delete") });');
    expect(script).toContain('$fetch("/api/draft-questions", { method: "DELETE", body: { name: question.name } })');
    expect(template).toContain("{{ questionActionFailed }}");
  });
});
