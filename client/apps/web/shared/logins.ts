// A login, the name an account signs in with (docs/accounts.md, 「Users and senders」): one line of 1 to 254
// characters with no control character, the spaces around it trimmed, an email address among them. Every place
// the console reads a login reads it here — the sign-in, an invitation's acceptance, a rename and
// `scripts/user.ts` — so every login an invitation makes is one the sign-in takes.

export const MIN_LOGIN_LENGTH = 1;
export const MAX_LOGIN_LENGTH = 254;

const CONTROL = /\p{Cc}/u;

// The login as it is kept, or null where it is none.
export function loginOf(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const login = value.trim();
  const length = [...login].length;

  if (length < MIN_LOGIN_LENGTH || length > MAX_LOGIN_LENGTH || CONTROL.test(login)) {
    return null;
  }

  return login;
}
