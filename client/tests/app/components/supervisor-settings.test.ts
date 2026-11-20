import { describe, expect, test } from "bun:test";

// A supervisor's settings (docs/web.md, 「Agent management screen」, the supervisors tab, and 「Agent screen」): one form
// with one save — its own settings, its provider order among them, then its generation settings, reference, persona and
// system prompt, or the texts its system prompt is composed of — opened by the supervisors tab and the supervisor's own
// screen alike.

const read = async (name: string) => await Bun.file(new URL(`../../../apps/web/app/${name}`, import.meta.url)).text();
const server = async (name: string) => await Bun.file(new URL(`../../../apps/web/server/${name}`, import.meta.url)).text();

const page = await read("pages/agents/[name].vue");
const dialog = await read("components/SupervisorSettingsDialog.vue");
const fields = await read("components/SupervisorFields.vue");
const documents = await read("components/ChatDocumentsFields.vue");
const pieces = await read("components/SupervisorPiecesFields.vue");
const tab = await read("components/AgentsSupervisors.vue");
const listing = await server("api/chat-documents.get.ts");
const changing = await server("api/chat-documents/[documentName].patch.ts");
const patch = await server("api/supervisors/[name].patch.ts");
const road = await read("components/RoadField.vue");
const roleAgents = await read("components/RoleAgentsField.vue");

describe("a supervisor's settings", () => {
  test("are one dialog, opened by the tab and the supervisor's own screen", () => {
    expect(page).toContain('<SupervisorSettingsDialog v-if="writable && settingsKind === \'supervisor\'" v-model:open="settingsOpen" :name="name"');
    expect(tab).toContain("<SupervisorSettingsDialog");
  });

  test("hold one save at the foot over every block, the supervisor's own change sent first", () => {
    expect(dialog).toContain("useFormSave(t)");
    expect(dialog.indexOf("<SupervisorFields")).toBeLessThan(dialog.indexOf("<SupervisorPiecesFields"));
    expect(pieces).toContain("useFormPart(");
    expect(pieces).toContain("<GenerationFields");
    expect(pieces).toContain("`/api/supervisors/${encodeURIComponent(view.value.name)}/settings`");
    expect(fields).toContain("useFormPart(");
    expect(documents).toContain("useFormPart(");
    expect(fields).toContain("<RoadField");
  });

  test("read the three documents, each saved as the owner's text or put back to its file with the form's save", () => {
    expect(documents).toContain('$fetch<ChatDocumentsView>("/api/chat-documents")');
    expect(documents).toContain('{ action: "reset" }');
    expect(documents).toContain('{ action: "save", text: drafts[document.name] }');
    expect(documents).toContain("chat_document_opening");
    expect(documents).toContain("chat_document_absolute_rules");
    expect(documents).toContain("chat_document_manual");
  });

  // A road's advisor (docs/web.md, 「Agent management screen」): a supervisor's waits for the form's save, a role
  // agent's is saved as it is picked, and a provider or a model picked names none.
  test("hold a road's advisor where its provider takes one, set back to none by a provider or a model picked", () => {
    expect(road).toContain("advisorChoices(t, provider.value, models.value.view, road.value.advisor)");
    expect(road).toContain(':error="errorAt(\'advisor\')"');
    expect(road).toContain("change({ model, effort: keptEffort(model), advisor: null });");
    expect(roleAgents).toContain("advisorChoices(t, providerOf(agent.provider), modelsOf(agent.provider).view, agent.advisor)");
    expect(roleAgents).toContain("save(agent, { advisor: advisorPicked(value) })");
    expect(roleAgents).toContain("save(agent, { model, effort: keptEffort(agent, model), advisor: null })");
    expect(roleAgents).toContain("save(agent, { provider, model: first.id, effort: null, advisor: null })");
    expect(roleAgents).toContain('$t("agents.message.advisor_follows")');
  });

  test("are carried to the agency by the console's own routes", () => {
    expect(listing).toContain('agencyRoute<ChatDocumentsView>("GET", "/chat-documents")');
    expect(changing).toContain('agencyRoute<ChatDocumentView>("PATCH", `/chat-documents/${encodeURIComponent(name)}`');
    expect(patch).toContain("supervisorChangeOf(await readBody<unknown>(event))");
    expect(patch).toContain("signedInUser(event)");
  });
});
