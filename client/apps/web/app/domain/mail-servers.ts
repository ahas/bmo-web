// The words and the defaults of the mail servers tab (docs/web.md, 「Organisation」, the mail servers tab; bmo-mail's
// `docs/api.md`, 「Servers」): each protocol's and security's word, the securities a protocol takes, and the usual
// port a protocol listens on for the security chosen, which the form shows as its port's placeholder and sends where
// the port is left empty. The pack's words are named here whole, so the pack's check finds each one asked for.

import type { MailProtocol, MailSecurity, MailServerView } from "#shared/mail-servers";
import type { Translate } from "#shared/wording";

export const MAIL_PROTOCOLS: readonly MailProtocol[] = ["imap", "pop3", "smtp"];

const PROTOCOL_WORDS: Readonly<Record<MailProtocol, string>> = {
  imap: "org_mail.label.protocol_imap",
  pop3: "org_mail.label.protocol_pop3",
  smtp: "org_mail.label.protocol_smtp"
};

const SECURITY_WORDS: Readonly<Record<MailSecurity, string>> = {
  tls: "org_mail.label.security_tls",
  starttls: "org_mail.label.security_starttls",
  none: "org_mail.label.security_none"
};

// Each protocol's securities, the one a new server starts with first; POP3 takes no STARTTLS.
const SECURITIES: Readonly<Record<MailProtocol, readonly MailSecurity[]>> = {
  imap: ["tls", "starttls", "none"],
  pop3: ["tls", "none"],
  smtp: ["starttls", "tls", "none"]
};

// Each protocol's usual port for its security: the TLS port, then the plain one STARTTLS starts on as well, SMTP's
// submission port standing for STARTTLS.
const USUAL_PORTS: Readonly<Record<MailProtocol, Readonly<Record<MailSecurity, number>>>> = {
  imap: { tls: 993, starttls: 143, none: 143 },
  pop3: { tls: 995, starttls: 110, none: 110 },
  smtp: { tls: 465, starttls: 587, none: 25 }
};

/** A protocol's word. */
export function protocolWord(t: Translate, protocol: MailProtocol): string {
  return t(PROTOCOL_WORDS[protocol]);
}

/** A security's word. */
export function securityWord(t: Translate, security: MailSecurity): string {
  return t(SECURITY_WORDS[security]);
}

/** The securities a protocol takes, the one a new server starts with first. */
export function securitiesOf(protocol: MailProtocol): readonly MailSecurity[] {
  return SECURITIES[protocol];
}

/** The port a protocol usually listens on for a security. */
export function usualPort(protocol: MailProtocol, security: MailSecurity): number {
  return USUAL_PORTS[protocol][security];
}

/** The line under a server's name: its protocol, `host:port`, its security and the accounts standing on it. */
export function serverLine(t: Translate, server: MailServerView, count: (value: number) => string): string {
  const parts = [protocolWord(t, server.protocol), `${server.host}:${server.port}`, securityWord(t, server.security)];

  if (server.accountCount > 0) parts.push(t("org_mail.label.accounts", { count: count(server.accountCount) }));

  return parts.join(" · ");
}
