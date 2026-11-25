// A person's own local AI as the console shows it (docs/web.md, 「System and organisation」, the supply tab's local AIs at the
// reader's own node; the agency's
// `docs/supply.md`, 「A person's local AI」): a server their own PC reaches, kept by the agency as theirs alone. What a
// screen learns of its key is the secret's name.

/** One local AI of the reader's own. */
export interface LocalAi {
  // The name the reader gave it.
  name: string;
  // Its registration's key on the registry's provider, which a road or a test names.
  model: string;
  // The chat completions address as the reader's PC reaches it.
  url: string;
  // The model the server serves.
  modelName: string;
  // The name of the reader's secret its key is, null for none.
  keyName: string | null;
  enabled: boolean;
}

/** The reader's local AIs, and whether their organisation lets them add one. */
export interface LocalAiView {
  allowed: boolean;
  items: LocalAi[];
}

/** A local AI to try and keep: its name, its base address, its model and its key's secret name. */
export interface LocalAiAsk {
  name: string;
  url: string;
  modelName: string;
  keyName: string | null;
}

/** Whether a name is one a local AI may take: a lowercase letter, then lowercase letters, digits and hyphens. */
export function localAiNamed(name: string): boolean {
  return /^[a-z][a-z0-9-]{0,23}$/.test(name.trim());
}
