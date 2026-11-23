import type { Ref } from "vue";

// The agent login step (docs/web.md, 「The join page」): whether the signed-in person must set up a login of their own
// before anything else opens to them, read once a session and again as they start from the step's page.

/** The address of the step's page. */
export const AGENT_LOGIN_PATH = "/agent-login";

/** Whether the step stands for the signed-in person: null until it has been read. */
export function agentLoginState(): Ref<boolean | null> {
  return useState<boolean | null>("agent-login-needed", () => null);
}

/** Whether the step stands for the signed-in person, read where it has not been yet; a read that fails asks nothing. */
export async function agentLoginNeeded(): Promise<boolean> {
  const state = agentLoginState();

  if (state.value !== null) return state.value;

  // Drawn on the server, the question carries the reader's own sign-in; a read that fails is asked again next time.
  const fetcher = import.meta.server ? useRequestFetch() : $fetch;
  const needed = await fetcher<{ needed: boolean }>("/api/me/agent-login").then(
    (answer) => answer.needed,
    () => null
  );

  state.value = needed;

  return needed === true;
}
