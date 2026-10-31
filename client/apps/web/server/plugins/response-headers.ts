import { removeResponseHeader, setResponseHeaders } from "h3";

import type { H3Event } from "h3";

// The lines every answer of the console carries for the browser (docs/web.md, 「Access」): a file is read as the type
// it is answered as, an address of the console reaches no other site as a referrer, and no other site frames a
// console page. Strict transport is the reverse proxy's to set.

/** The console's own lines, by the name each is answered under. */
export const CONSOLE_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "content-security-policy": "frame-ancestors 'none'"
} as const;

/** Sets the console's lines on an answer as its request arrives, so a line the route sets after — a relayed unit's
 * own — stands in place of the console's. */
export function standConsoleHeaders(event: H3Event): void {
  setResponseHeaders(event, CONSOLE_HEADERS);
}

/** Takes off the name of the framework that drew an answer, which the page renderer sets as it draws. */
export function dropPoweredBy(event: H3Event): void {
  removeResponseHeader(event, "x-powered-by");
}

/** The hooks the two lines stand on, as the server's app carries them. */
export interface ResponseHooks {
  hook(name: "request" | "beforeResponse", run: (event: H3Event) => void): unknown;
}

/** Stands the console's lines on the server's request hook and the framework's name's removal on its response hook. */
export function standResponseHeaders(nitro: { hooks: ResponseHooks }): void {
  nitro.hooks.hook("request", standConsoleHeaders);
  nitro.hooks.hook("beforeResponse", dropPoweredBy);
}

export default defineNitroPlugin(standResponseHeaders);
