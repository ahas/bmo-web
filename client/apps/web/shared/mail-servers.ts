import type { DecidedBy } from "./organisation-agents";
import type { ChainDelegation } from "./organisation-supply";

// The mail servers a node of the organisation tree offers the people under it (docs/web.md, 「System and organisation」, the
// mail servers tab; bmo-mail's `docs/api.md`, 「Servers」): bmo-mail's records, each kept once and chosen by any number
// of mail accounts, and the link's list of them on the delegation chain's kind `mail.servers`.

export type MailProtocol = "imap" | "pop3" | "smtp";
export type MailSecurity = "tls" | "starttls" | "none";
export type MailAuth = "password" | "none";

/** The link of the chain a node's servers stand at: the platform's, or a company's or a unit's. */
export type MailLink = "platform" | `unit:${number}`;

/** One server as the tab shows it. */
export interface MailServerView {
  id: number;
  protocol: MailProtocol;
  name: string;
  host: string;
  port: number;
  security: MailSecurity;
  // The name its certificate is checked against; null for the host.
  tlsName: string | null;
  auth: MailAuth;
  // Whether the reader may change and remove it now.
  mayChange: boolean;
  // How many accounts stand on it, every owner's together.
  accountCount: number;
}

/** A server's fields as the form sends them; the protocol is the new server's alone. */
export interface MailServerFields {
  name: string;
  host: string;
  port: number | null;
  security: MailSecurity;
  tlsName: string | null;
  auth: MailAuth;
}

/** A node's servers (`GET /api/organization/mail-servers?link=`), or the word that bmo-mail is not installed. */
export type MailServersView =
  | { installed: false }
  | {
      installed: true;
      link: MailLink;
      incoming: MailServerView[];
      outgoing: MailServerView[];
      delegation: ChainDelegation;
      // Whether the reader may change the link's servers now.
      writable: boolean;
      // The link whose lock above holds it, where one does.
      lockedBy: string | null;
      // Who locks it above the node, for the line saying so.
      locker: DecidedBy;
    };

/** What a connection test came to (`POST /api/organization/mail-server-tests`). */
export interface MailServerTestView {
  reached: boolean;
}
