import { wording } from "#shared/wording";

import { AccountRefusal, chainEntry, setChainDelegation } from "./account-service";
import { unitNamed } from "./chain-names";
import { fail } from "./fail";
import { callerOf, organizationFailure } from "./organization";
import { ownerHeaders } from "./owner-key";
import { unitAt, unitHeaders } from "./units";

import type { SignedIn } from "./accounts";
import type { ChainDelegation } from "#shared/organisation-supply";
import type { MailAuth, MailLink, MailProtocol, MailSecurity, MailServerFields, MailServerTestView, MailServerView, MailServersView } from "#shared/mail-servers";

// The mail servers a node offers the people under it (docs/web.md, 「Organisation」, the mail servers tab; bmo-mail's
// `docs/api.md`, 「Servers」): bmo-mail's records, reached with the console's credential for the mail screen,
// `MAIL_TOKEN`, and the signed-in login's owner headers. bmo-mail writes a link's list of servers on the delegation
// chain's kind `mail.servers` in the reader's name, so the account service judges who may change them and a lock
// above; the link's entry and its delegation are read and written on the chain's own routes as the signed-in login.

/** The chain's kind of the servers a link offers, as bmo-mail declares it. */
const MAIL_KIND = "mail.servers";

const PROTOCOLS: readonly MailProtocol[] = ["imap", "pop3", "smtp"];
const SECURITIES: readonly MailSecurity[] = ["tls", "starttls", "none"];
const AUTHS: readonly MailAuth[] = ["password", "none"];

// The codes a call answers with, bmo-mail's and the chain's, each with the pack's key for its sentence.
const CODES: Readonly<Record<string, string>> = {
  forbidden: "org_mail.error.forbidden",
  locked: "org_mail.error.locked",
  "server-in-use": "org_mail.error.in_use",
  "bad-request": "org_mail.error.bad_value",
  "not-found": "org_mail.error.not_found",
  "upstream-failed": "org_mail.error.unavailable",
  "not-ready": "org_mail.error.not_ready",
  "no-such-kind": "org_mail.error.unavailable"
};

/** A refusal bmo-mail answered, with its status and code. */
export class MailRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** What a call came to, in the pack's words. */
export function mailServersFailure(error: unknown): Error {
  if (error instanceof MailRefusal) return fail(error.status, wording(CODES[error.code] ?? "org_mail.error.failed"));

  return organizationFailure(error, CODES);
}

/** The link a request names, `platform` or `unit:<id>`, or a refusal saying it names none. */
export function mailLinkOf(value: unknown): MailLink {
  if (value === "platform") return "platform";

  const unit = typeof value === "string" ? /^unit:([1-9]\d*)$/.exec(value)?.[1] : undefined;

  if (unit === undefined) throw fail(400, wording("organization.error.bad_request"));

  return `unit:${Number(unit)}`;
}

/** A server's id a request names, or a refusal saying it names none. */
export function mailServerIdOf(value: unknown): number {
  const id = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isSafeInteger(id)) throw fail(400, wording("organization.error.bad_request"));

  return id;
}

/** A server's fields as the form sent them, those out of their shape left out for bmo-mail to judge. */
export function mailFieldsOf(body: Record<string, unknown>): Partial<MailServerFields> {
  const fields: Partial<MailServerFields> = {};

  if (typeof body.name === "string") fields.name = body.name;
  if (typeof body.host === "string") fields.host = body.host;
  if (typeof body.port === "number" || body.port === null) fields.port = body.port;
  if (SECURITIES.includes(body.security as MailSecurity)) fields.security = body.security as MailSecurity;
  if (typeof body.tlsName === "string" || body.tlsName === null) fields.tlsName = body.tlsName;
  if (AUTHS.includes(body.auth as MailAuth)) fields.auth = body.auth as MailAuth;

  return fields;
}

/** The protocol a request names, or a refusal saying it names none. */
export function mailProtocolOf(value: unknown): MailProtocol {
  if (!PROTOCOLS.includes(value as MailProtocol)) throw fail(400, wording("organization.error.bad_request"));

  return value as MailProtocol;
}

