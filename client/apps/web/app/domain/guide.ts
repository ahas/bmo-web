import type { Ref } from "vue";

import { GUIDE_PATH } from "#shared/guide";

// Whether the start guide opens by itself for the signed-in reader (docs/web.md, 「The start guide」), read once a
// session: a member whose own supply is required and holds none on is led to it from every page until the guide reads
// it again and finds one on; the administrator is led to it once.

export { GUIDE_PATH };

/** Whether the guide opens by itself now: null until it has been read. */
export function guideOpensState(): Ref<boolean | null> {
  return useState<boolean | null>("guide-opens", () => null);
}

/** Whether the guide opens by itself, read where it has not been yet; a read that fails asks nothing. */
export async function guideOpens(): Promise<boolean> {
  const state = guideOpensState();

  if (state.value !== null) return state.value;

  // Drawn on the server, the question carries the reader's own sign-in; a read that fails is asked again next time.
  const fetcher = import.meta.server ? useRequestFetch() : $fetch;
  const opens = await fetcher<{ opens: boolean }>("/api/me/guide/opens").then(
    (answer) => answer.opens,
    () => null
  );

  state.value = opens;

  return opens === true;
}

/** The guide's question asked again, as its page does once a step may have changed the answer. */
export async function guideOpensAgain(): Promise<boolean> {
  guideOpensState().value = null;

  return await guideOpens();
}
