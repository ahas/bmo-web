import { describe, expect, test } from "bun:test";

// The documents a worker's session prefix carries, as the worker's dialog edits them and its row in the list shows
// them (docs/web.md, the worker's session prefix documents): an ordered list, each line moved up or down or taken away, a path
// field adding one at the end, and one sentence under the field saying what a path is read against. Where an element
// stands and what it is handed is read off the files that ship.

const dialog = await Bun.file(new URL("../../../apps/web/app/components/WorkerSettingsDialog.vue", import.meta.url)).text();
const field = dialog.slice(dialog.indexOf('name="prefixDocuments"'), dialog.indexOf('name="preamble"'));
const list = await Bun.file(new URL("../../../apps/web/app/components/AgentsWorkers.vue", import.meta.url)).text();

describe("a worker's session prefix documents", () => {
  test("stand in the dialog of a new worker and of one being edited, but not of a support worker", () => {
    expect(field.length).toBeGreaterThan(200);
    expect(dialog).toContain(`<UFormField v-if="editSupportOf === ''" :label="$t('agents.label.prefix_documents')" name="prefixDocuments" :help="$t('agents.label.prefix_documents_help')">`);
  });

  test("each line moves up and down and is taken away, and a path field adds one at the end", () => {
    expect(field).toContain('@click="movePrefix(at, -1)"');
    expect(field).toContain('@click="movePrefix(at, 1)"');
    expect(field).toContain('@click="dropPrefix(at)"');
    expect(field).toContain('@keydown.enter.prevent="addPrefix"');
    expect(field).toContain(':disabled="at === 0"');
    expect(field).toContain(':disabled="at === editPrefixDocuments.length - 1"');
  });

  test("are held with the rest of the form and sent whole where they changed", () => {
    expect(dialog).toContain("prefixDocuments: editPrefixDocuments.value,");
    expect(dialog).toContain("JSON.stringify(editPrefixDocuments.value) === JSON.stringify(opened.value.prefixDocuments) ? {} : { prefixDocuments: editPrefixDocuments.value }");
  });

  test("stand on the worker's row under its path, in their order", () => {
    const cell = list.slice(list.indexOf("#cwd-cell"), list.indexOf("#mode-cell"));

    expect(cell).toContain("data-prefix-documents");
    expect(cell).toContain("(row.original.prefixDocuments ?? []).join(' · ')");
  });
});
