// Account security as the console's screens read it (docs/web.md, 「Settings」, the account section's security, and 「Organisation」, the
// people tab): what stands of an account, its devices, its tries, and the browser and address a row is shown by.

import Bowser from "bowser";

import type { DecidedBy } from "./organisation-agents";

/** What stands of an account's security, as the account service answers it. */
export interface AccountSecurityView {
  email: string;
  emailVerified: boolean;
  secondFactor: boolean;
  recoveryCodesLeft: number;
  secondFactorRequired: boolean;
  enabled: boolean;
  left: boolean;
  lastSignIn?: number | null;
  mail: boolean;
}

/** One session the sign-in made. */
export interface DeviceView {
  id: number;
  address: string;
  userAgent: string;
  madeAt: number;
  seenAt: number;
  current: boolean;
}

/** How a sign-in tried ended. */
export type TryOutcome = "signed-in" | "second-factor" | "wrong-password" | "wrong-code" | "throttled" | "locked" | "disabled";

/** One sign-in tried. */
export interface TryView {
  at: number;
  outcome: TryOutcome;
  address: string;
  userAgent: string;
}

/** The reader's own account's security, devices and newest tries. */
export interface OwnSecurity {
  security: AccountSecurityView;
  devices: DeviceView[];
  tries: TryView[];
}

/** A tried outcome that is a failure, drawn in the error colour. */
export function failedTry(outcome: TryOutcome): boolean {
  return outcome === "wrong-password" || outcome === "wrong-code" || outcome === "locked" || outcome === "throttled" || outcome === "disabled";
}

/** The pack's key for each outcome. */
const OUTCOME_KEYS: Readonly<Record<TryOutcome, string>> = {
  "signed-in": "security.label.outcome_signed_in",
  "second-factor": "security.label.outcome_second_factor",
  "wrong-password": "security.label.outcome_wrong_password",
  "wrong-code": "security.label.outcome_wrong_code",
  throttled: "security.label.outcome_throttled",
  locked: "security.label.outcome_locked",
  disabled: "security.label.outcome_disabled"
};

/** The pack's key for an outcome. */
export function outcomeKey(outcome: TryOutcome): string {
  return OUTCOME_KEYS[outcome];
}

/** The browser and the operating system a user agent names, each empty where it names none. */
export function browserOfAgent(agent: string): { browser: string; system: string } {
  if (agent.trim() === "") return { browser: "", system: "" };

  const parsed = Bowser.parse(agent);
  const browser = [parsed.browser.name, parsed.browser.version?.split(".")[0]].filter((part) => part !== undefined && part !== "").join(" ");
  const system = [parsed.os.name, parsed.os.versionName ?? parsed.os.version].filter((part) => part !== undefined && part !== "").join(" ");

  return { browser, system };
}

/** An address coarsened to its first half: `203.0.*` for IPv4, the first two groups and `*` for IPv6. */
export function coarseAddress(address: string): string {
  const trimmed = address.trim();

  if (trimmed.includes(":")) {
    const groups = trimmed.split(":").filter((group) => group !== "");

    return groups.length === 0 ? trimmed : `${groups.slice(0, 2).join(":")}:*`;
  }

  const parts = trimmed.split(".");

  return parts.length === 4 ? `${parts[0]}.${parts[1]}.*` : trimmed;
}

/** Whether a node of the organisation asks a second factor of its people, as the reader stands to it. */
export interface SecondFactorRequirement {
  // The link's own word, null where it follows above.
  own: boolean | null;
  // What stands for the link, its own word or what the links above come to.
  stands: boolean;
  delegation: "allow" | "lock" | "inherit";
  writable: boolean;
  lockedBy: string | null;
  locker: DecidedBy;
}
