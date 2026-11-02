import { describe, expect, test } from "bun:test";

// A supervisor's settings (docs/web.md, 「Agent management screen」, the supervisors tab, and 「Agent screen」): one form
// with one save — its own settings, its provider order among them, then the companion's block or the texts its
// system prompt is composed of — opened by the supervisors tab, the supervisor's own screen and a room alike.

const read = async (name: string) => await Bun.file(new URL(`../../../apps/web/app/${name}`, import.meta.url)).text();
const server = async (name: string) => await Bun.file(new URL(`../../../apps/web/server/${name}`, import.meta.url)).text();

const page = await read("pages/agents/[name].vue");
const dialog = await read("components/SupervisorSettingsDialog.vue");
const fields = await read("components/SupervisorFields.vue");
const documents = await read("components/ChatDocumentsFields.vue");
const companionDialog = await read("components/CompanionSettingsDialog.vue");
const tab = await read("components/AgentsSupervisors.vue");
const listing = await server("api/chat-documents.get.ts");
const changing = await server("api/chat-documents/[documentName].patch.ts");
const patch = await server("api/supervisors/[name].patch.ts");

describe("a supervisor's settings", () => {
  test("are one dialog, opened by the tab, the supervisor's own screen and a room's companion tools", () => {
    expect(page).toContain('<SupervisorSettingsDialog v-if="settingsKind === \'supervisor\'" v-model:open="settingsOpen" :name="name"');
    expect(tab).toContain("<SupervisorSettingsDialog");
    expect(companionDialog).toContain('<SupervisorSettingsDialog v-model:open="open" :name="props.meta.name"');
  });

  test("hold one save at the foot over every block, the supervisor's own change sent first", () => {
    expect(dialog).toContain("useFormSave(t)");
    expect(dialog.indexOf("<SupervisorFields")).toBeLessThan(dialog.indexOf("<CompanionSettingsBlock"));
    expect(fields).toContain("useFormPart(");
    expect(documents).toContain("useFormPart(");
    expect(fields).toContain("<ProviderOrderField");
  });

  test("read the three documents, each saved as the owner's text or put back to its file with the form's save", () => {
    expect(documents).toContain('$fetch<ChatDocumentsView>("/api/chat-documents")');
    expect(documents).toContain('{ action: "reset" }');
    expect(documents).toContain('{ action: "save", text: drafts[document.name] }');
    expect(documents).toContain("chat_document_opening");
    expect(documents).toContain("chat_document_absolute_rules");
    expect(documents).toContain("chat_document_manual");
  });

  test("are carried to the agency by the console's own routes", () => {
    expect(listing).toContain('agencyRoute<ChatDocumentsView>("GET", "/chat-documents")');
    expect(changing).toContain('agencyRoute<ChatDocumentView>("PATCH", `/chat-documents/${encodeURIComponent(name)}`');
    expect(patch).toContain("supervisorChangeOf(await readBody<unknown>(event))");
    expect(patch).toContain("requireAdministrator(event)");
  });
});
