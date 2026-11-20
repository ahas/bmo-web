import type { SupervisorSettingsView } from "#shared/axes";
import type { H3Event } from "h3";

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const record = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});

/**
 * The settings a supervisor whose turns its settings' pieces make holds of its own (the agency's `docs/api.md`,
 * 「supervisors」, a supervisor's settings): its generation settings with their bounds, its reference switch, its
 * persona beside its persona file's text, and the system prompt its next turn sends.
 */
export function supervisorSettingsOf(answer: unknown): SupervisorSettingsView {
  const item = record(answer);
  const settings = record(item.settings);
  const system = record(item.system);

  return {
    name: text(item.agent) ?? "",
    sessions: list(item.sessions).length,
    generation: (settings.generation ?? {}) as Record<string, number | boolean>,
    generationSettings: list(item.generationSettings),
    referenceOn: settings.referenceOn === true,
    persona: text(settings.persona),
    personaFile: text(item.personaFile) ?? "",
    system: { text: text(system.text) ?? "", characters: typeof system.characters === "number" ? system.characters : 0, hash: text(system.hash) ?? "" }
  };
}

/** One supervisor's own settings as the agency holds them now, read for the person signed in on `madeFor`. */
export async function readSupervisorSettings(name: string, madeFor: H3Event): Promise<SupervisorSettingsView> {
  return supervisorSettingsOf(await agencyCall(agency(madeFor).GET("/supervisors/{supervisorName}/settings", { params: { path: { supervisorName: name } } })));
}
