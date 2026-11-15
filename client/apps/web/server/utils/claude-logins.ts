import type { UnitAnswerCall } from "./unit-answer";

// A Claude account signed in from the console (the agency's `docs/cache-fallback.md`, 「Signing an account in from the
// console」): the agency's own codes for a sign-in, each with the pack's sentence. The agency drives the CLI's sign-in;
// the console only hands the address over and the code back, and keeps neither.
export const CLAUDE_LOGIN_CALL: UnitAnswerCall = {
  codes: {
    "not-a-directory": "agents.error.login_not_directory",
    "directory-taken": "agents.error.login_directory_taken",
    "no-sign-in": "agents.error.login_gone",
    "sign-in-refused": "agents.error.login_refused"
  }
};
