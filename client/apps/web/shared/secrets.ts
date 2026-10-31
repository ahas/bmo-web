// The name a secret is kept under in the server's store (docs/web.md, 「Settings」, the secret store section;
// docs/boundary.md, 「The secret store」): a plain file name of letters, digits, `.`, `_` and `-`, beginning with no
// dot and not ending in the suffix the store keeps the value before under. The server holds the same rule; the
// console says it before asking.

export const SECRET_NAME_MAX = 200;
export const SECRET_PREVIOUS = ".previous";

export function secretNameIsPlain(name: string): boolean {
  return name.length > 0
    && name.length <= SECRET_NAME_MAX
    && /^[A-Za-z0-9._-]+$/.test(name)
    && !name.startsWith(".")
    && !name.endsWith(SECRET_PREVIOUS);
}
