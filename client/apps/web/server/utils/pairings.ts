import { joinURL } from "ufo";

import { AccountRefusal, AccountServiceDown } from "./account-service";
import { fail } from "./fail";

import { appPairingPath } from "#shared/desktop-pairing";
import { wording } from "#shared/wording";

import type { H3Event } from "h3";

// The desktop app's pairing as the console hands it on (docs/web.md, 「Access」 and 「The desktop pairing page」;
// docs/accounts.md, 「Desktop pairing」): the address of the page a pairing is approved on, and the account service's
// codes said in the pack's words.

// The account service's codes on the pairing routes (docs/boundary.md, 「Desktop pairing」), each with its sentence.
const PAIRING_CODES: Readonly<Record<string, string>> = {
  "pairing-closed": "pairing.error.closed",
  "too-many-pairings": "pairing.error.too_many",
  "not-found": "pairing.error.not_found",
  "no-hub": "pairing.error.no_hub",
  left: "pairing.error.left"
};

/** What a pairing call came to, said in the pack's words, with the service's status where it named a code. */
export function pairingFailure(error: unknown): Error {
  if (error instanceof AccountServiceDown) return fail(503, wording("pairing.error.unreachable"));

  if (error instanceof AccountRefusal) {
    const key = PAIRING_CODES[error.code];

    return fail(key === undefined ? 502 : error.status, wording(key ?? "pairing.error.failed"));
  }

  return fail(500, wording("pairing.error.failed"));
}

/**
 * The address of the page a pairing's code is approved on, marked as the app's own window opens it: under the
 * console's public address where its settings name one, and under the address the request reached otherwise.
 */
export function approveUrl(event: H3Event, code: string): string {
  const configured = String(useRuntimeConfig(event).public.consoleAddress ?? "").trim();
  const base = configured !== "" ? configured : joinURL(getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin, useRuntimeConfig(event).app.baseURL);

  return joinURL(base, appPairingPath(code));
}
