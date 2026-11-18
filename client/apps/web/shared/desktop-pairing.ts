// The desktop pairing page's address (docs/web.md, 「The desktop pairing page」): its path under the console's base,
// and the mark the address the app is answered with carries, which tells the page it fills the app's own window.

/** The path of the page a pairing is approved on, under the console's base. */
export const PAIRING_PAGE = "/desktop/pair";

/** The query key and value marking the page as opened in the desktop app's window. */
export const IN_APP_KEY = "in";
export const IN_APP_VALUE = "app";

/** The page's address for a code, relative to the console's base, as the app is answered with it. */
export function appPairingPath(code: string): string {
  return `${PAIRING_PAGE}?code=${encodeURIComponent(code)}&${IN_APP_KEY}=${IN_APP_VALUE}`;
}

/** Whether an address's query marks the page as opened in the app's window. A link can carry the mark as well, so it
 * says only where the app's code is shown, never whether the code is compared. */
export function openedInApp(query: Readonly<Record<string, unknown>>): boolean {
  return query[IN_APP_KEY] === IN_APP_VALUE;
}

/** Whether an address within the console is the pairing page's, with or without its query. */
export function isPairingPath(path: string): boolean {
  return path === PAIRING_PAGE || path.startsWith(`${PAIRING_PAGE}?`) || path.startsWith(`${PAIRING_PAGE}#`);
}
