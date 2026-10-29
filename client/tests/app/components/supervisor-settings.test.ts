import { describe, expect, test } from "bun:test";

// The chat agent's own settings on its screen (docs/web.md, 「Agent screen」): its model, kept on the agency's
// route or on a fixed registered model, and the texts its system prompt is composed of, each saved or put
// back to its file.

const read = async (name: string) => await Bun.file(new URL(`../../../apps/web/app/${name}`, import.meta.url)).text();
const server = async (name: string) => await Bun.file(new URL(`../../../apps/web/server/${name}`, import.meta.url)).text();

const page = await read("pages/agents/[name].vue");
const dialog = await read("components/SupervisorSettingsDialog.vue");
const listing = await server("api/chat-documents.get.ts");
const changing = await server("api/chat-documents/[documentName].patch.ts");
const model = await server("api/agent-model.post.ts");

describe("the chat agent's settings", () => {
  test("stand on the agent screen of the agent whose turn is the window's", () => {
    expect(page).toContain('row.value?.turnShape === "window") return "supervisor"');
    expect(page).toContain("<SupervisorSettingsDialog");
  });

  test("name the model the work key resolves to and open its road on the routes tab", () => {
    expect(dialog).toContain("props.agent.modelLabel ?? props.agent.model");
    expect(dialog).toContain("/agents?tab=routes&key=");
    expect(dialog).toContain('$t("agents.label.supervisor_model_route"');
  });

  test("keep its model on the agency's route or on a fixed registered model", () => {
    expect(dialog).toContain("props.agent.pinnedModel");
    expect(dialog).toContain("supervisor_model_method_route");
    expect(dialog).toContain("supervisor_model_method_fixed");
    expect(dialog).toContain("one.name ?? one.model");
    expect(dialog).toContain('$fetch("/api/agent-model"');
    expect(page).toContain(":reread=\"refreshCatalogue\"");
  });

  test("read the three documents, each saved as the owner's text or put back to its file", () => {
    expect(dialog).toContain('$fetch<ChatDocumentsView>("/api/chat-documents")');
    expect(dialog).toContain('action: "save"');
    expect(dialog).toContain('action: "reset"');
    expect(dialog).toContain("chat_document_opening");
    expect(dialog).toContain("chat_document_absolute_rules");
    expect(dialog).toContain("chat_document_manual");
  });

  test("are carried to the agency by the console's own routes", () => {
    expect(listing).toContain('agencyRoute<ChatDocumentsView>("GET", "/chat-documents")');
    expect(changing).toContain('agencyRoute<ChatDocumentView>("PATCH", `/chat-documents/${encodeURIComponent(name)}`');
    expect(changing).toContain("by: session.user.name");
  });

  test("carry the model method to the agency's own agent change", () => {
    expect(model).toContain('agency().PATCH("/agents/{agentName}"');
    expect(model).toContain('body.method === "route" ? { method: "route" } : { method: "fixed", registration: body.registration }');
    expect(model).toContain("isAgentName(body?.agent)");
  });
});
