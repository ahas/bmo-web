// What a line read out of a journal may carry that the screen must never show (docs/web.md, 「Monitor's logs tab」):
// a value in the shape of a credential, taken out before the line leaves the server, the value alone going and the
// words around it staying.
//
// Every shape is bounded in how far it reaches around a match, so a line of one word hundreds of thousands of
// characters long is read once rather than searched afresh from every character in it.

// A private key's block, from its head to its foot or the end of the line.
const PRIVATE_KEY = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]{0,40}PRIVATE KEY-----|$)/g;

// The password written into an address: the scheme, the user and the colon stay, and so does the host after it.
const ADDRESS_PASSWORD = /(\b[a-z][a-z0-9+.-]{0,20}:\/\/[^\s:@/]{1,100}:)([^\s@/]{1,200})(@)/gi;

// The value after an authorization header, and the token after a `Bearer` word.
const AUTHORIZATION = /(\bauthorization\s{0,4}[:=]\s{0,4}(?:(?:bearer|basic|token)\s{1,4})?)([^\s"',;]{1,4096})/gi;
const BEARER = /(\bbearer\s{1,4})([A-Za-z0-9._~+/=-]{8,4096})/gi;

// The value of a flag whose name says it holds one.
const FLAG =
  /(--[a-z0-9-]{0,40}(?:password|passwd|token|secret|api-?key|access-?key|private-?key)(?:=|\s{1,4}))("[^"]{0,4096}"|'[^']{0,4096}'|[^\s"']{1,4096})/gi;

// The value assigned to a name that says it holds one, as an environment line or a field of JSON writes it.
const ASSIGNMENT =
  /(\b[A-Za-z0-9_.-]{0,40}(?:token|secret|passw(?:or)?d|api[_-]?key|private[_-]?key|access[_-]?key|credential)[A-Za-z0-9_.-]{0,40}["']?\s{0,4}[:=]\s{0,4})("[^"]{0,4096}"|'[^']{0,4096}'|[^\s"',;}]{1,4096})/gi;

// A provider's or a host's key by its known shape, and a JSON web token.
const KNOWN_KEY =
  /\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,4096}|gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255}|xox[abprs]-[A-Za-z0-9-]{10,255}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096})/g;

// A run of 32 characters or more of a generated key's alphabet; it is a key only where it mixes capitals, small
// letters and digits, which a hash, a commit or a version does not.
const LONG_WORD = /[A-Za-z0-9+_=-]{32,}/g;

// A value that is only a count, a switch or nothing is no credential, so a line about a count of tokens keeps it.
const NO_SECRET = /^["']?(?:\d{1,12}|true|false|null|none|nil|undefined)?["']?$/i;

function generated(word: string): boolean {
  return /[A-Z]/.test(word) && /[a-z]/.test(word) && /\d/.test(word);
}

/** The text with every value in the shape of a credential replaced by `masked`. */
export function maskCredentials(text: string, masked: string): string {
  // A value an earlier shape already masked stays as it is, so a value two shapes find is masked once.
  const kept = (value: string): boolean => NO_SECRET.test(value) || value.startsWith(masked) || masked.startsWith(value);
  const valueAfter = (_whole: string, before: string, value: string, after = ""): string =>
    kept(value) ? `${before}${value}${after}` : `${before}${masked}${after}`;

  return text
    .replace(PRIVATE_KEY, masked)
    .replace(ADDRESS_PASSWORD, (_whole, before: string, _value: string, after: string) => `${before}${masked}${after}`)
    .replace(AUTHORIZATION, (whole, before: string, value: string) => valueAfter(whole, before, value))
    .replace(BEARER, (_whole, before: string) => `${before}${masked}`)
    .replace(FLAG, (whole, before: string, value: string) => valueAfter(whole, before, value))
    .replace(ASSIGNMENT, (whole, before: string, value: string) => valueAfter(whole, before, value))
    .replace(KNOWN_KEY, masked)
    .replace(LONG_WORD, (word) => (generated(word) ? masked : word));
}
