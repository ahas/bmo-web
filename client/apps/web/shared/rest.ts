// The rest: the whole deployment resting while the platform's Claude logins are at their usage limit or the
// service is down (the agency's `docs/api.md`, 「accounts, rest and usage」; docs/web.md, 「What each agent is doing
// now」), and the owner's private chat's notice switches (the receiver's `docs/api.md`, 「Notices」).

/** Whether the deployment rests, until when and of what kind, with the agents whose road the rest closes. */
export interface RestView {
  resting: boolean;
  // The moment the rest is kept to, epoch seconds; none where it rests to no known moment, or does not rest.
  until: number | null;
  // `limit` for the logins' usage limit, `outage` for the service being down; none where it does not rest.
  kind: "limit" | "outage" | null;
  // The supervisors the reader's lists hold whose road takes no turn while it rests, by name.
  supervisors: string[];
  // The role agents the reader's lists hold whose road the rest closes, by name: those on Claude Code on the
  // platform's own supply.
  agents: string[];
  // Whether the reader may end the rest by hand: the platform administrator alone.
  mayEnd: boolean;
}

/** The rest as it stands after it was ended by hand, and whether it rested before. */
export interface RestEndView extends RestView {
  ended: boolean;
}

/** The owner's private chat's two notice switches: the going-down and back notices, and the rest's beginning and
 * lifting. */
export interface NoticeSwitchesView {
  restart: boolean;
  rest: boolean;
}

export type NoticeSwitchKind = keyof NoticeSwitchesView;

export const NOTICE_SWITCH_KINDS: readonly NoticeSwitchKind[] = ["restart", "rest"];