// One call of bmo-mail's, as the signed-in login; null where bmo-mail is not installed.
async function mailCall<T>(path: string, signed: SignedIn, init: { method?: string; body?: unknown } = {}): Promise<T | null> {
  const mail = unitAt("MAIL");

  if (mail === null) return null;

  let response: Response;

  try {
    response = await fetch(`${mail.address}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...ownerHeaders(signed),
        ...unitHeaders(mail),
        ...(init.body === undefined ? {} : { "content-type": "application/json" })
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
  } catch {
    throw fail(503, wording("org_mail.error.unavailable"));
  }

  if (response.status === 204) return {} as T;

  const answer = (await response.json().catch(() => null)) as { code?: string; error?: string } | null;

  if (!response.ok) throw new MailRefusal(response.status, answer?.code ?? "failed", answer?.error ?? "");

  return answer as T;
}

// A call that changes something: a refusal where bmo-mail is not installed, since the tab offers no change then.
async function mailChange<T>(path: string, signed: SignedIn, init: { method: string; body?: unknown }): Promise<T> {
  const answer = await mailCall<T>(path, signed, init);

  if (answer === null) throw fail(503, wording("org_mail.message.not_installed"));

  return answer;
}

// A server as bmo-mail answers it, reduced to what the tab shows.
function serverView(server: MailServerView): MailServerView {
  const { id, protocol, name, host, port, security, tlsName, auth, mayChange, accountCount } = server;

  return { id, protocol, name, host, port, security, tlsName: tlsName ?? null, auth, mayChange, accountCount };
}

/** A node's servers and its link's standing on the chain as the reader stands to it. */
export async function nodeMailServers(link: MailLink, signed: SignedIn): Promise<MailServersView> {
  // bmo-mail is asked first: it declares its kind on the chain where the account service does not yet know it.
  const page = await mailCall<{ items: MailServerView[] }>(`/servers?link=${encodeURIComponent(link)}`, signed);

  if (page === null) return { installed: false };

  let entry;

  try {
    entry = await chainEntry(MAIL_KIND, link, callerOf(signed));
  } catch (error) {
    if (error instanceof AccountRefusal && error.status === 403) throw fail(403, wording("org_mail.error.forbidden"));

    throw error;
  }

  const servers = page.items.map(serverView);

  return {
    installed: true,
    link,
    incoming: servers.filter((server) => server.protocol !== "smtp"),
    outgoing: servers.filter((server) => server.protocol === "smtp"),
    delegation: entry.delegation,
    writable: entry.writable,
    lockedBy: entry.lockedBy ?? null,
    locker: await unitNamed(entry.lockedBy)
  };
}

// A certificate's name as a new server or a test takes it: none where it is left empty, the host being checked then;
// a change sends the empty name itself, which bmo-mail reads the same way.
function hostChecked(tlsName: string | null | undefined): string | null | undefined {
  return tlsName === "" ? null : tlsName;
}

/** A new server kept at a link, written on the chain by bmo-mail in the reader's name. */
export async function addMailServer(link: MailLink, protocol: MailProtocol, fields: Partial<MailServerFields>, signed: SignedIn): Promise<void> {
  await mailChange("/servers", signed, { method: "POST", body: { link, protocol, ...fields, tlsName: hostChecked(fields.tlsName) } });
}

/** A kept server changed; its protocol stays. */
export async function changeMailServer(id: number, fields: Partial<MailServerFields>, signed: SignedIn): Promise<void> {
  await mailChange(`/servers/${id}`, signed, { method: "PATCH", body: fields });
}

/** A kept server removed, refused while an account stands on it. */
export async function removeMailServer(id: number, signed: SignedIn): Promise<void> {
  await mailChange(`/servers/${id}`, signed, { method: "DELETE" });
}

/** A server reached as a form holds it, nothing kept. */
export async function testMailServer(protocol: MailProtocol, fields: Partial<MailServerFields>, signed: SignedIn): Promise<MailServerTestView> {
  const { host, port, security, tlsName } = fields;
  const answer = await mailChange<{ reached: boolean }>("/server-tests", signed, { method: "POST", body: { protocol, host, port, security, tlsName: hostChecked(tlsName) } });

  return { reached: answer.reached };
}

/** What the units below a link may do with its servers, written on the chain as the signed-in login. */
export async function delegateMailServers(link: MailLink, delegation: ChainDelegation, signed: SignedIn): Promise<void> {
  await setChainDelegation(MAIL_KIND, link, delegation, callerOf(signed));
}
