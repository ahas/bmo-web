import type { Ref } from "vue";

// A choice of the signed-in account's that the server keeps against it and the console reads it by
// — the theme and the palette (docs/web.md, 「Themes」, 「Palettes」): read from the server for the page
// it sends, carried to the browser with it, and changed in the settings. Each choice says where it is
// kept, the field its answer carries it in, which values are choices at all and what stands for none.
export interface KeptChoice {
  // The name the page carries it under from the server to the browser.
  key: string;
  address: string;
  field: string;
  isChoice: (value: unknown) => value is string;
  fallback: string;
}

export function useKeptChoice(choice: KeptChoice): Ref<string> {
  return useState<string>(choice.key, () => choice.fallback);
}

// The choice as the server keeps it: the fallback where the server names none it knows, null where it could not be
// read, which says nothing of the choice, so the caller keeps what it holds.
export async function readKeptChoice(choice: KeptChoice, fetcher: (address: string) => Promise<unknown>): Promise<string | null> {
  try {
    const answer = (await fetcher(choice.address)) as Record<string, unknown>;
    const value = answer[choice.field];

    return choice.isChoice(value) ? value : choice.fallback;
  } catch {
    return null;
  }
}

// A value chosen: the console takes it at once, and it is kept against the account. Where the server
// refuses it the console goes back to what was kept, and the refusal is thrown to the screen.
export async function keepChoice(choice: KeptChoice, chosen: Ref<string>, value: string): Promise<void> {
  const before = chosen.value;

  chosen.value = value;

  try {
    await $fetch(choice.address, { method: "PUT", body: { [choice.field]: value } });
  } catch (error) {
    chosen.value = before;
    throw error;
  }
}
